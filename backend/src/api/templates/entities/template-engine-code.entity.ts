import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * Template rendering engine options.
 * Defines the available template engines for rendering notification templates.
 */
@Entity('template_engine_code')
export class TemplateEngineCode {
  /**
   * Engine code (e.g., legacy_gc_notify, handlebars, mustache, ejs)
   */
  @PrimaryColumn({ name: 'engine_code', length: 50 })
  engineCode: string

  /**
   * Human-readable description of the engine
   */
  @Column({ length: 255 })
  description: string

  /**
   * Timestamp when the engine code was created
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  /**
   * User or process that created this record
   */
  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  /**
   * Timestamp when the engine code was last updated
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  /**
   * User or process that last updated this record
   */
  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
