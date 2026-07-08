import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A saved default value for one tool parameter, at one of two layers:
 *  - global  (tenantName = '')   — set by the global admin, locked, cannot be overridden by tenants
 *  - tenant  (tenantName = '<x>') — set by a tenant admin, only for parameters with no global lock
 */
@Entity('tool_parameter_default')
@Index(['serverId', 'toolName', 'parameterName', 'tenantName'], { unique: true })
export class ToolParameterDefault {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  serverId: string;

  @Column({ type: 'varchar', length: 200 })
  toolName: string;

  @Column({ type: 'varchar', length: 200 })
  parameterName: string;

  /** Empty string means "global" (no tenant) — see the unique index above. */
  @Column({ type: 'varchar', length: 200, default: '' })
  tenantName: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
