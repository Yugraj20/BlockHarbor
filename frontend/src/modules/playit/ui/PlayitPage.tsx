"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { CopyButton } from "@/shared/ui/CopyButton";
import {
  Radio,
  Download,
  Play,
  Square,
  RefreshCw,
  Plus,
  Stethoscope,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Network,
  Activity,
  Trash2,
  Loader2,
  Server as ServerIcon,
} from "lucide-react";
import api from "@/api";
import type { IPlayitAgentStatus, IPlayitTunnel } from "@shared/types/playit.types";
import type { Server as IServer } from "@/api/servers/servers.model";
import { PlayitWizardModal } from "./PlayitWizardModal";
import { PlayitDiagnosticsDrawer } from "./PlayitDiagnosticsDrawer";
import { VoiceChatNoticeCard } from "./VoiceChatNoticeCard";

export function PlayitPage() {
  const [agentStatus, setAgentStatus] = useState<IPlayitAgentStatus | null>(null);
  const [tunnels, setTunnels] = useState<IPlayitTunnel[]>([]);
  const [servers, setServers] = useState<IServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  // Modals
  const [wizardOpen, setWizardOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // Test states per tunnel
  const [testingTunnelId, setTestingTunnelId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { reachable: boolean; latencyMs?: number; error?: string }>>({});

  const loadData = async () => {
    try {
      const [statusRes, tunnelsRes, serversRes] = await Promise.all([
        api.playit.getStatus(),
        api.playit.getTunnels(),
        api.servers.getAll(),
      ]);
      setAgentStatus(statusRes);
      setTunnels(tunnelsRes);
      setServers(serversRes);
    } catch (e) {
      console.error("Failed to load Playit data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll agent status every 10 seconds to detect claim completion or tunnel changes
    const interval = setInterval(async () => {
      try {
        const s = await api.playit.getStatus();
        setAgentStatus(s);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStartAgent = async () => {
    setIsAgentLoading(true);
    try {
      const s = await api.playit.startAgent();
      setAgentStatus(s);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleStopAgent = async () => {
    setIsAgentLoading(true);
    try {
      const s = await api.playit.stopAgent();
      setAgentStatus(s);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleDownloadAgent = async () => {
    setIsAgentLoading(true);
    try {
      await api.playit.downloadAgent();
      const s = await api.playit.getStatus();
      setAgentStatus(s);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleDeleteTunnel = async (id: string) => {
    if (!confirm("Are you sure you want to remove this tunnel mapping?")) return;
    try {
      await api.playit.deleteTunnel(id);
      setTunnels((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestTunnel = async (tunnel: IPlayitTunnel) => {
    setTestingTunnelId(tunnel.id);
    try {
      if (tunnel.publicAddress && tunnel.publicPort) {
        const res = await api.playit.testRemoteEndpoint(tunnel.publicAddress, tunnel.publicPort);
        setTestResults((prev) => ({
          ...prev,
          [tunnel.id]: {
            reachable: res.reachable,
            latencyMs: res.latencyMs,
            error: res.error,
          },
        }));
      } else {
        const res = await api.playit.testLocalPort(tunnel.localPort, tunnel.localIp);
        setTestResults((prev) => ({
          ...prev,
          [tunnel.id]: {
            reachable: res.listening,
            latencyMs: res.latencyMs,
            error: res.error,
          },
        }));
      }
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [tunnel.id]: {
          reachable: false,
          error: e.message,
        },
      }));
    } finally {
      setTestingTunnelId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-emerald-400" />
            Playit.gg Networking
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Zero-port-forwarding public endpoints for your Minecraft servers and voice chat.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => setDiagnosticsOpen(true)}
            className="border-zinc-800 hover:border-zinc-700 text-zinc-200 gap-1.5"
          >
            <Stethoscope className="w-4 h-4 text-emerald-400" />
            Diagnostics
          </Button>

          <Button
            onClick={() => setWizardOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-lg shadow-emerald-950/40"
          >
            <Plus className="w-4 h-4" />
            Setup New Tunnel
          </Button>
        </div>
      </div>

      {/* Claim Banner (if agent needs claim) */}
      {agentStatus?.claimUrl && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="font-semibold text-sm text-amber-200">
                Playit Agent Requires Account Claiming
              </div>
              <div className="text-xs text-zinc-400">
                Click to authenticate this agent with your Playit.gg account to enable public tunnels.
              </div>
            </div>
          </div>

          <a
            href={agentStatus.claimUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-colors shrink-0"
          >
            Claim Agent on Playit.gg
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Agent Card */}
        <Card className="p-4 bg-zinc-900/60 border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Local Agent Client</span>
            <Badge
              variant="outline"
              className={
                agentStatus?.running
                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-950/20"
                  : agentStatus?.installed
                  ? "border-zinc-700 text-zinc-400"
                  : "border-red-500/40 text-red-400 bg-red-950/20"
              }
            >
              {agentStatus?.running
                ? "Running"
                : agentStatus?.installed
                ? "Stopped"
                : "Not Installed"}
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="text-xl font-bold text-zinc-100">
              {agentStatus?.running ? `PID: ${agentStatus.pid}` : "Offline"}
            </div>
            <div className="text-xs text-zinc-500 truncate" title={agentStatus?.path || ""}>
              {agentStatus?.path ? agentStatus.path : "No agent binary located"}
            </div>
          </div>

          <div className="pt-1 flex items-center gap-2">
            {!agentStatus?.installed ? (
              <Button
                size="sm"
                onClick={handleDownloadAgent}
                disabled={isAgentLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1"
              >
                {isAgentLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Download Official Agent
              </Button>
            ) : !agentStatus.running ? (
              <Button
                size="sm"
                onClick={handleStartAgent}
                disabled={isAgentLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1"
              >
                {isAgentLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Start Agent
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopAgent}
                disabled={isAgentLoading}
                className="w-full border-zinc-800 hover:border-red-500/40 text-red-400 hover:bg-red-950/20 text-xs gap-1"
              >
                {isAgentLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                Stop Agent
              </Button>
            )}
          </div>
        </Card>

        {/* Active Tunnels Stat */}
        <Card className="p-4 bg-zinc-900/60 border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Configured Tunnels</span>
            <Network className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-zinc-100">{tunnels.length}</div>
            <div className="text-xs text-zinc-500">
              {tunnels.filter((t) => t.publicAddress).length} mapped to public endpoints
            </div>
          </div>
          <div className="text-xs text-zinc-400 pt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Automatic port forwarding bypassed
          </div>
        </Card>

        {/* Security & Health */}
        <Card className="p-4 bg-zinc-900/60 border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Network Security</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-zinc-100">Encrypted</div>
            <div className="text-xs text-zinc-500">
              Outbound encrypted tunnels; no open router ports
            </div>
          </div>
          <div className="text-xs text-zinc-400 pt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            DDoS protected by Playit Anycast
          </div>
        </Card>
      </div>

      {/* Voice Chat Notice Card */}
      <VoiceChatNoticeCard onAddVoiceTunnel={() => setWizardOpen(true)} />

      {/* Tunnels Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Network className="w-4 h-4 text-emerald-400" />
            Active Server Tunnels
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            className="text-zinc-400 hover:text-zinc-200 text-xs gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        {tunnels.length === 0 ? (
          <Card className="p-8 text-center bg-zinc-900/40 border-zinc-800 space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 flex items-center justify-center mx-auto text-zinc-400">
              <Radio className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="font-medium text-zinc-200">No Playit Tunnels Configured</div>
              <div className="text-xs text-zinc-400 max-w-sm mx-auto">
                Connect your Minecraft servers to the world without router port-forwarding or public IP exposure.
              </div>
            </div>
            <Button
              onClick={() => setWizardOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Launch Setup Wizard
            </Button>
          </Card>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                  <tr>
                    <th className="py-3 px-4">Tunnel Name</th>
                    <th className="py-3 px-4">Server</th>
                    <th className="py-3 px-4">Protocol / Type</th>
                    <th className="py-3 px-4">Local Endpoint</th>
                    <th className="py-3 px-4">Public Address</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {tunnels.map((t) => {
                    const server = servers.find((s) => s.id === t.serverId);
                    const testRes = testResults[t.id];
                    const isTesting = testingTunnelId === t.id;

                    return (
                      <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-zinc-100">
                          {t.name}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="flex items-center gap-1.5 text-zinc-300">
                            <ServerIcon className="w-3.5 h-3.5 text-zinc-400" />
                            {server?.name || t.serverId}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-mono border-zinc-700 bg-zinc-800/60"
                          >
                            {t.protocol} · {t.tunnelType}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-zinc-400">
                          {t.localIp}:{t.localPort}
                        </td>
                        <td className="py-3.5 px-4">
                          {t.publicAddress ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-emerald-400 font-medium">
                                {t.publicAddress}{t.publicPort ? `:${t.publicPort}` : ""}
                              </span>
                              <CopyButton
                                text={`${t.publicAddress}${t.publicPort ? `:${t.publicPort}` : ""}`}
                              />
                            </div>
                          ) : (
                            <span className="text-zinc-500 italic">Pending mapping</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTestTunnel(t)}
                            disabled={isTesting}
                            className="border-zinc-800 hover:border-emerald-500/40 text-xs h-7 px-2.5"
                          >
                            {isTesting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              "Test"
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTunnel(t.id)}
                            className="text-zinc-400 hover:text-red-400 h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Modal */}
      <PlayitWizardModal
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        servers={servers}
        agentStatus={agentStatus}
        onRefreshAgent={loadData}
        onTunnelCreated={loadData}
      />

      {/* Diagnostics Drawer */}
      <PlayitDiagnosticsDrawer
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
        servers={servers}
      />
    </div>
  );
}
