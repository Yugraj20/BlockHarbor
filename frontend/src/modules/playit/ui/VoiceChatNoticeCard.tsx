"use client";

import React from "react";
import { Mic, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface VoiceChatNoticeCardProps {
  onAddVoiceTunnel: () => void;
}

export function VoiceChatNoticeCard({ onAddVoiceTunnel }: VoiceChatNoticeCardProps) {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 relative overflow-hidden">
      <div className="flex items-start gap-3.5">
        <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 shrink-0">
          <Mic className="w-5 h-5" />
        </div>

        <div className="space-y-1.5 flex-1">
          <div className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
            Pro-Tip: Simple Voice Chat & UDP Mods Require Separate Tunnels
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Minecraft Java Edition uses <span className="text-zinc-200 font-medium">TCP</span> on port 25565 for game data. 
            However, proximity voice chat mods such as <strong>Simple Voice Chat</strong> or <strong>Plasmo Voice</strong> transmit audio packets over <span className="text-zinc-200 font-medium">UDP</span> (default port 24454).
            Forwarding your main Minecraft TCP port will <em>not</em> route voice traffic. A separate UDP tunnel must be mapped to your voice port.
          </p>

          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onAddVoiceTunnel}
              className="border-zinc-700 hover:border-emerald-500 text-xs gap-1.5"
            >
              Configure Voice Chat Tunnel (UDP 24454) <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
