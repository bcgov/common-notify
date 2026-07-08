import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpServersService, McpServerSummary } from '../mcp-servers/mcp-servers.service';
import { AddTenantServiceDto } from './dto/add-tenant-service.dto';
import { SetDefaultToolDto } from './dto/set-default-tool.dto';
import { TenantServiceSubscription } from './entities/tenant-service-subscription.entity';

export interface TenantServiceSummary extends McpServerSummary {
  defaultToolName: string | null;
}

@Injectable()
export class TenantServicesService {
  constructor(
    @InjectRepository(TenantServiceSubscription)
    private readonly repository: Repository<TenantServiceSubscription>,
    private readonly mcpServers: McpServersService,
  ) {}

  async list(tenantName: string): Promise<TenantServiceSummary[]> {
    const subscriptions = await this.repository.find({ where: { tenantName } });
    return Promise.all(
      subscriptions.map(async (subscription) => ({
        ...(await this.mcpServers.getSummary(subscription.serverId)),
        defaultToolName: subscription.defaultToolName,
      })),
    );
  }

  async add(dto: AddTenantServiceDto): Promise<void> {
    await this.mcpServers.getEntity(dto.serverId); // throws NotFoundException if unknown

    const existing = await this.repository.findOne({
      where: { tenantName: dto.tenantName, serverId: dto.serverId },
    });
    if (existing) {
      throw new ConflictException(`"${dto.tenantName}" has already added this service`);
    }

    await this.repository.save(
      this.repository.create({ tenantName: dto.tenantName, serverId: dto.serverId }),
    );
  }

  async setDefaultTool(dto: SetDefaultToolDto): Promise<void> {
    const subscription = await this.repository.findOne({
      where: { tenantName: dto.tenantName, serverId: dto.serverId },
    });
    if (!subscription) {
      throw new NotFoundException(`"${dto.tenantName}" has not added this service yet`);
    }

    const server = await this.mcpServers.getEntity(dto.serverId);
    if (!server.enabledTools.includes(dto.toolName)) {
      throw new BadRequestException(`"${dto.toolName}" is not an enabled tool for this service`);
    }

    subscription.defaultToolName = dto.toolName;
    await this.repository.save(subscription);
  }
}
