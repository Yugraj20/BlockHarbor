export type PlayitProtocol = "tcp" | "udp";

export type PlayitTunnelType =
  | "minecraft-java"
  | "minecraft-bedrock"
  | "voice-chat"
  | "custom";

export type PlayitTunnelStatus = "offline" | "pending" | "active" | "error";

export type PlayitAgentState =
  | "not_installed"
  | "stopped"
  | "starting"
  | "needs_claim"
  | "running"
  | "error";

export interface IPlayitTunnel {
  id: string;
  serverId: string;
  name: string;
  protocol: PlayitProtocol;
  localIp: string;
  localPort: number;
  publicAddress: string | null;
  publicPort: number | null;
  tunnelType: PlayitTunnelType;
  status: PlayitTunnelStatus;
  lastHealthCheck: number | null;
  healthDetails: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IPlayitRemoteTunnel {
  id: string;
  name: string;
  tunnelType: string;
  portType: string;
  publicAddress: string;
  publicPort: number;
  ip: string;
  autoDomain: string;
}

export interface IPlayitAgentStatus {
  installed: boolean;
  running: boolean;
  authenticated: boolean;
  hasSecret?: boolean;
  claimCode?: string | null;
  version: string | null;
  path: string | null;
  pid: number | null;
  claimUrl: string | null;
  status: PlayitAgentState;
  lastError: string | null;
  lastOutput: string[];
}

export interface IPlayitDiagnosticCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  details?: string;
}

export interface IPlayitDiagnosticReport {
  serverId: string;
  serverName: string;
  timestamp: number;
  overallHealthy: boolean;
  checks: IPlayitDiagnosticCheck[];
  issues: string[];
  recommendations: string[];
}
