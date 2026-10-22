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
  Key,
  Check,
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

  // Secret & Claim states
  const [secretInput, setSecretInput] = useState("");
  const [isConnectingSecret, setIsConnectingSecret] = useState(false);
  const [isRefreshingClaim, setIsRefreshingClaim] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSecretField, setShowSecretField] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    // Poll agent status every 3 seconds while needs_claim or stopping, else 8 seconds
    const interval = setInterval(async () => {
      try {
        const s = await api.playit.getStatus();
        setAgentStatus(s);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshClaim = async () => {
    setIsRefreshingClaim(true);
    setFeedbackMsg(null);
    try {
      await api.playit.refreshClaim();
      const s = await api.playit.getStatus();
      setAgentStatus(s);
      setFeedbackMsg({ type: "success", text: "Fresh claim code generated. Open the link to link your account." });
    } catch (e: any) {
      setFeedbackMsg({ type: "error", text: e.message || "Failed to refresh claim link" });
    } finally {
      setIsRefreshingClaim(false);
    }
  };

  const handleConnectSecret = async () => {
    if (!secretInput.trim()) return;
    setIsConnectingSecret(true);
    setFeedbackMsg(null);
    try {
      const s = await api.playit.setSecret(secretInput.trim());
      setAgentStatus(s);
      setSecretInput("");
      setShowSecretField(false);
      setFeedbackMsg({ type: "success", text: "Playit Secret Key saved & agent connected successfully!" });
    } catch (e: any) {
      setFeedbackMsg({ type: "error", text: e.message || "Failed to set secret key" });
    } finally {
      setIsConnectingSecret(false);
    }
  };

  const handleSyncTunnels = async () => {
    setIsSyncing(true);
    try {
      const synced = await api.playit.syncAccountTunnels();
      setTunnels(synced);
      setFeedbackMsg({
        type: "success",
        text: `Successfully synced ${synced.length} tunnel(s) from your Playit.gg account!`,
      });
    } catch (e: any) {
      setFeedbackMsg({
        type: "error",
        text: e.message || "Failed to sync tunnels from Playit.gg account",
      });
    } finally {
      setIsSyncing(false);
    }
  };

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
          {agentStatus?.authenticated && (
            <Button
              variant="outline"
              onClick={handleSyncTunnels}
              disabled={isSyncing}
              className="border-zinc-800 hover:border-zinc-700 text-zinc-200 gap-1.5"
              title="Sync tunnels registered on your Playit.gg web dashboard"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <RefreshCw className="w-4 h-4 text-emerald-400" />}
              Sync Account Tunnels
            </Button>
          )}

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

      {/* Account Connection & Claiming Card */}
      <Card className="p-5 bg-zinc-900/80 border-zinc-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              agentStatus?.authenticated
                ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-400"
                : "bg-amber-950/60 border border-amber-500/40 text-amber-400"
            }`}>
              {agentStatus?.authenticated ? <CheckCircle2 className="w-5 h-5" /> : <Radio className="w-5 h-5 animate-pulse" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-100 text-base">
                  Playit.gg Account Connection
                </h3>
                <Badge
                  variant="outline"
                  className={
                    agentStatus?.authenticated
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-950/20"
                      : "border-amber-500/40 text-amber-400 bg-amber-950/20"
                  }
                >
                  {agentStatus?.authenticated ? "Connected" : "Account Claim Required"}
                </Badge>
                {agentStatus?.authenticated && (
                  <Badge
                    variant="outline"
                    className={
                      agentStatus?.running
                        ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/40"
                        : "border-amber-500/40 text-amber-300 bg-amber-950/40"
                    }
                  >
                    {agentStatus?.running ? "Online (Running)" : "Offline (Stopped)"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {agentStatus?.authenticated
                  ? "Your agent is linked and authorized on the Playit.gg network."
                  : "Claim this agent or paste your secret key to link with your Playit.gg account."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {agentStatus?.authenticated && !agentStatus?.running && (
              <Button
                size="sm"
                onClick={handleStartAgent}
                disabled={isAgentLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow-sm"
              >
                {isAgentLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Start Agent
              </Button>
            )}
            {agentStatus?.claimUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshClaim}
                disabled={isRefreshingClaim}
                className="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs gap-1.5"
                title="Generate fresh claim code"
              >
                {isRefreshingClaim ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh Code
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSecretField(!showSecretField)}
              className="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs gap-1.5"
            >
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              {showSecretField ? "Hide Secret Key" : agentStatus?.authenticated ? "Change Secret Key" : "Enter Secret Key"}
            </Button>
          </div>
        </div>

        {feedbackMsg && (
          <div className={`mt-3 p-3 rounded-lg text-xs flex items-center gap-2 ${
            feedbackMsg.type === "success"
              ? "bg-emerald-950/30 border border-emerald-500/30 text-emerald-300"
              : "bg-red-950/30 border border-red-500/30 text-red-300"
          }`}>
            {feedbackMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedbackMsg.text}
          </div>
        )}

        {/* Claim Link Section (shown when unauthenticated or claimUrl available) */}
        {!agentStatus?.authenticated && agentStatus?.claimUrl && (
          <div className="mt-4 p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                  Option 1: One-Click Browser Claim Link
                </span>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Click the button below to open Playit.gg in your browser and authorize this agent:
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyButton text={agentStatus.claimUrl} label="Copy Link" className="text-xs bg-zinc-900 border-zinc-700" />
                <a
                  href={agentStatus.claimUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-colors"
                >
                  Open Claim Link on Playit.gg
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Waiting for confirmation on Playit.gg — BlockHarbor will automatically connect when you click <b>Add Agent</b>.</span>
            </div>
          </div>
        )}

        {/* Secret Key Input Section (shown when toggled OR when unauthenticated and no claimUrl) */}
        {(showSecretField || (!agentStatus?.authenticated && !agentStatus?.claimUrl)) && (
          <div className="mt-4 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div>
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                {agentStatus?.authenticated ? "Update Secret Key" : "Option 2: Direct Playit Secret Key"}
              </span>
              <p className="text-xs text-zinc-400 mt-1">
                Paste your agent secret key from{" "}
                <a
                  href="https://playit.gg/manage/agents"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                >
                  playit.gg/manage/agents <ExternalLink className="w-3 h-3" />
                </a>{" "}
                to connect immediately without browser claiming.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <input
                type="password"
                placeholder="Paste Playit Secret Key here..."
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 font-mono focus:outline-none focus:border-emerald-500"
              />
              <Button
                size="sm"
                onClick={handleConnectSecret}
                disabled={isConnectingSecret || !secretInput.trim()}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shrink-0"
              >
                {isConnectingSecret ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Connect Account
              </Button>
            </div>
          </div>
        )}
      </Card>

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
