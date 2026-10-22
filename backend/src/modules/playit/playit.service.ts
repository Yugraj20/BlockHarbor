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
  IPlayitTunnel,
  PlayitAgentState,
} from "@shared/types/playit.types";
import { ServerStatus } from "@shared/types/server/server.types";
import { ChildProcess, spawn } from "child_process";
import * as dns from "dns";
import * as fs from "fs";
import { promises as fsp } from "fs";
import ky from "ky";
import * as net from "net";
import * as path from "path";
import { CreatePlayitTunnelDto, UpdatePlayitTunnelDto } from "./dto/playit.dto";

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
  private claimUrl: string | null = null;
  private isAuthenticated = false;
  private agentState: PlayitAgentState = "not_installed";
  private lastError: string | null = null;
  private readonly logBuffer: string[] = [];
  private readonly MAX_LOG_LINES = 100;

  constructor(
    private readonly tunnelsRepo: PlayitTunnelsRepository,
    private readonly serversRepo: ServersRepository,
  ) {}

  async onModuleInit() {
    this.discoverAgentPath();
    if (this.agentPath) {
      this.agentState = "stopped";
    }
  }

  async onModuleDestroy() {
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
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        candidatePaths.push(path.join(localAppData, "Programs", "playit", exeName));
        candidatePaths.push(path.join(localAppData, "playit", exeName));
      }
      const progFiles = process.env.ProgramFiles;
      if (progFiles) {
        candidatePaths.push(path.join(progFiles, "playit", exeName));
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
   * Retrieves live status of the Playit agent
   */
  getAgentStatus(): IPlayitAgentStatus {
    const installed = !!this.discoverAgentPath();
    const running = this.agentProcess !== null && !this.agentProcess.killed;

    return {
      installed,
      running,
      authenticated: this.isAuthenticated,
      version: "0.15.x",
      path: this.agentPath,
      pid: running ? this.agentPid : null,
      claimUrl: this.claimUrl,
      status: this.agentState,
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

    this.agentState = "starting";
    this.lastError = null;
    this.claimUrl = null;

    try {
      this.agentProcess = spawn(agentBinary, [], {
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
}
