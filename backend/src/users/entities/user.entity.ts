import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('users', { schema: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number

  @Column({
    type: 'varchar',
    length: 200,
  })
  name: string

  @Column({
    type: 'varchar',
    length: 200,
  })
  email: string
}
