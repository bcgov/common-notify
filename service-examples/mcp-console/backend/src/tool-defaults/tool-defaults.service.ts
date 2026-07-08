import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaveToolDefaultsDto } from './dto/save-tool-defaults.dto';
import { ToolParameterDefault } from './entities/tool-parameter-default.entity';

const GLOBAL_SENTINEL = '';

export interface ToolDefaults {
  global: Record<string, unknown>;
  tenant: Record<string, unknown>;
}

@Injectable()
export class ToolDefaultsService {
  constructor(
    @InjectRepository(ToolParameterDefault)
    private readonly repository: Repository<ToolParameterDefault>,
  ) {}

  async getDefaults(serverId: string, toolName: string, tenantName?: string): Promise<ToolDefaults> {
    const rows = await this.repository.find({ where: { serverId, toolName } });
    const global: Record<string, unknown> = {};
    const tenant: Record<string, unknown> = {};

    for (const row of rows) {
      if (row.tenantName === GLOBAL_SENTINEL) {
        global[row.parameterName] = row.value;
      } else if (tenantName && row.tenantName === tenantName) {
        tenant[row.parameterName] = row.value;
      }
    }

    return { global, tenant };
  }

  /**
   * Upserts the given parameter values at the requested scope. For scope 'tenant', any
   * parameter that already has a global lock is silently dropped — a tenant admin cannot
   * override a global default even via a direct API call, only through the (already-disabled)
   * form field.
   */
  async saveDefaults(serverId: string, toolName: string, dto: SaveToolDefaultsDto): Promise<ToolDefaults> {
    const tenantName = dto.scope === 'global' ? GLOBAL_SENTINEL : (dto.tenantName as string);

    let values = dto.values ?? {};
    if (dto.scope === 'tenant') {
      const { global } = await this.getDefaults(serverId, toolName);
      values = Object.fromEntries(
        Object.entries(values).filter(([parameterName]) => !(parameterName in global)),
      );
    }

    for (const [parameterName, value] of Object.entries(values)) {
      const existing = await this.repository.findOne({
        where: { serverId, toolName, parameterName, tenantName },
      });
      if (existing) {
        existing.value = value;
        await this.repository.save(existing);
      } else {
        await this.repository.save(
          this.repository.create({ serverId, toolName, parameterName, tenantName, value }),
        );
      }
    }

    return this.getDefaults(serverId, toolName, dto.scope === 'tenant' ? tenantName : undefined);
  }
}
