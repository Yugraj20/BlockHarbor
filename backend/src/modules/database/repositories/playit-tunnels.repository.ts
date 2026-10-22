import { Injectable } from "@nestjs/common";
import type {
  IPlayitTunnel,
  PlayitProtocol,
  PlayitTunnelStatus,
  PlayitTunnelType,
} from "@shared/types/playit.types";
import { randomUUID } from "crypto";
import { SqliteProvider } from "../sqlite.provider";

export abstract class IPlayitTunnelsRepository {
  abstract findAll(): IPlayitTunnel[];
  abstract findByServerId(serverId: string): IPlayitTunnel[];
  abstract findById(id: string): IPlayitTunnel | null;
  abstract create(tunnel: Omit<IPlayitTunnel, "id" | "createdAt" | "updatedAt">): IPlayitTunnel;
  abstract update(id: string, updates: Partial<IPlayitTunnel>): IPlayitTunnel | null;
  abstract delete(id: string): boolean;
}

@Injectable()
export class PlayitTunnelsRepository implements IPlayitTunnelsRepository {
  constructor(private readonly sqlite: SqliteProvider) {}

  findAll(): IPlayitTunnel[] {
    const rows = this.sqlite.connection.query("SELECT * FROM playit_tunnels ORDER BY createdAt DESC").all();
    return rows.map((r: any) => this.deserialize(r));
  }

  findByServerId(serverId: string): IPlayitTunnel[] {
    const rows = this.sqlite.connection
      .query("SELECT * FROM playit_tunnels WHERE serverId = ? ORDER BY createdAt DESC")
      .all(serverId);
    return rows.map((r: any) => this.deserialize(r));
  }

  findById(id: string): IPlayitTunnel | null {
    const row = this.sqlite.connection
      .query("SELECT * FROM playit_tunnels WHERE id = ?")
      .get(id);
    return row ? this.deserialize(row) : null;
  }

  create(tunnel: Omit<IPlayitTunnel, "id" | "createdAt" | "updatedAt">): IPlayitTunnel {
    const id = randomUUID();
    const now = Date.now();
    const stmt = this.sqlite.connection.prepare(`
      INSERT INTO playit_tunnels
      (id, serverId, name, protocol, localIp, localPort, publicAddress, publicPort, tunnelType, status, lastHealthCheck, healthDetails, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      tunnel.serverId,
      tunnel.name,
      tunnel.protocol,
      tunnel.localIp || "127.0.0.1",
      tunnel.localPort,
      tunnel.publicAddress ?? null,
      tunnel.publicPort ?? null,
      tunnel.tunnelType || "minecraft-java",
      tunnel.status || "unknown",
      tunnel.lastHealthCheck ?? null,
      tunnel.healthDetails ?? null,
      now,
      now,
    );

    return this.findById(id)!;
  }

  update(id: string, updates: Partial<IPlayitTunnel>): IPlayitTunnel | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const merged: IPlayitTunnel = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const stmt = this.sqlite.connection.prepare(`
      UPDATE playit_tunnels SET
        name = ?,
        protocol = ?,
        localIp = ?,
        localPort = ?,
        publicAddress = ?,
        publicPort = ?,
        tunnelType = ?,
        status = ?,
        lastHealthCheck = ?,
        healthDetails = ?,
        updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(
      merged.name,
      merged.protocol,
      merged.localIp,
      merged.localPort,
      merged.publicAddress ?? null,
      merged.publicPort ?? null,
      merged.tunnelType,
      merged.status,
      merged.lastHealthCheck ?? null,
      merged.healthDetails ?? null,
      merged.updatedAt,
      id,
    );

    return this.findById(id);
  }

  delete(id: string): boolean {
    const info = this.sqlite.connection
      .query("DELETE FROM playit_tunnels WHERE id = ?")
      .run(id);
    return info.changes > 0;
  }

  private deserialize(row: any): IPlayitTunnel {
    return {
      id: row.id,
      serverId: row.serverId,
      name: row.name,
      protocol: row.protocol as PlayitProtocol,
      localIp: row.localIp,
      localPort: Number(row.localPort),
      publicAddress: row.publicAddress || null,
      publicPort: row.publicPort ? Number(row.publicPort) : null,
      tunnelType: row.tunnelType as PlayitTunnelType,
      status: row.status as PlayitTunnelStatus,
      lastHealthCheck: row.lastHealthCheck ? Number(row.lastHealthCheck) : null,
      healthDetails: row.healthDetails || null,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
    };
  }
}
