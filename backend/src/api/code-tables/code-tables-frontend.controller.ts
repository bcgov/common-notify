import { Controller, Get, Version, Logger, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { CodeTablesService } from './code-tables.service'
import { CodeTableDto, CodeTablesResponseDto } from './schemas/code-table.dto'

/**
 * Frontend Code Tables API Controller
 *
 * ARCHITECTURAL NOTE: This controller intentionally duplicates methods from CodeTablesController
 * because the API Gateway requires separate routing:
 * - CodeTablesController: /api/v1/code-tables (service-to-service auth)
 * - CodeTablesFrontendController: /api/v1/frontend/code-tables (frontend auth)
 *
 * The different route prefixes enable the gateway to apply different authentication
 * rules based on client type (internal service vs frontend application).
 * Both controllers delegate to the same CodeTablesService for consistency.
 *
 * If the gateway configuration changes to support a single route with conditional auth,
 * these controllers can be consolidated.
 *
 * SECURITY NOTE: Code tables are public reference data (dropdowns, status codes, channels).
 * They require JWT authentication for usage tracking and CSTAR role validation,
 * but NOT tenant-specific validation since they're not tenant-specific data.
 * We only use CstarRoleGuard (JWT + role validation) without AuthGuard
 * to avoid unnecessary CSTAR API calls that require backend service credentials.
 */
@ApiTags('code-tables')
@Controller('frontend/code-tables')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class CodeTablesFrontendController {
  private readonly logger = new Logger(CodeTablesFrontendController.name)

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
  @ApiOkResponse({ isArray: true, type: CodeTableDto })
  async getStatuses(): Promise<CodeTableDto[]> {
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
  @ApiOkResponse({ isArray: true, type: CodeTableDto })
  async getChannels(): Promise<CodeTableDto[]> {
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
  @ApiOkResponse({ isArray: true, type: CodeTableDto })
  async getEventTypes(): Promise<CodeTableDto[]> {
    return this.codeTablesService.getEventTypes()
  }
}
