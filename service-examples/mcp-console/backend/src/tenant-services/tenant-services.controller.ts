import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AddTenantServiceDto } from './dto/add-tenant-service.dto';
import { SetDefaultToolDto } from './dto/set-default-tool.dto';
import { TenantServicesService, TenantServiceSummary } from './tenant-services.service';

@Controller('tenant-services')
export class TenantServicesController {
  constructor(private readonly service: TenantServicesService) {}

  @Get()
  list(@Query('tenant') tenant?: string): Promise<TenantServiceSummary[]> {
    if (!tenant) throw new BadRequestException('Query parameter "tenant" is required');
    return this.service.list(tenant);
  }

  @Post()
  add(@Body() dto: AddTenantServiceDto): Promise<void> {
    return this.service.add(dto);
  }

  @Post('default-tool')
  setDefaultTool(@Body() dto: SetDefaultToolDto): Promise<void> {
    return this.service.setDefaultTool(dto);
  }
}
