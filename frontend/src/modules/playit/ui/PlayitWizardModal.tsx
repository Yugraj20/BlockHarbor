"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { CopyButton } from "@/shared/ui/CopyButton";
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Radio,
  Server,
  Globe,
  ShieldAlert,
  Key,
  Check,
  Zap,
  Sparkles,
} from "lucide-react";
import api from "@/api";
import type {
  IPlayitAgentStatus,
  IPlayitRemoteTunnel,
  IPlayitTunnel,
  PlayitProtocol,
  PlayitTunnelType,
} from "@shared/types/playit.types";
import type { Server as IServer } from "@/api/servers/servers.model";

interface PlayitWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: IServer[];
  agentStatus: IPlayitAgentStatus | null;
  onRefreshAgent: () => void;
  onTunnelCreated: () => void;
}

function getBlueprintDisplay(id?: string): string {
  if (!id) return "Minecraft Server";
  const name = id.replace(/^(com\.(kubek|blockharbor)\.)/i, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function PlayitWizardModal({
  open,
  onOpenChange,
  servers,
  agentStatus,
  onRefreshAgent,
  onTunnelCreated,
}: PlayitWizardModalProps) {
  const [step, setStep] = useState(1);
  const [selectedServerId, setSelectedServerId] = useState<string>(servers[0]?.id || "");
  const [tunnelName, setTunnelName] = useState("Minecraft Server");
  const [tunnelType, setTunnelType] = useState<PlayitTunnelType>("minecraft-java");
  const [protocol, setProtocol] = useState<PlayitProtocol>("tcp");
  const [localPort, setLocalPort] = useState(25565);
  const [publicAddress, setPublicAddress] = useState("");
  const [publicPort, setPublicPort] = useState<number | "">("");

  // Testing states
  const [localTesting, setLocalTesting] = useState(false);
  const [localTestResult, setLocalTestResult] = useState<{ listening: boolean; latencyMs?: number; error?: string } | null>(null);

  const [remoteTesting, setRemoteTesting] = useState(false);
  const [remoteTestResult, setRemoteTestResult] = useState<{ reachable: boolean; dnsOk: boolean; latencyMs?: number; error?: string } | null>(null);

  const [isStartingAgent, setIsStartingAgent] = useState(false);
  const [isDownloadingAgent, setIsDownloadingAgent] = useState(false);
  const [isSavingTunnel, setIsSavingTunnel] = useState(false);

  // Secret Key connection states
  const [wizardSecret, setWizardSecret] = useState("");
  const [isConnectingSecret, setIsConnectingSecret] = useState(false);
  const [wizardSecretError, setWizardSecretError] = useState<string | null>(null);

  // Auto-creation & remote tunnel discovery states
  const [remoteTunnels, setRemoteTunnels] = useState<IPlayitRemoteTunnel[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [isAutoCreating, setIsAutoCreating] = useState(false);
  const [autoCreateSuccess, setAutoCreateSuccess] = useState<string | null>(null);
  const [showManualAddress, setShowManualAddress] = useState(false);

  const handleConnectSecret = async () => {
    if (!wizardSecret.trim()) return;
    setIsConnectingSecret(true);
    setWizardSecretError(null);
    try {
      await api.playit.setSecret(wizardSecret.trim());
      setWizardSecret("");
      onRefreshAgent();
    } catch (e: any) {
      setWizardSecretError(e.message || "Failed to connect secret key");
    } finally {
      setIsConnectingSecret(false);
    }
  };

  const loadRemoteTunnels = async () => {
    setIsLoadingRemote(true);
    try {
      const list = await api.playit.getRemoteTunnels();
      setRemoteTunnels(list);
      if (!publicAddress && list.length > 0) {
        const match = list.find((t) => t.tunnelType === tunnelType) || list[0];
        setPublicAddress(match.publicAddress);
        if (match.publicPort) setPublicPort(match.publicPort);
      }
    } catch (e) {
      console.warn("Could not load remote tunnels:", e);
    } finally {
      setIsLoadingRemote(false);
    }
  };

  const handleAutoCreateTunnel = async () => {
    if (!selectedServerId) return;
    setIsAutoCreating(true);
    setAutoCreateSuccess(null);
    try {
      const created = await api.playit.createAutoTunnel({
        serverId: selectedServerId,
        name: tunnelName,
        tunnelType,
        protocol,
        localPort,
        localIp: "127.0.0.1",
      });

      if (created.publicAddress) {
        setPublicAddress(created.publicAddress);
      }
      if (created.publicPort) {
        setPublicPort(created.publicPort);
      }
      setAutoCreateSuccess(
        `Tunnel created! Public address: ${created.publicAddress}${
          created.publicPort ? `:${created.publicPort}` : ""
        }`,
      );
      onTunnelCreated();
      // Smoothly advance to step 8
      setTimeout(() => {
        setStep(8);
      }, 1000);
    } catch (e: any) {
      alert(`Auto-creation failed: ${e.message || "Unknown error"}`);
    } finally {
      setIsAutoCreating(false);
    }
  };

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  // Auto-fill defaults when server changes
  useEffect(() => {
    if (selectedServer) {
      setTunnelName(`${selectedServer.name} Tunnel`);
      // Try to determine port from variables if available, else default 25565
      const portVar = selectedServer.variables?.SERVER_PORT || selectedServer.variables?.PORT;
      if (portVar) {
        setLocalPort(Number(portVar));
      }
    }
  }, [selectedServer]);

  // Load account tunnels from Playit.gg when reaching step 7
  useEffect(() => {
    if (step === 7 && agentStatus?.authenticated) {
      loadRemoteTunnels();
    }
  }, [step, agentStatus?.authenticated]);

  // Handle agent download
  const handleDownloadAgent = async () => {
    setIsDownloadingAgent(true);
    try {
      await api.playit.downloadAgent();
      onRefreshAgent();
    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloadingAgent(false);
    }
  };

  // Handle agent start
  const handleStartAgent = async () => {
    setIsStartingAgent(true);
    try {
      await api.playit.startAgent();
      onRefreshAgent();
    } catch (e) {
      console.error(e);
    } finally {
      setIsStartingAgent(false);
    }
  };

  // Test local port
  const handleTestLocalPort = async () => {
    setLocalTesting(true);
    setLocalTestResult(null);
    try {
      const res = await api.playit.testLocalPort(localPort);
      setLocalTestResult(res);
    } catch (e: any) {
      setLocalTestResult({ listening: false, error: e.message });
    } finally {
      setLocalTesting(false);
    }
  };

  // Test remote endpoint
  const handleTestRemote = async () => {
    if (!publicAddress) return;
    setRemoteTesting(true);
    setRemoteTestResult(null);
    try {
      const p = publicPort ? Number(publicPort) : localPort;
      const res = await api.playit.testRemoteEndpoint(publicAddress, p);
      setRemoteTestResult(res);
    } catch (e: any) {
      setRemoteTestResult({ reachable: false, dnsOk: false, error: e.message });
    } finally {
      setRemoteTesting(false);
    }
  };

  // Save tunnel
  const handleSaveTunnel = async () => {
    setIsSavingTunnel(true);
    try {
      await api.playit.createTunnel({
        serverId: selectedServerId,
        name: tunnelName,
        protocol,
        localIp: "127.0.0.1",
        localPort,
        publicAddress: publicAddress || null,
        publicPort: publicPort ? Number(publicPort) : null,
        tunnelType,
      });
      onTunnelCreated();
      onOpenChange(false);
      setStep(1);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTunnel(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-400" />
              Playit.gg Tunnel Setup Wizard
            </DialogTitle>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              Step {step} of 8
            </Badge>
          </div>
          <DialogDescription className="text-zinc-400">
            Configure secure, zero-port-forwarding public access to your local Minecraft server.
          </DialogDescription>
        </DialogHeader>

        {/* Step Progress Dots */}
        <div className="flex gap-1.5 my-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                s === step
                  ? "bg-emerald-500"
                  : s < step
                  ? "bg-emerald-800"
                  : "bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {/* STEP 1: Server Selection */}
        {step === 1 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 1: Select Target Minecraft Server</h3>
            <p className="text-sm text-zinc-400">
              Choose which local server this Playit tunnel will forward player connections to.
            </p>
            <div className="space-y-2">
              <Label>Target Server</Label>
              <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedServer && (
              <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Server Status:</span>
                  <Badge
                    variant={selectedServer.status === "RUNNING" ? "default" : "secondary"}
                    className={
                      selectedServer.status === "RUNNING"
                        ? "bg-emerald-600/30 text-emerald-300 border-emerald-500/40"
                        : "bg-zinc-800 text-zinc-400"
                    }
                  >
                    {selectedServer.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Blueprint:</span>
                  <span className="text-zinc-200">{getBlueprintDisplay(selectedServer.blueprintId)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Agent Discovery & Installation */}
        {step === 2 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 2: Playit Agent Detection</h3>
            <p className="text-sm text-zinc-400">
              The official Playit.gg Windows client must be installed on this computer to bridge local network ports to the cloud.
            </p>

            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200">Official Windows Agent</div>
                  <div className="text-xs text-zinc-400">
                    {agentStatus?.installed
                      ? `Detected at: ${agentStatus.path}`
                      : "Not detected in system path or standard directories."}
                  </div>
                </div>
                <Badge
                  className={
                    agentStatus?.installed
                      ? "bg-emerald-600/30 text-emerald-300 border-emerald-500/40"
                      : "bg-amber-600/30 text-amber-300 border-amber-500/40"
                  }
                >
                  {agentStatus?.installed ? "Installed" : "Not Found"}
                </Badge>
              </div>

              {!agentStatus?.installed && (
                <div className="pt-2">
                  <Button
                    onClick={handleDownloadAgent}
                    disabled={isDownloadingAgent}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 w-full"
                  >
                    {isDownloadingAgent ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading Official Windows Agent...
                      </>
                    ) : (
                      <>Download Official Playit Agent (~15MB)</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Agent Process & Account Claiming */}
        {step === 3 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 3: Agent Authentication & Claiming</h3>
            <p className="text-sm text-zinc-400">
              The agent must be linked to your legitimate Playit.gg account to register public tunnels.
            </p>

            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200">Account Authorization</div>
                  <div className="text-xs text-zinc-400">
                    {agentStatus?.authenticated
                      ? "Agent is linked and authenticated with Playit.gg."
                      : "Agent requires account claiming or secret key configuration."}
                  </div>
                </div>
                <Badge
                  className={
                    agentStatus?.authenticated
                      ? "bg-emerald-600/30 text-emerald-300 border-emerald-500/40"
                      : "bg-amber-600/30 text-amber-300 border-amber-500/40"
                  }
                >
                  {agentStatus?.authenticated ? "Connected" : "Requires Account"}
                </Badge>
              </div>

              {agentStatus?.authenticated ? (
                <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-semibold">Agent Authenticated!</span>
                    <p className="text-zinc-400 mt-0.5">Your local agent is successfully registered and running. You can proceed to configure your server tunnel.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {/* Option 1: Browser Claim */}
                  {agentStatus?.claimUrl && (
                    <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-950/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-300">
                          Option 1: One-Click Browser Claim Link
                        </span>
                        <CopyButton text={agentStatus.claimUrl} label="Copy Link" className="text-xs bg-zinc-900 border-zinc-700" />
                      </div>
                      <p className="text-xs text-zinc-300">
                        Click the button below to link this machine to your Playit.gg account:
                      </p>
                      <a
                        href={agentStatus.claimUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-colors"
                      >
                        Claim Agent on Playit.gg
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
                        <Loader2 className="w-3 h-3 animate-spin text-emerald-400 shrink-0" />
                        <span>Auto-detecting authorization... Click <b>Add Agent</b> on Playit.gg to complete.</span>
                      </div>
                    </div>
                  )}

                  {/* Option 2: Secret Key Input */}
                  <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-950/50 space-y-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-emerald-400" />
                      Option 2: Connect with Secret Key
                    </span>
                    <p className="text-xs text-zinc-400">
                      Already have an agent? Get its secret key from{" "}
                      <a
                        href="https://playit.gg/manage/agents"
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        playit.gg/manage/agents <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        type="password"
                        placeholder="Paste Playit Secret Key here..."
                        value={wizardSecret}
                        onChange={(e) => setWizardSecret(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        onClick={handleConnectSecret}
                        disabled={isConnectingSecret || !wizardSecret.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shrink-0"
                      >
                        {isConnectingSecret ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Connect
                      </Button>
                    </div>
                    {wizardSecretError && (
                      <p className="text-xs text-red-400 mt-1">{wizardSecretError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: Tunnel Type & Protocol */}
        {step === 4 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 4: Select Tunnel Type & Protocol</h3>
            <p className="text-sm text-zinc-400">
              Configure what type of network traffic this tunnel forwards.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setTunnelType("minecraft-java");
                  setProtocol("tcp");
                  setLocalPort(25565);
                }}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  tunnelType === "minecraft-java"
                    ? "border-emerald-500 bg-emerald-950/20"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <div className="font-medium text-sm text-zinc-200">Minecraft: Java Edition</div>
                <div className="text-xs text-zinc-400 mt-1">TCP protocol (standard port 25565)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTunnelType("voice-chat");
                  setProtocol("udp");
                  setLocalPort(24454);
                }}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  tunnelType === "voice-chat"
                    ? "border-emerald-500 bg-emerald-950/20"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <div className="font-medium text-sm text-zinc-200">Simple Voice Chat</div>
                <div className="text-xs text-zinc-400 mt-1">UDP protocol (standard port 24454)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTunnelType("minecraft-bedrock");
                  setProtocol("udp");
                  setLocalPort(19132);
                }}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  tunnelType === "minecraft-bedrock"
                    ? "border-emerald-500 bg-emerald-950/20"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <div className="font-medium text-sm text-zinc-200">Minecraft: Bedrock / Geyser</div>
                <div className="text-xs text-zinc-400 mt-1">UDP protocol (standard port 19132)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTunnelType("custom");
                }}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  tunnelType === "custom"
                    ? "border-emerald-500 bg-emerald-950/20"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <div className="font-medium text-sm text-zinc-200">Custom Service</div>
                <div className="text-xs text-zinc-400 mt-1">Custom TCP/UDP port mapping</div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Local Origin Configuration */}
        {step === 5 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 5: Configure Local Origin Endpoint</h3>
            <p className="text-sm text-zinc-400">
              Confirm the exact local IP and port where your Minecraft server is listening.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tunnel Label</Label>
                <Input
                  value={tunnelName}
                  onChange={(e) => setTunnelName(e.target.value)}
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Local Origin IP</Label>
                <Input
                  value="127.0.0.1"
                  disabled
                  className="bg-zinc-900 border-zinc-800 text-zinc-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Local Port</Label>
                <Input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(Number(e.target.value))}
                  className="bg-zinc-900 border-zinc-800 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Protocol</Label>
                <Select value={protocol} onValueChange={(v: any) => setProtocol(v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="tcp">TCP (Standard Java)</SelectItem>
                    <SelectItem value="udp">UDP (Voice Chat / Bedrock)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Local Listener Verification */}
        {step === 6 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 6: Test Local Port Listener</h3>
            <p className="text-sm text-zinc-400">
              Verify that your Minecraft server is running and actively listening on port {localPort}.
            </p>

            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200">Loopback TCP Probe</div>
                  <div className="text-xs text-zinc-400">127.0.0.1:{localPort}</div>
                </div>
                <Button
                  onClick={handleTestLocalPort}
                  disabled={localTesting}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 hover:border-emerald-500 text-xs"
                >
                  {localTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Run Test"}
                </Button>
              </div>

              {localTestResult && (
                <div
                  className={`p-3 rounded border text-xs ${
                    localTestResult.listening
                      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                      : "border-red-500/30 bg-red-950/20 text-red-300"
                  }`}
                >
                  {localTestResult.listening ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Port {localPort} is listening! Local latency: {localTestResult.latencyMs}ms.
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      Failed to connect: {localTestResult.error}. (Make sure your server is started).
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 7: Public Endpoint Assignment & Auto-Creation */}
        {step === 7 && (
          <div className="space-y-4 py-3">
            <div>
              <h3 className="font-semibold text-zinc-200">Step 7: Public Server Address & Tunnel</h3>
              <p className="text-sm text-zinc-400">
                Provision a public join address automatically from Playit.gg — no manual copy/paste required.
              </p>
            </div>

            {/* 1. Primary Action: Auto-Create via Playit Cloud */}
            <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    Automatic Cloud Provisioning (Recommended)
                  </div>
                  <p className="text-xs text-zinc-300">
                    BlockHarbor will request an encrypted public domain & port from Playit.gg and bind it directly to your Minecraft server.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleAutoCreateTunnel}
                disabled={isAutoCreating || !agentStatus?.authenticated}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 gap-2 shadow-lg shadow-emerald-950/50"
              >
                {isAutoCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Provisioning Tunnel on Playit.gg...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Public Tunnel Automatically
                  </>
                )}
              </Button>

              {autoCreateSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-900/40 border border-emerald-500/50 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{autoCreateSuccess}</span>
                </div>
              )}
            </div>

            {/* 2. Existing Remote Tunnels Found on Account */}
            {remoteTunnels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Or Select Existing Tunnel from Playit Account ({remoteTunnels.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadRemoteTunnels}
                    disabled={isLoadingRemote}
                    className="text-zinc-400 hover:text-zinc-200 text-[11px] h-6 px-2 gap-1"
                  >
                    {isLoadingRemote ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {remoteTunnels.map((t) => {
                    const isSelected = publicAddress === t.publicAddress;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setPublicAddress(t.publicAddress);
                          if (t.publicPort) setPublicPort(t.publicPort);
                        }}
                        className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-950/30 text-emerald-200"
                            : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 text-zinc-300"
                        }`}
                      >
                        <div className="space-y-0.5 truncate">
                          <div className="font-medium text-xs truncate flex items-center gap-1.5">
                            <span className="font-mono text-emerald-400">{t.publicAddress}</span>
                            {t.publicPort ? (
                              <Badge variant="outline" className="text-[10px] py-0 border-zinc-700 font-mono">
                                Port: {t.publicPort}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {t.name} • {t.tunnelType} ({t.portType.toUpperCase()})
                          </div>
                        </div>
                        {isSelected ? (
                          <Badge className="bg-emerald-600 text-white text-[10px] shrink-0">Selected</Badge>
                        ) : (
                          <span className="text-[11px] text-emerald-400 hover:underline shrink-0">Use This →</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Manual Override Option */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowManualAddress(!showManualAddress)}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline decoration-zinc-600 underline-offset-2 flex items-center gap-1"
              >
                {showManualAddress ? "Hide manual hostname entry" : "Need to manually enter custom hostname or port?"}
              </button>

              {showManualAddress && (
                <div className="mt-3 p-3.5 rounded-lg border border-zinc-800 bg-zinc-950/60 grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Public Hostname / Address</Label>
                    <Input
                      placeholder="e.g. my-cool-server.auto.playit.gg or xxxx.joinmc.link"
                      value={publicAddress}
                      onChange={(e) => setPublicAddress(e.target.value)}
                      className="bg-zinc-900 border-zinc-800 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Public Port (if assigned)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 25565 or 48192"
                      value={publicPort}
                      onChange={(e) => setPublicPort(e.target.value === "" ? "" : Number(e.target.value))}
                      className="bg-zinc-900 border-zinc-800 font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 8: Verification & Completion */}
        {step === 8 && (
          <div className="space-y-4 py-3">
            <h3 className="font-semibold text-zinc-200">Step 8: Connectivity Test & Summary</h3>
            <p className="text-sm text-zinc-400">
              Review your tunnel configuration and perform an end-to-end reachability test before saving.
            </p>

            <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-400">Server:</span>
                <span className="text-zinc-200 font-medium">{selectedServer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Local Origin:</span>
                <span className="text-zinc-200 font-mono">127.0.0.1:{localPort} ({protocol.toUpperCase()})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Public Address:</span>
                <span className="text-emerald-400 font-mono font-medium">
                  {publicAddress ? `${publicAddress}${publicPort ? `:${publicPort}` : ""}` : "Pending assignment"}
                </span>
              </div>
            </div>

            {publicAddress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Test Public Reachability:</span>
                  <Button
                    onClick={handleTestRemote}
                    disabled={remoteTesting}
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 hover:border-emerald-500 text-xs"
                  >
                    {remoteTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test Endpoint"}
                  </Button>
                </div>

                {remoteTestResult && (
                  <div
                    className={`p-3 rounded border text-xs ${
                      remoteTestResult.reachable
                        ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                        : "border-amber-500/30 bg-amber-950/20 text-amber-300"
                    }`}
                  >
                    {remoteTestResult.reachable ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Remote endpoint is online and reachable! Latency: {remoteTestResult.latencyMs}ms.
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        {remoteTestResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-between items-center sm:justify-between pt-2">
          {step > 1 ? (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <div />
          )}

          {step < 8 ? (
            <Button
              onClick={() => setStep(step + 1)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSaveTunnel}
              disabled={isSavingTunnel}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
            >
              {isSavingTunnel ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save & Activate Tunnel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
