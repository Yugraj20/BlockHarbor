import { PlayitTunnelsRepository } from "@/modules/database/repositories/playit-tunnels.repository";
import { ServersRepository } from "@/modules/database/repositories/servers.repository";
import { ServerStatus } from "@shared/types/server/server.types";
import * as net from "net";
import { PlayitService } from "./playit.service";

describe("PlayitService", () => {
  let service: PlayitService;
  let tunnelsRepo: any;
  let serversRepo: any;

  const mockTunnel = {
    id: "tunnel-123",
    serverId: "server-456",
    name: "Main Java Server",
    tunnelType: "minecraft-java" as const,
    protocol: "tcp" as const,
    localIp: "127.0.0.1",
    localPort: 25565,
    publicAddress: "fancy-subdomain.gl.joinmc.link",
    publicPort: 25565,
    status: "active" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastHealthCheck: null,
    healthDetails: null,
  };

  beforeEach(() => {
    tunnelsRepo = {
      findAll: () => [mockTunnel],
      findById: (id: string) => (id === "tunnel-123" ? mockTunnel : null),
      findByServerId: (id: string) => [mockTunnel],
      create: (dto: any) => ({ id: "tunnel-new", ...dto }),
      update: (id: string, dto: any) => (id === "tunnel-123" ? { ...mockTunnel, ...dto } : null),
      delete: (id: string) => id === "tunnel-123",
      updateStatus: () => {},
    };

    serversRepo = {
      findAll: () => [],
      findById: (id: string) => ({
        id,
        name: "Test Survival",
        status: ServerStatus.RUNNING,
        serverPort: 25565,
      }),
    };

    service = new PlayitService(tunnelsRepo, serversRepo);
  });

  describe("Agent Status & Discovery", () => {
    it("should return an agent status object with installed, running, and status fields", () => {
      const status = service.getAgentStatus();
      expect(status).toBeDefined();
      expect(typeof status.installed).toBe("boolean");
      expect(typeof status.running).toBe("boolean");
      expect(["not_installed", "stopped", "starting", "running", "needs_claim", "error"]).toContain(status.status);
    });

    it("should report claim URL if stdout produces a claim link", () => {
      // Simulate stdout claim detection
      (service as any).handleAgentOutput("Visit https://playit.gg/claim/abc123xyz to link your agent");
      const status = service.getAgentStatus();
      expect(status.claimUrl).toBe("https://playit.gg/claim/abc123xyz");
      expect(status.status).toBe("needs_claim");
    });
  });

  describe("Tunnel Management", () => {
    it("should retrieve all tunnels", () => {
      const tunnels = service.getAllTunnels();
      expect(tunnels).toHaveLength(1);
      expect(tunnels[0].id).toBe("tunnel-123");
    });

    it("should create a tunnel and return it", () => {
      const created = service.createTunnel({
        serverId: "server-456",
        name: "Bedrock Port",
        tunnelType: "minecraft-bedrock",
        protocol: "udp",
        localPort: 19132,
      });

      expect(created).toBeDefined();
      expect(created.id).toBe("tunnel-new");
      expect(created.localPort).toBe(19132);
    });

    it("should throw error when updating non-existent tunnel", () => {
      expect(() => service.updateTunnel("non-existent", { localPort: 25566 })).toThrow();
    });

    it("should delete an existing tunnel", () => {
      const result = service.deleteTunnel("tunnel-123");
      expect(result).toBe(true);
    });
  });

  describe("Local Port Testing", () => {
    it("should detect open port when a TCP server is listening", async () => {
      const testServer = net.createServer();
      await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", () => resolve()));
      const port = (testServer.address() as net.AddressInfo).port;

      try {
        const result = await service.testLocalPort(port);
        expect(result.listening).toBe(true);
      } finally {
        await new Promise<void>((resolve) => testServer.close(() => resolve()));
      }
    });

    it("should detect closed port when no server is listening", async () => {
      const result = await service.testLocalPort(59998);
      expect(result.listening).toBe(false);
    });
  });

  describe("Server Diagnostics", () => {
    it("should generate a diagnostic report with checks, issues, and recommendations", async () => {
      const report = await service.getDiagnostics("server-456");
      expect(report).toBeDefined();
      expect(report.serverId).toBe("server-456");
      expect(report.serverName).toBe("Test Survival");
      expect(report.checks.length).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(report.issues)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it("should include Simple Voice Chat notice for voice chat tunnel", async () => {
      tunnelsRepo.findByServerId = () => [
        {
          ...mockTunnel,
          tunnelType: "voice-chat",
          protocol: "udp",
          localPort: 24454,
        },
      ];

      const report = await service.getDiagnostics("server-456");
      const voiceCheck = report.checks.find((c) => c.name.includes("Voice Chat"));
      expect(voiceCheck).toBeDefined();
      expect(voiceCheck?.status).toBe("pass");
    });
  });
});
