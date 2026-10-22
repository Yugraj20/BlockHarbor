import { Module } from "@nestjs/common";
import { PlayitController } from "./playit.controller";
import { PlayitService } from "./playit.service";

@Module({
  imports: [],
  controllers: [PlayitController],
  providers: [PlayitService],
  exports: [PlayitService],
})
export class PlayitModule {}
