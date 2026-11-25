import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Template } from './template.entity'

/** Shared sample placeholder values for a template across all its versions. */
@Entity('template_preview_data')
@Check('chk_template_preview_data_params_object', "jsonb_typeof(params) = 'object'")
export class TemplatePreviewData {
  @PrimaryColumn({
    name: 'template_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_template_preview_data',
  })
  templateId: string

  @OneToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'template_id',
    foreignKeyConstraintName: 'fk_template_preview_data_template',
  })
  template: Template

  // Boolean form values stay as the strings "true" and "false".
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  params: Record<string, string>

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date

  @Column({ name: 'created_by', type: 'varchar', length: 200 })
  createdBy: string

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date

  @Column({ name: 'updated_by', type: 'varchar', length: 200 })
  updatedBy: string
}
