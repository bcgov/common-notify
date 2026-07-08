import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ToolParameterDefault } from './entities/tool-parameter-default.entity';
import { ToolDefaultsController } from './tool-defaults.controller';
import { ToolDefaultsService } from './tool-defaults.service';

@Module({
  imports: [TypeOrmModule.forFeature([ToolParameterDefault])],
  controllers: [ToolDefaultsController],
  providers: [ToolDefaultsService],
})
export class ToolDefaultsModule {}
