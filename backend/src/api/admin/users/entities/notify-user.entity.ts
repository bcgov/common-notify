import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm'

/**
 * NotifyUser Entity
 * Represents a user within the Notify system.
 * Users authenticate via external identity providers (Keycloak/IDIR) and are mapped to this internal record.
 * The id is an internally-generated UUID, while external_id links to the identity provider's user ID.
 */
@Entity('notify_user')
export class NotifyUser {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ nullable: true, name: 'external_id' })
  externalId: string

  @Column({ nullable: true, name: 'display_name' })
  displayName: string

  @Column({ nullable: true })
  email: string

  @Column({ nullable: true })
  username: string

  @Column({ nullable: true, name: 'given_name' })
  givenName: string

  @Column({ nullable: true, name: 'family_name' })
  familyName: string

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string

  @Column({ default: false, name: 'is_deleted' })
  isDeleted: boolean
}
