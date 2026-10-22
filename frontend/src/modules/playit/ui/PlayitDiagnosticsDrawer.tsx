"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Stethoscope,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";
import api from "@/api";
import type { IPlayitDiagnosticReport } from "@shared/types/playit.types";
import type { Server as IServer } from "@/api/servers/servers.model";

interface PlayitDiagnosticsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: IServer[];
}

export function PlayitDiagnosticsDrawer({
  open,
  onOpenChange,
  servers,
}: PlayitDiagnosticsDrawerProps) {
  const [selectedServerId, setSelectedServerId] = useState<string>(servers[0]?.id || "");
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<IPlayitDiagnosticReport | null>(null);
  const [copied, setCopied] = useState(false);

  const runDiagnostics = async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await api.playit.getDiagnostics(id);
      setReport(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    const text = [
      `=== BlockHarbor Playit Diagnostics: ${report.serverName} ===`,
      `Overall Healthy: ${report.overallHealthy ? "YES" : "NO"}`,
      `Timestamp: ${new Date(report.timestamp).toISOString()}`,
      `\nChecks:`,
      ...report.checks.map((c) => `[${c.status.toUpperCase()}] ${c.name}: ${c.message}`),
      `\nIssues:`,
      ...(report.issues.length ? report.issues.map((i) => `- ${i}`) : ["None detected"]),
      `\nRecommendations:`,
      ...(report.recommendations.length ? report.recommendations.map((r) => `- ${r}`) : ["None"]),
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-emerald-400" />
              Playit.gg Networking Diagnostics
            </DialogTitle>
          </div>
          <DialogDescription className="text-zinc-400">
            Automated verification of Minecraft server listeners, Playit client state, DNS, and remote reachability.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <div className="flex-1">
            <Select
              value={selectedServerId}
              onValueChange={(val) => {
                setSelectedServerId(val);
                runDiagnostics(val);
              }}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Select server to inspect" />
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

          <Button
            onClick={() => runDiagnostics(selectedServerId)}
            disabled={isLoading || !selectedServerId}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
            Run Check
          </Button>
        </div>

        {report && (
          <div className="space-y-4 pt-2">
            {/* Overall Status Banner */}
            <div
              className={`p-4 rounded-lg border flex items-center justify-between ${
                report.overallHealthy
                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
                  : "border-amber-500/40 bg-amber-950/20 text-amber-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {report.overallHealthy ? (
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-amber-400" />
                )}
                <div>
                  <div className="font-semibold text-sm">
                    {report.overallHealthy
                      ? "All Systems Operational"
                      : "Action Required for Public Access"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    Checked {report.checks.length} health indicators on {report.serverName}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReport}
                className="border-zinc-700 hover:border-zinc-600 text-xs gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Report"}
              </Button>
            </div>

            {/* Verification Checks */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                System Checks
              </div>

              <div className="space-y-1.5">
                {report.checks.map((check, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-md border border-zinc-800 bg-zinc-900/50 flex items-start gap-2.5 text-xs"
                  >
                    {check.status === "pass" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    {check.status === "warn" && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    {check.status === "fail" && (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 space-y-0.5">
                      <div className="font-medium text-zinc-200">{check.name}</div>
                      <div className="text-zinc-400">{check.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Identified Issues */}
            {report.issues.length > 0 && (
              <div className="space-y-1.5 p-3 rounded-lg border border-red-500/20 bg-red-950/10">
                <div className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Identified Issues
                </div>
                <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
                  {report.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actionable Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="space-y-1.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/10">
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Recommended Actions
                </div>
                <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
                  {report.recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
