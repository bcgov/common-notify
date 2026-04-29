import { Controller, Get, Version, UseGuards, Logger } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { CodeTablesService, CodeTableItemDto, CodeTablesResponseDto } from './code-tables.service'
import { AuthJwtGuard } from '../../auth/guards/auth.jwt-guard'

@ApiTags('code-tables')
@Controller('code-tables')
@UseGuards(AuthJwtGuard)
@ApiBearerAuth()
export class CodeTablesController {
  private readonly logger = new Logger(CodeTablesController.name)

  constructor(private readonly codeTablesService: CodeTablesService) {}

  /**
   * Get all code tables
   * Returns notification statuses, channels, and event types
   */
  @Version('1')
  @Get()
  @ApiOperation({
    summary: 'Get all code tables',
    description:
      'Returns notification statuses, channels, and event types. Useful for populating dropdowns and filters throughout the app.',
  })
  @ApiOkResponse({ type: CodeTablesResponseDto })
  async getAllCodeTables(): Promise<CodeTablesResponseDto> {
    return this.codeTablesService.getAllCodeTables()
  }

  /**
   * Get notification status codes
   */
  @Version('1')
  @Get('notification-status')
  @ApiOperation({
    summary: 'Get notification status codes',
    description: 'Returns all valid notification status codes (sent, failed, pending, etc.)',
  })
  @ApiOkResponse({ isArray: true, type: CodeTableItemDto })
  async getStatuses(): Promise<CodeTableItemDto[]> {
    return this.codeTablesService.getStatuses()
  }

  /**
   * Get notification channel codes
   */
  @Version('1')
  @Get('channels')
  @ApiOperation({
    summary: 'Get notification channel codes',
    description: 'Returns all valid notification channels (EMAIL, SMS, etc.)',
  })
  @ApiOkResponse({ isArray: true, type: CodeTableItemDto })
  async getChannels(): Promise<CodeTableItemDto[]> {
    return this.codeTablesService.getChannels()
  }

  /**
   * Get notification event type codes
   */
  @Version('1')
  @Get('event-types')
  @ApiOperation({
    summary: 'Get notification event type codes',
    description:
      'Returns all valid event types (PASSWORD_RESET, INVOICE_SENT, etc.) that can trigger notifications',
  })
  @ApiOkResponse({ isArray: true, type: CodeTableItemDto })
  async getEventTypes(): Promise<CodeTableItemDto[]> {
    return this.codeTablesService.getEventTypes()
  }
}
