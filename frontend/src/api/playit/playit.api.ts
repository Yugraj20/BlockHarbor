import { authHttp, type AuthHttpClient } from "@/shared/lib/http";
import type {
  IPlayitAgentStatus,
  IPlayitDiagnosticReport,
  IPlayitRemoteTunnel,
  IPlayitTunnel,
} from "@shared/types/playit.types";

export class PlayitApi {
  constructor(private http: AuthHttpClient) {}

  getStatus = (): Promise<IPlayitAgentStatus> =>
    this.http.get<IPlayitAgentStatus>("playit/status");

  startAgent = (): Promise<IPlayitAgentStatus> =>
    this.http.post<IPlayitAgentStatus>("playit/agent/start");

  stopAgent = (): Promise<IPlayitAgentStatus> =>
    this.http.post<IPlayitAgentStatus>("playit/agent/stop");

  downloadAgent = (): Promise<{ success: boolean; path: string }> =>
    this.http.post<{ success: boolean; path: string }>("playit/agent/download");

  refreshClaim = (): Promise<{ claimUrl: string; code: string }> =>
    this.http.post<{ claimUrl: string; code: string }>("playit/agent/claim/refresh");

  setSecret = (secret: string): Promise<IPlayitAgentStatus> =>
    this.http.post<IPlayitAgentStatus>("playit/agent/secret", {
      json: { secret },
    });

  getRemoteTunnels = (): Promise<IPlayitRemoteTunnel[]> =>
    this.http.get<IPlayitRemoteTunnel[]>("playit/agent/remote-tunnels");

  createAutoTunnel = (data: {
    serverId: string;
    name?: string;
    tunnelType?: string;
    protocol?: string;
    localPort?: number;
    localIp?: string;
  }): Promise<IPlayitTunnel> =>
    this.http.post<IPlayitTunnel>("playit/agent/tunnels/create-auto", {
      json: data,
    });

  syncAccountTunnels = (serverId?: string): Promise<IPlayitTunnel[]> =>
    this.http.post<IPlayitTunnel[]>(
      serverId ? `playit/agent/tunnels/sync?serverId=${serverId}` : "playit/agent/tunnels/sync",
    );

  getTunnels = (serverId?: string): Promise<IPlayitTunnel[]> =>
    this.http.get<IPlayitTunnel[]>(
      serverId ? `playit/tunnels?serverId=${serverId}` : "playit/tunnels",
    );

  getTunnelById = (id: string): Promise<IPlayitTunnel> =>
    this.http.get<IPlayitTunnel>(`playit/tunnels/${id}`);

  createTunnel = (data: Partial<IPlayitTunnel>): Promise<IPlayitTunnel> =>
    this.http.post<IPlayitTunnel>("playit/tunnels", { json: data });

  updateTunnel = (
    id: string,
    data: Partial<IPlayitTunnel>,
  ): Promise<IPlayitTunnel> =>
    this.http.put<IPlayitTunnel>(`playit/tunnels/${id}`, { json: data });

  deleteTunnel = (id: string): Promise<void> =>
    this.http.delete<void>(`playit/tunnels/${id}`);

  testLocalPort = (
    port: number,
    ip = "127.0.0.1",
  ): Promise<{ listening: boolean; latencyMs?: number; error?: string }> =>
    this.http.post<{ listening: boolean; latencyMs?: number; error?: string }>(
      "playit/test-local",
      { json: { port, ip } },
    );

  testRemoteEndpoint = (
    host: string,
    port: number,
  ): Promise<{
    dnsOk: boolean;
    resolvedIp?: string;
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  }> =>
    this.http.post<{
      dnsOk: boolean;
      resolvedIp?: string;
      reachable: boolean;
      latencyMs?: number;
      error?: string;
    }>("playit/test-remote", { json: { host, port } });

  getDiagnostics = (serverId: string): Promise<IPlayitDiagnosticReport> =>
    this.http.get<IPlayitDiagnosticReport>(`playit/diagnostics/${serverId}`);
}

export const playitApi = new PlayitApi(authHttp);
