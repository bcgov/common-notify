import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserDto } from './dto/user.dto'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(user: CreateUserDto): Promise<UserDto> {
    const savedUser = await this.usersRepository.save({
      name: user.name,
      email: user.email,
    })

    return {
      id: savedUser.id,
      name: savedUser.name,
      email: savedUser.email,
    }
  }

  async findAll(): Promise<UserDto[]> {
    const users = await this.usersRepository.find()
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }))
  }

  async findOne(id: number): Promise<UserDto> {
    const user = await this.usersRepository.findOneBy({
      id,
    })
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    }
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<UserDto> {
    await this.usersRepository.update(id, {
      name: updateUserDto.name,
      email: updateUserDto.email,
    })
    const user = await this.usersRepository.findOneBy({ id })
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    }
  }

  async remove(id: number): Promise<{ deleted: boolean; message?: string }> {
    try {
      const result = await this.usersRepository.delete(id)
      if (result.affected === 0) {
        return { deleted: false, message: 'User not found' }
      }
      return { deleted: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { deleted: false, message }
    }
  }

  async searchUsers(
    page: number,
    limit: number,
    sort: string, // JSON string to store sort key and sort value, ex: [{"name":"desc"},{"email":"asc"}]
    filter: string, // JSON array for key, operation and value, ex: [{"key": "name", "operation": "like", "value": "Jo"}]
  ): Promise<any> {
    page = page || 1
    if (!limit || limit > 200) {
      limit = 10
    }

    let sortObj: unknown[] = []
    let filterObj: Array<{ key: string; operation: string; value: unknown }> = []
    try {
      sortObj = JSON.parse(sort)
      const parsedFilter = JSON.parse(filter)
      // Ensure filterObj is an array
      filterObj = Array.isArray(parsedFilter) ? parsedFilter : []
    } catch {
      throw new Error('Invalid query parameters')
    }

    const query = this.usersRepository.createQueryBuilder('u')

    // Apply filters
    let paramIndex = 0
    for (const item of filterObj) {
      const paramName = `param${paramIndex}`
      const conditions = this.convertFilterToTypeOrmCondition(item, paramName)
      if (conditions) {
        query.andWhere(conditions.where, conditions.params)
      }
      paramIndex++
    }

    // Apply sorts
    for (const sortItem of sortObj) {
      for (const [key, direction] of Object.entries(sortItem)) {
        query.orderBy(`u.${key}`, direction as 'ASC' | 'DESC')
      }
    }

    // Apply pagination
    query.skip((page - 1) * limit).take(limit)

    const [users, count] = await query.getManyAndCount()

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
      })),
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    }
  }

  private convertFilterToTypeOrmCondition(
    filter: { key: string; operation: string; value: unknown },
    paramName: string,
  ): { where: string; params: Record<string, unknown> } | null {
    const { key, operation, value } = filter

    if (operation === 'like') {
      return {
        where: `u.${key} ILIKE :${paramName}`,
        params: { [paramName]: `%${value}%` },
      }
    } else if (operation === 'eq') {
      return {
        where: `u.${key} = :${paramName}`,
        params: { [paramName]: value },
      }
    } else if (operation === 'neq') {
      return {
        where: `u.${key} != :${paramName}`,
        params: { [paramName]: value },
      }
    } else if (operation === 'gt') {
      return {
        where: `u.${key} > :${paramName}`,
        params: { [paramName]: value },
      }
    } else if (operation === 'gte') {
      return {
        where: `u.${key} >= :${paramName}`,
        params: { [paramName]: value },
      }
    } else if (operation === 'lt') {
      return {
        where: `u.${key} < :${paramName}`,
        params: { [paramName]: value },
      }
    } else if (operation === 'lte') {
      return {
        where: `u.${key} <= :${paramName}`,
        params: { [paramName]: value },
      }
    } else if (operation === 'in') {
      return {
        where: `u.${key} IN (:...${paramName})`,
        params: { [paramName]: value },
      }
    } else if (operation === 'notin') {
      return {
        where: `u.${key} NOT IN (:...${paramName})`,
        params: { [paramName]: value },
      }
    } else if (operation === 'isnull') {
      return {
        where: `u.${key} IS NULL`,
        params: {},
      }
    }

    return null
  }

  public convertFiltersToPrismaFormat(
    filterObj: Array<{ key: string; operation: string; value: unknown }>,
  ): Record<string, unknown> {
    const prismaFilterObj: Record<string, unknown> = {}

    for (const item of filterObj) {
      if (item.operation === 'like') {
        prismaFilterObj[item.key] = { contains: item.value }
      } else if (item.operation === 'eq') {
        prismaFilterObj[item.key] = { equals: item.value }
      } else if (item.operation === 'neq') {
        prismaFilterObj[item.key] = { not: { equals: item.value } }
      } else if (item.operation === 'gt') {
        prismaFilterObj[item.key] = { gt: item.value }
      } else if (item.operation === 'gte') {
        prismaFilterObj[item.key] = { gte: item.value }
      } else if (item.operation === 'lt') {
        prismaFilterObj[item.key] = { lt: item.value }
      } else if (item.operation === 'lte') {
        prismaFilterObj[item.key] = { lte: item.value }
      } else if (item.operation === 'in') {
        prismaFilterObj[item.key] = { in: item.value }
      } else if (item.operation === 'notin') {
        prismaFilterObj[item.key] = { not: { in: item.value } }
      } else if (item.operation === 'isnull') {
        prismaFilterObj[item.key] = { equals: null }
      }
    }
    return prismaFilterObj
  }
}
