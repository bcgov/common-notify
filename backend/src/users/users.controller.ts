import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  HttpException,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserDto } from './dto/user.dto'
import { AuthJwtGuard } from 'src/auth/auth.jwt-guard'
import { RoleGuard } from 'src/auth/role.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { Role } from 'src/enum/role.enum'

@ApiTags('users')
@UseGuards(AuthJwtGuard, RoleGuard)
@Roles(Role.NOTIFY_ADMIN)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto)
  }

  @Get()
  findAll(): Promise<UserDto[]> {
    return this.usersService.findAll()
  }

  @Get('search') // it must be ahead of the below Get(":id") to avoid conflict
  async searchUsers(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string, // JSON string to store sort key and sort value, ex: {name: "ASC"}
    @Query('filter') filter: string, // JSON array for key, operation and value, ex: [{key: "name", operation: "like", value: "Peter"}]
  ) {
    if (isNaN(page) || isNaN(limit)) {
      throw new HttpException('Invalid query parameters', 400)
    }
    return this.usersService.searchUsers(page, limit, sort, filter)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(+id)
    if (!user) {
      throw new HttpException('User not found.', 404)
    }
    return user
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id)
  }
}
