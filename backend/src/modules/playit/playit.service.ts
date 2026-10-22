import { getErrorMessage } from "@/core/utils/error";
import { killPromise } from "@/core/utils/promiseKill";
import { PlayitTunnelsRepository } from "@/modules/database/repositories/playit-tunnels.repository";
import { ServersRepository } from "@/modules/database/repositories/servers.repository";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type {
  IPlayitAgentStatus,
  IPlayitDiagnosticCheck,
  IPlayitDiagnosticReport,
  IPlayitRemoteTunnel,
  IPlayitTunnel,
  PlayitAgentState,
} from "@shared/types/playit.types";
import { ServerStatus } from "@shared/types/server/server.types";
import { ChildProcess, spawn } from "child_process";
import * as crypto from "crypto";
import * as dns from "dns";
import * as fs from "fs";
import { promises as fsp } from "fs";
import ky from "ky";
import * as net from "net";
import * as path from "path";
import {
  CreateAutoPlayitTunnelDto,
  CreatePlayitTunnelDto,
  UpdatePlayitTunnelDto,
} from "./dto/playit.dto";

const OFFICIAL_AGENT_URL_WIN =
  "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe";
const OFFICIAL_AGENT_URL_LINUX =
  "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-x86_64";

@Injectable()
export class PlayitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayitService.name);
  private agentProcess: ChildProcess | null = null;
  private agentPid: number | null = null;
  private agentPath: string | null = null;
  private claimCode: string | null = null;
  private claimUrl: string | null = null;
  private claimPollTimer: NodeJS.Timeout | null = null;
  private configuredSecret: string | null = null;
  private isAuthenticated = false;
  private agentState: PlayitAgentState = "not_installed";
  private lastError: string | null = null;
  private readonly logBuffer: string[] = [];
  private readonly MAX_LOG_LINES = 100;

  constructor(
    private readonly tunnelsRepo: PlayitTunnelsRepository,
    private readonly serversRepo: ServersRepository,
  ) {}

  private getTomlPaths(): string[] {
    const paths: string[] = [];
    if (process.platform === "win32" && process.env.LOCALAPPDATA) {
      paths.push(path.join(process.env.LOCALAPPDATA, "playit_gg", "playit.toml"));
    }
    paths.push(path.resolve("./data/playit.toml"));
    paths.push(path.resolve("./binaries/playit/playit.toml"));
    return paths;
  }

  loadConfiguredSecret(): string | null {
    if (this.configuredSecret) return this.configuredSecret;
    for (const p of this.getTomlPaths()) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, "utf-8");
          const match = content.match(/secret\s*=\s*["']([^"']+)["']/i);
          if (match && match[1]) {
            this.configuredSecret = match[1].trim();
            return this.configuredSecret;
          }
        } catch {}
      }
    }
    return null;
  }

  async saveSecret(secret: string): Promise<void> {
    this.configuredSecret = secret.trim();
    for (const p of this.getTomlPaths()) {
      try {
        await fsp.mkdir(path.dirname(p), { recursive: true });
        await fsp.writeFile(p, `secret = "${this.configuredSecret}"\n`, "utf-8");
      } catch (e) {
        this.logger.warn(`Could not write secret to ${p}: ${getErrorMessage(e)}`);
      }
    }
  }

  async onModuleInit() {
    this.discoverAgentPath();
    const secret = this.loadConfiguredSecret();
    if (secret) {
      this.isAuthenticated = true;
      // Auto-start agent so it is immediately online and ready on Playit network
      this.startAgent().catch((err) => {
        this.logger.warn(`Could not auto-start Playit agent: ${getErrorMessage(err)}`);
      });
    } else {
      this.isAuthenticated = false;
      this.initiateClaimFlow().catch((err) => {
        this.logger.warn(`Failed to auto-initiate Playit claim: ${getErrorMessage(err)}`);
      });
    }
  }

  async onModuleDestroy() {
    if (this.claimPollTimer) {
      clearInterval(this.claimPollTimer);
      this.claimPollTimer = null;
    }
    await this.stopAgent();
  }

  /**
   * Discovers existing Playit executable on the system
   */
  discoverAgentPath(): string | null {
    const isWindows = process.platform === "win32";
    const exeName = isWindows ? "playit.exe" : "playit";

    const candidatePaths = [
      path.resolve("./binaries/playit", exeName),
      path.resolve("./binaries/playit", "playit-windows-x86_64.exe"),
    ];

    if (isWindows) {
      const execDir = path.dirname(process.execPath);
      candidatePaths.push(path.join(execDir, "binaries", "playit", exeName));
      candidatePaths.push(path.join(execDir, "binaries", "playit", "playit-windows-x86_64.exe"));

      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        candidatePaths.push(path.join(localAppData, "Programs", "playit", exeName));
        candidatePaths.push(path.join(localAppData, "playit", exeName));
      }
      const progFiles = process.env.ProgramFiles;
      if (progFiles) {
        candidatePaths.push(path.join(progFiles, "playit", exeName));
        candidatePaths.push(path.join(progFiles, "BlockHarbor", "binaries", "playit", exeName));
      }
    } else {
      candidatePaths.push("/usr/local/bin/playit", "/usr/bin/playit");
    }

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        this.agentPath = p;
        if (this.agentState === "not_installed") {
          this.agentState = "stopped";
        }
        return p;
      }
    }

    return null;
  }

  /**
   * Initiates the official Playit claim flow and starts background polling
   */
  async initiateClaimFlow(forceNew = false): Promise<{ claimUrl: string; code: string }> {
    if (!forceNew && this.claimUrl && this.claimCode) {
      return { claimUrl: this.claimUrl, code: this.claimCode };
    }

    if (this.claimPollTimer) {
      clearInterval(this.claimPollTimer);
      this.claimPollTimer = null;
    }

    const code = "bh-" + crypto.randomBytes(3).toString("hex");
    this.claimCode = code;
    this.claimUrl = `https://playit.gg/claim/${code}`;
    this.agentState = "needs_claim";
    this.logger.log(`Initiating Playit claim handshake with code ${code}: ${this.claimUrl}`);

    try {
      const resp = await fetch("https://api.playit.gg/claim/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          agent_type: "self-managed",
          version: "0.15.26",
        }),
      });
      const data = (await resp.json()) as any;
      this.logger.log(`Playit claim setup response: ${JSON.stringify(data)}`);
    } catch (err) {
      this.logger.warn(`Playit claim/setup request failed: ${getErrorMessage(err)}`);
    }

    this.startClaimPolling(code);
    return { claimUrl: this.claimUrl, code: this.claimCode };
  }

  private startClaimPolling(code: string) {
    if (this.claimPollTimer) {
      clearInterval(this.claimPollTimer);
    }

    let attempts = 0;
    const maxAttempts = 300; // 15 minutes of polling

    this.claimPollTimer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (this.claimPollTimer) {
          clearInterval(this.claimPollTimer);
          this.claimPollTimer = null;
        }
        return;
      }

      try {
        const resp = await fetch("https://api.playit.gg/claim/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            agent_type: "self-managed",
            version: "0.15.26",
          }),
        });
        const json = (await resp.json()) as any;
        if (json?.data === "UserAccepted") {
          this.logger.log(`Playit claim accepted by user for code ${code}! Exchanging for secret key...`);
          if (this.claimPollTimer) {
            clearInterval(this.claimPollTimer);
            this.claimPollTimer = null;
          }

          await this.exchangeClaimCode(code);
        }
      } catch (err) {
        // Silently retry
      }
    }, 3000);
  }

  private async exchangeClaimCode(code: string) {
    try {
      const resp = await fetch("https://api.playit.gg/claim/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await resp.json()) as any;
      this.logger.log(`Playit claim/exchange response: ${JSON.stringify(json)}`);

      let secretKey: string | null = null;
      if (json?.status === "success" && json?.data) {
        if (typeof json.data === "string") {
          secretKey = json.data;
        } else if (json.data.secret_key) {
          secretKey = json.data.secret_key;
        } else if (json.data.secret) {
          secretKey = json.data.secret;
        }
      }

      if (secretKey) {
        await this.saveSecret(secretKey);
        this.isAuthenticated = true;
        this.claimUrl = null;
        this.claimCode = null;
        this.logger.log(`Playit agent secret received & saved! Auto-starting agent...`);
        await this.startAgent();
      } else {
        this.logger.error(`Could not parse secret key from exchange response: ${JSON.stringify(json)}`);
      }
    } catch (err) {
      this.logger.error(`Failed to exchange claim code ${code}: ${getErrorMessage(err)}`);
    }
  }

  async setSecret(secret: string): Promise<IPlayitAgentStatus> {
    if (!secret || typeof secret !== "string" || !secret.trim()) {
      throw new BadRequestException("Secret key cannot be empty");
    }

    await this.saveSecret(secret.trim());
    this.isAuthenticated = true;
    this.claimUrl = null;
    this.claimCode = null;

    if (this.claimPollTimer) {
      clearInterval(this.claimPollTimer);
      this.claimPollTimer = null;
    }

    if (this.agentProcess && !this.agentProcess.killed) {
      await this.stopAgent();
    }

    return this.startAgent();
  }

  /**
   * Retrieves live status of the Playit agent
   */
  getAgentStatus(): IPlayitAgentStatus {
    const installed = !!this.discoverAgentPath();
    const running = this.agentProcess !== null && !this.agentProcess.killed;
    const hasSecret = !!this.loadConfiguredSecret();

    let state: PlayitAgentState = this.agentState;
    if (running) {
      state = "running";
    } else if (!installed) {
      state = "not_installed";
    } else if (!hasSecret) {
      state = "needs_claim";
    }

    return {
      installed,
      running,
      authenticated: this.isAuthenticated || hasSecret,
      hasSecret,
      claimCode: this.claimCode,
      version: "1.0.10",
      path: this.agentPath,
      pid: running ? this.agentPid : null,
      claimUrl: this.claimUrl,
      status: state,
      lastError: this.lastError,
      lastOutput: [...this.logBuffer],
    };
  }

  /**
   * Downloads official Playit agent binary for current OS
   */
  async downloadAgent(): Promise<{ success: boolean; path: string }> {
    const isWindows = process.platform === "win32";
    const url = isWindows ? OFFICIAL_AGENT_URL_WIN : OFFICIAL_AGENT_URL_LINUX;
    const destDir = path.resolve("./binaries/playit");
    const destFile = path.join(destDir, isWindows ? "playit.exe" : "playit");

    this.logger.log(`Downloading official Playit agent from ${url} to ${destFile}`);
    await fsp.mkdir(destDir, { recursive: true });

    try {
      const response = await ky.get(url, {
        timeout: 60000,
        retry: 2,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      await fsp.writeFile(destFile, buffer);

      if (!isWindows) {
        await fsp.chmod(destFile, 0o755);
      }

      this.agentPath = destFile;
      this.agentState = "stopped";
      this.lastError = null;
      this.logger.log(`Successfully installed Playit agent at ${destFile}`);
      return { success: true, path: destFile };
    } catch (err) {
      const message = `Failed to download Playit agent: ${getErrorMessage(err)}`;
      this.logger.error(message);
      this.lastError = message;
      throw new BadRequestException(message);
    }
  }

  /**
   * Starts the managed Playit agent process
   */
  async startAgent(): Promise<IPlayitAgentStatus> {
    if (this.agentProcess && !this.agentProcess.killed) {
      return this.getAgentStatus();
    }

    const agentBinary = this.discoverAgentPath();
    if (!agentBinary) {
      throw new BadRequestException(
        "Playit agent is not installed. Please download or install it first.",
      );
    }

    const secret = this.loadConfiguredSecret();
    if (!secret) {
      await this.initiateClaimFlow();
      this.agentState = "needs_claim";
      return this.getAgentStatus();
    }

    this.agentState = "starting";
    this.lastError = null;

    const args: string[] = ["--secret", secret];

    try {
      this.agentProcess = spawn(agentBinary, args, {
        cwd: path.dirname(agentBinary),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      this.agentPid = this.agentProcess.pid ?? null;

      this.agentProcess.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        this.handleAgentOutput(text);
      });

      this.agentProcess.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        this.handleAgentOutput(text);
      });

      this.agentProcess.on("exit", (code, signal) => {
        this.logger.log(`Playit agent exited with code ${code}, signal ${signal}`);
        this.agentProcess = null;
        this.agentPid = null;
        if (code !== 0 && code !== null) {
          this.agentState = "error";
          this.lastError = `Agent exited unexpectedly with code ${code}`;
        } else {
          this.agentState = "stopped";
        }
      });

      this.agentProcess.on("error", (err) => {
        this.logger.error(`Playit agent spawn error: ${err.message}`);
        this.agentState = "error";
        this.lastError = err.message;
        this.agentProcess = null;
      });

      return this.getAgentStatus();
    } catch (err) {
      this.agentState = "error";
      this.lastError = getErrorMessage(err);
      throw new BadRequestException(`Failed to start agent: ${this.lastError}`);
    }
  }

  /**
   * Stops the managed Playit agent process
   */
  async stopAgent(): Promise<IPlayitAgentStatus> {
    if (!this.agentProcess || !this.agentPid) {
      this.agentState = this.agentPath ? "stopped" : "not_installed";
      return this.getAgentStatus();
    }

    try {
      await killPromise(this.agentPid);
    } catch (err) {
      this.logger.warn(`Could not kill agent process: ${getErrorMessage(err)}`);
    }

    this.agentProcess = null;
    this.agentPid = null;
    this.agentState = "stopped";
    return this.getAgentStatus();
  }

  /**
   * Internal stream parser to catch claim URLs and operational state
   */
  private handleAgentOutput(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      this.logBuffer.push(line);
      if (this.logBuffer.length > this.MAX_LOG_LINES) {
        this.logBuffer.shift();
      }

      // Claim URL extraction
      const claimMatch = line.match(/https:\/\/(?:playit\.gg|manage\.playit\.gg)\/claim\/([a-zA-Z0-9_-]+)/i);
      if (claimMatch) {
        this.claimUrl = claimMatch[0];
        this.agentState = "needs_claim";
        this.logger.log(`Playit agent generated claim link: ${this.claimUrl}`);
      }

      // Authenticated / Running indicators
      if (
        line.toLowerCase().includes("tunnel connection established") ||
        line.toLowerCase().includes("playit connected") ||
        line.toLowerCase().includes("tunnels loaded") ||
        line.toLowerCase().includes("authenticated") ||
        line.toLowerCase().includes("client loaded") ||
        line.toLowerCase().includes("running") ||
        line.toLowerCase().includes("tunnel created")
      ) {
        this.isAuthenticated = true;
        this.claimUrl = null;
        this.agentState = "running";
      }

      // Parse public tunnels from logs if reported
      const tunnelMatch = line.match(/([a-zA-Z0-9.-]+\.joinmc\.link|[a-zA-Z0-9.-]+\.playit\.gg)(?::(\d+))?/i);
      if (tunnelMatch && this.isAuthenticated) {
        this.logger.log(`Playit reported tunnel address: ${tunnelMatch[0]}`);
      }
    }
  }

  /**
   * Tests whether a local port is actually listening on loopback (TCP)
   */
  async testLocalPort(
    port: number,
    ip = "127.0.0.1",
  ): Promise<{ listening: boolean; latencyMs?: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on("connect", () => {
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ listening: true, latencyMs });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ listening: false, error: "Connection timed out (no listener)" });
      });

      socket.on("error", (err) => {
        socket.destroy();
        resolve({ listening: false, error: err.message });
      });

      socket.connect(port, ip);
    });
  }

  /**
   * Tests public Playit endpoint DNS resolution and TCP connectivity
   */
  async testRemoteEndpoint(
    host: string,
    port: number,
  ): Promise<{
    dnsOk: boolean;
    resolvedIp?: string;
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  }> {
    try {
      const lookup = await dns.promises.lookup(host);
      const start = Date.now();

      return await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3500);

        socket.on("connect", () => {
          const latencyMs = Date.now() - start;
          socket.destroy();
          resolve({
            dnsOk: true,
            resolvedIp: lookup.address,
            reachable: true,
            latencyMs,
          });
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve({
            dnsOk: true,
            resolvedIp: lookup.address,
            reachable: false,
            error: "Endpoint reachable test timed out after 3.5s",
          });
        });

        socket.on("error", (err) => {
          socket.destroy();
          resolve({
            dnsOk: true,
            resolvedIp: lookup.address,
            reachable: false,
            error: `Connection error: ${err.message}`,
          });
        });

        socket.connect(port, lookup.address);
      });
    } catch (dnsErr) {
      return {
        dnsOk: false,
        reachable: false,
        error: `DNS lookup failed for ${host}: ${getErrorMessage(dnsErr)}`,
      };
    }
  }

  /**
   * Full diagnostics report for a server and its configured Playit tunnels
   */
  async getDiagnostics(serverId: string): Promise<IPlayitDiagnosticReport> {
    const server = this.serversRepo.findById(serverId);
    if (!server) {
      throw new NotFoundException("Server not found");
    }

    const tunnels = this.tunnelsRepo.findByServerId(serverId);
    const checks: IPlayitDiagnosticCheck[] = [];
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. Server running status
    const isRunning = server.status === ServerStatus.RUNNING;
    checks.push({
      name: "Minecraft Server Status",
      status: isRunning ? "pass" : "fail",
      message: isRunning
        ? `Server '${server.name}' is currently RUNNING.`
        : `Server '${server.name}' is STOPPED. Start the server so players can connect.`,
    });
    if (!isRunning) {
      issues.push("Server is not currently running.");
      recommendations.push("Start the Minecraft server from the BlockHarbor dashboard.");
    }

    // 2. Playit Agent Installation
    const agentStatus = this.getAgentStatus();
    checks.push({
      name: "Playit Agent Installed",
      status: agentStatus.installed ? "pass" : "fail",
      message: agentStatus.installed
        ? `Agent executable located at: ${agentStatus.path}`
        : "Playit agent executable is not installed.",
    });
    if (!agentStatus.installed) {
      issues.push("Playit agent executable is missing.");
      recommendations.push("Click 'Download Official Agent' in the Playit networking panel.");
    }

    // 3. Playit Agent Process Running
    checks.push({
      name: "Playit Agent Process",
      status: agentStatus.running ? "pass" : "fail",
      message: agentStatus.running
        ? `Agent is running (PID: ${agentStatus.pid}).`
        : "Agent process is stopped.",
    });
    if (agentStatus.installed && !agentStatus.running) {
      issues.push("Playit agent is not running.");
      recommendations.push("Start the agent via the BlockHarbor Playit controls.");
    }

    // 4. Playit Agent Authentication
    const needsClaim = agentStatus.status === "needs_claim" || !!agentStatus.claimUrl;
    checks.push({
      name: "Playit Agent Claim & Auth",
      status: needsClaim ? "warn" : agentStatus.authenticated ? "pass" : "warn",
      message: needsClaim
        ? `Agent requires claiming: ${agentStatus.claimUrl}`
        : agentStatus.authenticated
          ? "Agent is authenticated and connected to Playit network."
          : "Agent status unconfirmed.",
    });
    if (needsClaim) {
      issues.push("Playit agent has not been claimed to your Playit.gg account.");
      recommendations.push(`Open the claim link in your browser: ${agentStatus.claimUrl}`);
    }

    // 5. Check tunnels and test local listeners
    if (tunnels.length === 0) {
      checks.push({
        name: "Playit Tunnel Configuration",
        status: "warn",
        message: "No Playit tunnels configured for this server.",
      });
      recommendations.push("Launch the Playit Setup Wizard to map a tunnel to this server's port.");
    } else {
      for (const tunnel of tunnels) {
        // Test local port listener
        const localTest = await this.testLocalPort(tunnel.localPort, tunnel.localIp);
        checks.push({
          name: `Local Port Listener (${tunnel.name} :${tunnel.localPort})`,
          status: localTest.listening ? "pass" : isRunning ? "fail" : "warn",
          message: localTest.listening
            ? `Local service is responding on ${tunnel.localIp}:${tunnel.localPort} (${localTest.latencyMs}ms).`
            : `Port ${tunnel.localIp}:${tunnel.localPort} is not accepting connections: ${localTest.error}`,
        });

        if (!localTest.listening && isRunning) {
          issues.push(`Minecraft server is running but port ${tunnel.localPort} is not listening.`);
          recommendations.push("Verify 'server-port' in server.properties matches this tunnel's local port.");
        }

        // Test remote endpoint if configured
        if (tunnel.publicAddress && tunnel.publicPort) {
          const remoteTest = await this.testRemoteEndpoint(
            tunnel.publicAddress,
            tunnel.publicPort,
          );
          checks.push({
            name: `Remote Endpoint Reachable (${tunnel.publicAddress}:${tunnel.publicPort})`,
            status: remoteTest.reachable ? "pass" : "fail",
            message: remoteTest.reachable
              ? `Public endpoint is open and reachable (${remoteTest.latencyMs}ms, IP: ${remoteTest.resolvedIp}).`
              : `Remote connection failed: ${remoteTest.error}`,
          });

          if (!remoteTest.reachable) {
            issues.push(`Public endpoint ${tunnel.publicAddress}:${tunnel.publicPort} failed reachability check.`);
            recommendations.push("Confirm that the Playit agent has this tunnel enabled and assigned to this computer.");
          }
        }
      }
    }

    // 6. Simple Voice Chat advisory
    const voiceTunnel = tunnels.find(
      (t) => t.tunnelType === "voice-chat" || t.localPort === 24454,
    );
    if (voiceTunnel) {
      const isUdp = voiceTunnel.protocol === "udp";
      checks.push({
        name: "Simple Voice Chat (UDP 24454)",
        status: isUdp ? "pass" : "fail",
        message: isUdp
          ? "Simple Voice Chat is properly configured for UDP protocol."
          : "Simple Voice Chat is configured as TCP! Voice chat mods strictly require UDP protocol.",
      });
      if (!isUdp) {
        issues.push("Voice chat tunnel is misconfigured as TCP instead of UDP.");
        recommendations.push(
          "Change the voice chat tunnel protocol to UDP in the Playit configuration.",
        );
      }
    }

    // 7. Firewall & Network Considerations
    checks.push({
      name: "Windows Firewall Guidelines",
      status: "pass",
      message: "Playit creates outbound encrypted tunnels; incoming port forwarding is not required on your router.",
    });

    const overallHealthy =
      isRunning &&
      agentStatus.running &&
      agentStatus.authenticated &&
      tunnels.length > 0 &&
      issues.length === 0;

    return {
      serverId,
      serverName: server.name,
      timestamp: Date.now(),
      overallHealthy,
      checks,
      issues,
      recommendations,
    };
  }

  // --- CRUD for Tunnels ---

  getAllTunnels(): IPlayitTunnel[] {
    return this.tunnelsRepo.findAll();
  }

  getTunnelsForServer(serverId: string): IPlayitTunnel[] {
    return this.tunnelsRepo.findByServerId(serverId);
  }

  getTunnelById(id: string): IPlayitTunnel {
    const tunnel = this.tunnelsRepo.findById(id);
    if (!tunnel) throw new NotFoundException("Tunnel not found");
    return tunnel;
  }

  createTunnel(dto: CreatePlayitTunnelDto): IPlayitTunnel {
    const server = this.serversRepo.findById(dto.serverId);
    if (!server) throw new NotFoundException("Target server does not exist");

    return this.tunnelsRepo.create({
      serverId: dto.serverId,
      name: dto.name,
      protocol: dto.protocol,
      localIp: dto.localIp || "127.0.0.1",
      localPort: dto.localPort,
      publicAddress: dto.publicAddress || null,
      publicPort: dto.publicPort || null,
      tunnelType: dto.tunnelType,
      status: "pending",
      lastHealthCheck: null,
      healthDetails: null,
    });
  }

  updateTunnel(id: string, dto: UpdatePlayitTunnelDto): IPlayitTunnel {
    const updated = this.tunnelsRepo.update(id, dto);
    if (!updated) throw new NotFoundException("Tunnel not found");
    return updated;
  }

  deleteTunnel(id: string): boolean {
    const ok = this.tunnelsRepo.delete(id);
    if (!ok) throw new NotFoundException("Tunnel not found");
    return true;
  }

  /**
   * Fetches all remote tunnels registered on the user's Playit.gg account
   */
  async getRemoteTunnels(): Promise<IPlayitRemoteTunnel[]> {
    const secret = this.loadConfiguredSecret();
    if (!secret) {
      throw new BadRequestException(
        "Playit agent is not authenticated. Please claim or enter secret key first.",
      );
    }

    try {
      const resp = await fetch("https://api.playit.gg/v1/tunnels/list", {
        method: "POST",
        headers: {
          Authorization: `agent-key ${secret}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const json = (await resp.json()) as any;
      if (json.status !== "success" || !Array.isArray(json.data?.tunnels)) {
        return [];
      }

      const results: IPlayitRemoteTunnel[] = [];
      for (const t of json.data.tunnels) {
        const alloc = t.public_allocations?.[0]?.details || {};
        const autoDomain = alloc.auto_domain || "";
        const ipHostname = alloc.ip_hostname || "";
        const ip = alloc.ip || "";
        const port = alloc.port || 0;
        const publicAddress = autoDomain || ipHostname || ip;

        results.push({
          id: t.id,
          name: t.name || "Playit Tunnel",
          tunnelType: t.tunnel_type || "minecraft-java",
          portType: t.port_type || "tcp",
          publicAddress,
          publicPort: port,
          ip,
          autoDomain,
        });
      }
      return results;
    } catch (err) {
      this.logger.error(`Failed to fetch remote tunnels: ${getErrorMessage(err)}`);
      throw new BadRequestException(`Failed to fetch remote tunnels: ${getErrorMessage(err)}`);
    }
  }

  /**
   * Automatically creates a new tunnel via Playit.gg API, fetches assigned public domain & port,
   * and registers it directly to the local server
   */
  async createTunnelViaApi(dto: CreateAutoPlayitTunnelDto): Promise<IPlayitTunnel> {
    const secret = this.loadConfiguredSecret();
    if (!secret) {
      throw new BadRequestException(
        "Playit agent is not authenticated. Please link your Playit.gg account first.",
      );
    }

    const server = this.serversRepo.findById(dto.serverId);
    if (!server) {
      throw new NotFoundException("Target server does not exist");
    }

    // 1. Fetch agent_id from /v1/agents/rundata
    let agentId: string | null = null;
    try {
      const runDataResp = await fetch("https://api.playit.gg/v1/agents/rundata", {
        method: "POST",
        headers: {
          Authorization: `agent-key ${secret}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const runDataJson = (await runDataResp.json()) as any;
      if (runDataJson.status === "success" && runDataJson.data?.agent_id) {
        agentId = runDataJson.data.agent_id;
      }
    } catch (e) {
      this.logger.warn(`Could not fetch agent_id from rundata: ${getErrorMessage(e)}`);
    }

    if (!agentId) {
      throw new BadRequestException(
        "Could not determine Playit agent ID. Ensure your Playit account is linked and the agent is running.",
      );
    }

    // 2. Call /v1/tunnels/create
    const tunnelType = dto.tunnelType || "minecraft-java";
    const name = dto.name || `${server.name} Tunnel`;
    const protocol = dto.protocol || (tunnelType === "voice-chat" ? "udp" : "tcp");
    const localPort = dto.localPort || (tunnelType === "voice-chat" ? 24454 : 25565);
    const localIp = dto.localIp || "127.0.0.1";

    const payload = {
      name,
      protocol: {
        type: "tunnel-type",
        details: tunnelType,
      },
      origin: {
        type: "agent",
        data: {
          agent_id: agentId,
        },
      },
      endpoint: {
        type: "region",
        details: {
          region: "global",
        },
      },
      enabled: true,
    };

    let newTunnelId: string | null = null;
    try {
      const createResp = await fetch("https://api.playit.gg/v1/tunnels/create", {
        method: "POST",
        headers: {
          Authorization: `agent-key ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const createJson = (await createResp.json()) as any;
      if (createJson.status !== "success" || !createJson.data?.id) {
        throw new Error(createJson.data?.message || JSON.stringify(createJson.data));
      }
      newTunnelId = createJson.data.id;
      this.logger.log(`Created tunnel ${newTunnelId} on Playit.gg API for server ${server.name}`);
    } catch (createErr) {
      this.logger.error(`Failed to create tunnel on Playit.gg API: ${getErrorMessage(createErr)}`);
      throw new BadRequestException(`Failed to create tunnel on Playit.gg: ${getErrorMessage(createErr)}`);
    }

    // 3. Query /v1/tunnels/list to get the public address and port assigned
    let publicAddress: string | null = null;
    let publicPort: number | null = null;

    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const listResp = await fetch("https://api.playit.gg/v1/tunnels/list", {
          method: "POST",
          headers: {
            Authorization: `agent-key ${secret}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        const listJson = (await listResp.json()) as any;
        if (listJson.status === "success" && Array.isArray(listJson.data?.tunnels)) {
          const match = listJson.data.tunnels.find((t: any) => t.id === newTunnelId);
          if (match) {
            const alloc = match.public_allocations?.[0]?.details || {};
            publicAddress = alloc.auto_domain || alloc.ip_hostname || alloc.ip || null;
            publicPort = alloc.port || null;
            if (publicAddress) break;
          }
        }
      } catch {}
    }

    // Auto-start agent if stopped so tunnel connects immediately
    if (!this.agentProcess || this.agentProcess.killed) {
      this.startAgent().catch((e) =>
        this.logger.warn(`Could not start agent after tunnel creation: ${getErrorMessage(e)}`),
      );
    }

    // 4. Save into BlockHarbor database
    return this.tunnelsRepo.create({
      serverId: dto.serverId,
      name,
      protocol,
      localIp,
      localPort,
      publicAddress,
      publicPort,
      tunnelType,
      status: "active",
      lastHealthCheck: Date.now(),
      healthDetails: "Provisioned automatically via Playit.gg Cloud API",
    });
  }

  /**
   * Syncs tunnels from the user's remote Playit.gg account into BlockHarbor database
   */
  async syncAccountTunnels(serverId?: string): Promise<IPlayitTunnel[]> {
    const remote = await this.getRemoteTunnels();
    const existing = this.tunnelsRepo.findAll();
    const synced: IPlayitTunnel[] = [];

    for (const r of remote) {
      const match = existing.find(
        (e) => e.publicAddress === r.publicAddress && e.publicPort === r.publicPort,
      );

      if (!match && serverId) {
        const created = this.tunnelsRepo.create({
          serverId,
          name: r.name,
          protocol: (r.portType === "udp" ? "udp" : "tcp") as any,
          localIp: "127.0.0.1",
          localPort: r.tunnelType === "voice-chat" ? 24454 : 25565,
          publicAddress: r.publicAddress,
          publicPort: r.publicPort,
          tunnelType: (r.tunnelType as any) || "minecraft-java",
          status: "active",
          lastHealthCheck: Date.now(),
          healthDetails: "Imported from Playit.gg account",
        });
        synced.push(created);
      }
    }

    return serverId ? this.tunnelsRepo.findByServerId(serverId) : this.tunnelsRepo.findAll();
  }
}
