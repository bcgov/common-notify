import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { encrypt } from '../common/crypto.util';
import { CreateMcpServerDto } from './dto/create-mcp-server.dto';
import { UpdateEnabledToolsDto } from './dto/update-enabled-tools.dto';
import { McpServerRegistration } from './entities/mcp-server.entity';

export interface McpServerSummary {
  id: string;
  shortName: string;
  url: string;
  transport: string;
  category: string;
  enabledTools: string[];
  createdAt: Date;
}

function toSummary(entity: McpServerRegistration): McpServerSummary {
  const { id, shortName, url, transport, category, enabledTools, createdAt } = entity;
  return { id, shortName, url, transport, category, enabledTools, createdAt };
}

@Injectable()
export class McpServersService {
  constructor(
    @InjectRepository(McpServerRegistration)
    private readonly repository: Repository<McpServerRegistration>,
  ) {}

  async list(): Promise<McpServerSummary[]> {
    const entities = await this.repository.find({ order: { createdAt: 'DESC' } });
    return entities.map(toSummary);
  }

  async getSummary(id: string): Promise<McpServerSummary> {
    return toSummary(await this.getEntity(id));
  }

  /** Only for internal use by McpClientModule to build a live connection — never exposed via a controller response. */
  async getEntity(id: string): Promise<McpServerRegistration> {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`No registered MCP server with id "${id}"`);
    return entity;
  }

  async create(dto: CreateMcpServerDto): Promise<McpServerSummary> {
    const entity = this.repository.create({
      shortName: dto.shortName,
      url: dto.url,
      transport: dto.transport,
      category: dto.category,
      apiKey: encrypt(dto.apiKey),
      enabledTools: dto.enabledTools,
    });
    return toSummary(await this.repository.save(entity));
  }

  async updateEnabledTools(id: string, dto: UpdateEnabledToolsDto): Promise<McpServerSummary> {
    const entity = await this.getEntity(id);
    entity.enabledTools = dto.enabledTools;
    return toSummary(await this.repository.save(entity));
  }
}
