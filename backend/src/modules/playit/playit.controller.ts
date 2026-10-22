import { ApiErrorResponses } from "@/core/decorators/api-error-responses.decorator";
import { BearerAuthGuard } from "@/modules/auth/guards/bearer.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permission.guard";
import { RequirePermissions } from "@/modules/auth/decorators/require-permissions.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserPermissions } from "@shared/types/user.types";
import {
  CreatePlayitTunnelDto,
  SetPlayitSecretDto,
  TestLocalPortDto,
  TestRemoteEndpointDto,
  UpdatePlayitTunnelDto,
} from "./dto/playit.dto";
import { PlayitService } from "./playit.service";

@ApiTags("Playit")
@ApiBearerAuth()
@Controller("api/playit")
@UseGuards(BearerAuthGuard, PermissionsGuard)
export class PlayitController {
  constructor(private readonly playitService: PlayitService) {}

  @Get("status")
  @ApiOperation({ summary: "Get Playit.gg agent status, PID, and claim URL" })
  @ApiOkResponse({ description: "Current Playit agent status" })
  getAgentStatus() {
    return this.playitService.getAgentStatus();
  }

  @Post("agent/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start the managed Playit agent" })
  @RequirePermissions(UserPermissions.SERVERS_CONTROL)
  startAgent() {
    return this.playitService.startAgent();
  }

  @Post("agent/stop")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Stop the managed Playit agent" })
  @RequirePermissions(UserPermissions.SERVERS_CONTROL)
  stopAgent() {
    return this.playitService.stopAgent();
  }

  @Post("agent/download")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Download the official Playit agent for this platform" })
  @RequirePermissions(UserPermissions.KUBEK_SETTINGS)
  downloadAgent() {
    return this.playitService.downloadAgent();
  }

  @Post("agent/claim/refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Regenerate or refresh Playit claim link" })
  @RequirePermissions(UserPermissions.SERVERS_CONTROL)
  refreshClaim() {
    return this.playitService.initiateClaimFlow(true);
  }

  @Post("agent/secret")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Configure Playit agent secret key directly" })
  @RequirePermissions(UserPermissions.SERVERS_CONTROL)
  setSecret(@Body() dto: SetPlayitSecretDto) {
    return this.playitService.setSecret(dto.secret);
  }

  @Get("tunnels")
  @ApiOperation({ summary: "List configured Playit tunnels" })
  getTunnels(@Query("serverId") serverId?: string) {
    if (serverId) {
      return this.playitService.getTunnelsForServer(serverId);
    }
    return this.playitService.getAllTunnels();
  }

  @Get("tunnels/:id")
  @ApiOperation({ summary: "Get single Playit tunnel by ID" })
  getTunnelById(@Param("id") id: string) {
    return this.playitService.getTunnelById(id);
  }

  @Post("tunnels")
  @ApiOperation({ summary: "Create a new Playit tunnel mapping" })
  @RequirePermissions(UserPermissions.SERVERS_CONFIGURE)
  createTunnel(@Body() dto: CreatePlayitTunnelDto) {
    return this.playitService.createTunnel(dto);
  }

  @Put("tunnels/:id")
  @ApiOperation({ summary: "Update Playit tunnel mapping" })
  @RequirePermissions(UserPermissions.SERVERS_CONFIGURE)
  updateTunnel(
    @Param("id") id: string,
    @Body() dto: UpdatePlayitTunnelDto,
  ) {
    return this.playitService.updateTunnel(id, dto);
  }

  @Delete("tunnels/:id")
  @ApiOperation({ summary: "Delete a Playit tunnel mapping" })
  @RequirePermissions(UserPermissions.SERVERS_CONFIGURE)
  deleteTunnel(@Param("id") id: string) {
    return this.playitService.deleteTunnel(id);
  }

  @Post("test-local")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Test if local Minecraft server port is listening" })
  testLocalPort(@Body() dto: TestLocalPortDto) {
    return this.playitService.testLocalPort(dto.port, dto.ip);
  }

  @Post("test-remote")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Test DNS resolution and connectivity to public Playit endpoint" })
  testRemoteEndpoint(@Body() dto: TestRemoteEndpointDto) {
    return this.playitService.testRemoteEndpoint(dto.host, dto.port);
  }

  @Get("diagnostics/:serverId")
  @ApiOperation({ summary: "Run comprehensive Playit & Minecraft server diagnostics" })
  getDiagnostics(@Param("serverId") serverId: string) {
    return this.playitService.getDiagnostics(serverId);
  }
}
