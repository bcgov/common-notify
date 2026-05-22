import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotifyUser } from './entities/notify-user.entity'
import { UpsertUserDto } from './schemas/upsert-user.dto'
import { UserResponseDto, UpsertUserResponseDto } from './schemas/user-response.dto'

/**
 * UsersService
 * Handles user record management in the notify_user table.
 * Users are created on first login (upsert) and can be queried by admins.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    @InjectRepository(NotifyUser)
    private readonly userRepository: Repository<NotifyUser>,
  ) {}

  /**
   * Upsert a user: find by externalId, create if not found, update if found
   *
   * @param dto Contains external ID (from JWT), email, display name, etc.
   * @param createdBy User/system identifier making the request (for audit trail)
   * @returns UpsertUserResponseDto with the user and isNew flag
   */
  async upsertUser(dto: UpsertUserDto, createdBy: string): Promise<UpsertUserResponseDto> {
    const now = new Date()

    this.logger.debug(`[upsertUser] Starting upsert for externalId: ${dto.id}`)

    // Find existing user by external_id
    let user = await this.userRepository.findOne({
      where: {
        externalId: dto.id,
        isDeleted: false,
      },
    })

    this.logger.debug(`[upsertUser] User lookup result: ${user ? 'found' : 'not found'}`)

    let isNew = false

    if (!user) {
      // Create new user
      this.logger.debug(`[upsertUser] Creating new user with data:`, JSON.stringify(dto))
      user = this.userRepository.create({
        externalId: dto.id,
        displayName: dto.displayName,
        email: dto.email,
        username: dto.username,
        givenName: dto.givenName,
        familyName: dto.familyName,
        createdAt: now,
        createdBy,
        updatedAt: now,
        updatedBy: createdBy,
        isDeleted: false,
      })
      const savedUser = await this.userRepository.save(user)
      isNew = true
      this.logger.debug(
        `[upsertUser] Created new user: id=${savedUser.id}, externalId=${dto.id}, username=${dto.username}`,
      )
    } else {
      // Update existing user only if data has changed
      this.logger.debug(`[upsertUser] Updating existing user: id=${user.id}`)

      // Check which fields have actually changed
      const changedFields: string[] = []

      if (user.displayName !== dto.displayName) {
        user.displayName = dto.displayName
        changedFields.push('displayName')
      }
      if (user.email !== dto.email) {
        user.email = dto.email
        changedFields.push('email')
      }
      if (user.username !== dto.username) {
        user.username = dto.username
        changedFields.push('username')
      }
      if (user.givenName !== dto.givenName) {
        user.givenName = dto.givenName
        changedFields.push('givenName')
      }
      if (user.familyName !== dto.familyName) {
        user.familyName = dto.familyName
        changedFields.push('familyName')
      }

      // Only save if something changed
      if (changedFields.length > 0) {
        user.updatedAt = now
        user.updatedBy = createdBy
        const savedUser = await this.userRepository.save(user)
        this.logger.debug(
          `[upsertUser] Updated user: id=${savedUser.id}, username=${dto.username}, changed=[${changedFields.join(', ')}]`,
        )
      } else {
        this.logger.debug(
          `[upsertUser] No changes detected for user: id=${user.id}, skipping update`,
        )
      }
    }

    return {
      user: this.mapToResponseDto(user),
      isNew,
      message: isNew ? 'User created successfully' : 'User updated successfully',
    }
  }

  /**
   * Get all non-deleted users
   *
   * @returns Array of UserResponseDto
   */
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.find({
      where: {
        isDeleted: false,
      },
      order: {
        createdAt: 'DESC',
      },
    })

    return users.map((user) => this.mapToResponseDto(user))
  }

  /**
   * Get a user by their internal ID
   *
   * @param id Internal user UUID
   * @returns UserResponseDto or null if not found
   */
  async findById(id: string): Promise<UserResponseDto | null> {
    const user = await this.userRepository.findOne({
      where: {
        id,
        isDeleted: false,
      },
    })

    return user ? this.mapToResponseDto(user) : null
  }

  /**
   * Get a user by their external ID (identity provider ID)
   *
   * @param externalId External ID from identity provider
   * @returns UserResponseDto or null if not found
   */
  async findByExternalId(externalId: string): Promise<UserResponseDto | null> {
    const user = await this.userRepository.findOne({
      where: {
        externalId,
        isDeleted: false,
      },
    })

    return user ? this.mapToResponseDto(user) : null
  }

  /**
   * Map NotifyUser entity to response DTO
   */
  private mapToResponseDto(user: NotifyUser): UserResponseDto {
    return {
      id: user.id,
      externalId: user.externalId,
      displayName: user.displayName,
      email: user.email,
      username: user.username,
      givenName: user.givenName,
      familyName: user.familyName,
      createdAt: user.createdAt,
      createdBy: user.createdBy,
      updatedAt: user.updatedAt,
      updatedBy: user.updatedBy,
      isDeleted: user.isDeleted,
    }
  }
}
