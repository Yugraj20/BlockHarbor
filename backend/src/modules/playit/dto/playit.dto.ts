import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import type { PlayitProtocol, PlayitTunnelType } from "@shared/types/playit.types";

export class CreatePlayitTunnelDto {
  @ApiProperty({ description: "Target server ID" })
  @IsString()
  @IsNotEmpty()
  serverId: string;

  @ApiProperty({ description: "Friendly name for the tunnel" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ["tcp", "udp"], default: "tcp" })
  @IsIn(["tcp", "udp"])
  protocol: PlayitProtocol;

  @ApiPropertyOptional({ default: "127.0.0.1" })
  @IsString()
  @IsOptional()
  localIp?: string;

  @ApiProperty({ description: "Local listening port of the Minecraft server or service" })
  @IsInt()
  @Min(1)
  @Max(65535)
  localPort: number;

  @ApiPropertyOptional({ description: "Public address assigned by Playit.gg" })
  @IsString()
  @IsOptional()
  publicAddress?: string;

  @ApiPropertyOptional({ description: "Public port assigned by Playit.gg" })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  publicPort?: number;

  @ApiProperty({
    enum: ["minecraft-java", "minecraft-bedrock", "voice-chat", "custom"],
    default: "minecraft-java",
  })
  @IsIn(["minecraft-java", "minecraft-bedrock", "voice-chat", "custom"])
  tunnelType: PlayitTunnelType;
}

export class UpdatePlayitTunnelDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: ["tcp", "udp"] })
  @IsIn(["tcp", "udp"])
  @IsOptional()
  protocol?: PlayitProtocol;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  localIp?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  localPort?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  publicAddress?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  publicPort?: number;

  @ApiPropertyOptional({
    enum: ["minecraft-java", "minecraft-bedrock", "voice-chat", "custom"],
  })
  @IsIn(["minecraft-java", "minecraft-bedrock", "voice-chat", "custom"])
  @IsOptional()
  tunnelType?: PlayitTunnelType;
}

export class TestLocalPortDto {
  @ApiProperty({ default: 25565 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiPropertyOptional({ default: "127.0.0.1" })
  @IsString()
  @IsOptional()
  ip?: string;
}

export class TestRemoteEndpointDto {
  @ApiProperty({ example: "subdomain.auto.playit.gg" })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty({ example: 25565 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;
}

export class SetPlayitSecretDto {
  @ApiProperty({ description: "Playit.gg agent secret key" })
  @IsString()
  @IsNotEmpty()
  secret: string;
}

export class CreateAutoPlayitTunnelDto {
  @ApiProperty({ description: "Target server ID" })
  @IsString()
  @IsNotEmpty()
  serverId: string;

  @ApiPropertyOptional({ description: "Friendly name for the tunnel", default: "Minecraft Java Tunnel" })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    enum: ["minecraft-java", "minecraft-bedrock", "voice-chat", "custom"],
    default: "minecraft-java",
  })
  @IsOptional()
  tunnelType?: PlayitTunnelType;

  @ApiPropertyOptional({ enum: ["tcp", "udp"], default: "tcp" })
  @IsOptional()
  protocol?: PlayitProtocol;

  @ApiPropertyOptional({ default: 25565 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  localPort?: number;

  @ApiPropertyOptional({ default: "127.0.0.1" })
  @IsString()
  @IsOptional()
  localIp?: string;
}
