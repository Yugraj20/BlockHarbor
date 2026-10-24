"use client";
import { api } from "@/api";
import type { PlayitTunnelConfig } from "@/api/playit/playit.api";
import type { NetworkInfo } from "@/api/system-monitoring/system-monitoring.model";
import { useEffect, useState } from "react";

export interface ServerAddressEntry {
  label: "playit" | "public" | "local";
  host: string;
  port: string | null;
  full: string;
  name?: string;
}

export interface ServerAddressInfo {
  loading: boolean;
  port: string | null;
  playitEntries: ServerAddressEntry[];
  publicEntry: ServerAddressEntry | null;
  localEntries: ServerAddressEntry[];
  /** Convenience: first available entry (Playit tunnel preferred), or null */
  primary: ServerAddressEntry | null;
}

const portCache = new Map<string, string | null>();
const portInflight = new Map<string, Promise<string | null>>();

let networkCache: { value: NetworkInfo; fetchedAt: number } | null = null;
let networkInflight: Promise<NetworkInfo> | null = null;
const NETWORK_TTL_MS = 5 * 60 * 1000;

async function resolvePort(serverId: string): Promise<string | null> {
  if (portCache.has(serverId)) return portCache.get(serverId)!;
  if (portInflight.has(serverId)) return portInflight.get(serverId)!;

  const promise = (async () => {
    try {
      const props = await api.servers.getProperties(serverId);
      const port = props?.["server-port"]?.toString().trim() || null;
      portCache.set(serverId, port);
      return port;
    } catch {
      portCache.set(serverId, null);
      return null;
    } finally {
      portInflight.delete(serverId);
    }
  })();

  portInflight.set(serverId, promise);
  return promise;
}

async function resolveNetwork(): Promise<NetworkInfo> {
  const now = Date.now();
  if (networkCache && now - networkCache.fetchedAt < NETWORK_TTL_MS) {
    return networkCache.value;
  }
  if (networkInflight) return networkInflight;

  networkInflight = (async () => {
    try {
      const info = await api.systemMonitoring.getNetworkInfo();
      networkCache = { value: info, fetchedAt: Date.now() };
      return info;
    } catch {
      const fallback: NetworkInfo = { publicIp: null, privateIps: [] };
      networkCache = { value: fallback, fetchedAt: Date.now() };
      return fallback;
    } finally {
      networkInflight = null;
    }
  })();

  return networkInflight;
}

function buildEntry(
  label: ServerAddressEntry["label"],
  host: string,
  port: string | null,
  name?: string
): ServerAddressEntry {
  const cleanHost = host.includes(":") ? host.split(":")[0] : host;
  const effectivePort = port ?? (host.includes(":") ? host.split(":")[1] : null);
  return {
    label,
    host: cleanHost,
    port: effectivePort,
    full: effectivePort ? `${cleanHost}:${effectivePort}` : cleanHost,
    name,
  };
}

export function useServerAddress(serverId?: string | null): ServerAddressInfo {
  const [port, setPort] = useState<string | null>(
    serverId ? (portCache.get(serverId) ?? null) : null
  );
  const [network, setNetwork] = useState<NetworkInfo | null>(
    networkCache?.value ?? null
  );
  const [playitTunnels, setPlayitTunnels] = useState<PlayitTunnelConfig[]>([]);
  const [loadingNetwork, setLoadingNetwork] = useState<boolean>(!networkCache);
  const [loadingPort, setLoadingPort] = useState<boolean>(
    !!serverId && !portCache.has(serverId)
  );

  useEffect(() => {
    let active = true;
    if (!networkCache) setLoadingNetwork(true);
    resolveNetwork().then((info) => {
      if (active) {
        setNetwork(info);
        setLoadingNetwork(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchTunnels = async () => {
      try {
        let list = serverId
          ? await api.playit.getTunnels(serverId)
          : await api.playit.getTunnels();
        if (serverId && (!list || list.length === 0)) {
          list = await api.playit.getTunnels();
        }
        if (active && Array.isArray(list)) {
          setPlayitTunnels(list.filter((t) => !!t.publicAddress));
        }
      } catch {
        // ignore if Playit is not configured
      }
    };
    fetchTunnels();
    const timer = setInterval(fetchTunnels, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [serverId]);

  useEffect(() => {
    if (!serverId) {
      setPort(null);
      setLoadingPort(false);
      return;
    }
    let active = true;
    const cached = portCache.get(serverId);
    if (cached !== undefined) {
      setPort(cached);
      setLoadingPort(false);
    } else {
      setLoadingPort(true);
      resolvePort(serverId).then((p) => {
        if (active) {
          setPort(p);
          setLoadingPort(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [serverId]);

  const playitEntries = playitTunnels
    .filter((t) => !!t.publicAddress)
    .map((t) =>
      buildEntry(
        "playit",
        t.publicAddress!,
        t.publicPort ? String(t.publicPort) : null,
        t.name
      )
    );

  const publicEntry = network?.publicIp
    ? buildEntry("public", network.publicIp, port)
    : null;

  const localEntries = (network?.privateIps ?? []).map((ip) =>
    buildEntry("local", ip, port)
  );

  // Prefer Playit tunnel address first so players get the working tunnel IP immediately
  const primary =
    playitEntries[0] || localEntries[0] || publicEntry || null;

  return {
    loading: loadingNetwork || loadingPort,
    port,
    playitEntries,
    publicEntry,
    localEntries,
    primary,
  };
}
