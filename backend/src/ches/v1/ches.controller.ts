import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Version,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger'
import { ChesApiClient } from '../ches-api.client'
import type { ChesStatusQuery } from '../ches-api.client'
import { ChesMessageObject } from './schemas/ches-message-object'
import { ChesTransactionResponse } from './schemas/ches-transaction-response'
import { ChesMergeRequest } from './schemas/ches-merge-request'
import { ChesStatusObject } from './schemas/ches-status-object'
import { TenantGuard } from 'src/common/guards/tenant.guard'

@ApiTags('CHES')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('ches')
export class ChesController {
  constructor(private readonly chesApiClient: ChesApiClient) {}

  @Version('1')
  @Post('email')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send an email' })
  @ApiBody({ type: ChesMessageObject, description: 'Email message details' })
  @ApiResponse({
    status: 201,
    description: 'Email message queued successfully',
    type: ChesTransactionResponse,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 422,
    description: 'Unprocessable entity - validation error',
  })
  async postEmail(@Body() body: ChesMessageObject): Promise<ChesTransactionResponse> {
    return this.chesApiClient.sendEmail(body)
  }

  @Version('1')
  @Post('emailMerge')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Template mail merge and email sending' })
  @ApiBody({ type: ChesMergeRequest, description: 'Merge request details' })
  @ApiResponse({
    status: 201,
    description: 'Merge emails queued successfully',
    type: [ChesTransactionResponse],
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async postMerge(@Body() body: ChesMergeRequest): Promise<ChesTransactionResponse[]> {
    return this.chesApiClient.sendEmailMerge(body)
  }

  @Version('1')
  @Post('emailMerge/preview')
  @ApiOperation({ summary: 'Template mail merge validation and preview' })
  @ApiBody({ type: ChesMergeRequest, description: 'Merge request details' })
  @ApiResponse({
    status: 200,
    description: 'Preview of merged messages',
    type: [ChesMessageObject],
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async postPreview(@Body() body: ChesMergeRequest): Promise<ChesMessageObject[]> {
    return this.chesApiClient.previewEmailMerge(body)
  }

  @Version('1')
  @Get('status')
  @ApiOperation({ summary: 'Query CHES message status' })
  @ApiQuery({ name: 'msgId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['accepted', 'cancelled', 'completed', 'failed', 'pending'],
  })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'txId', required: false })
  @ApiResponse({
    status: 200,
    description: 'List of message statuses',
    type: [ChesStatusObject],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStatusQuery(@Query() query: ChesStatusQuery): Promise<ChesStatusObject[]> {
    return this.chesApiClient.getStatusQuery(query)
  }

  @Version('1')
  @Get('status/:msgId')
  @ApiOperation({ summary: 'Get CHES message status' })
  @ApiParam({ name: 'msgId', description: 'Message UUID' })
  @ApiResponse({
    status: 200,
    description: 'Message status',
    type: ChesStatusObject,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async getStatusMessage(@Param('msgId') msgId: string): Promise<ChesStatusObject> {
    return this.chesApiClient.getStatusMessage(msgId)
  }

  @Version('1')
  @Post('promote')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Promote CHES messages' })
  @ApiQuery({ name: 'msgId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['accepted', 'cancelled', 'completed', 'failed', 'pending'],
  })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'txId', required: false })
  @ApiResponse({ status: 202, description: 'Messages promoted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async postPromoteQuery(@Query() query: ChesStatusQuery): Promise<void> {
    return this.chesApiClient.promoteQuery(query)
  }

  @Version('1')
  @Post('promote/:msgId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Promote a single CHES message' })
  @ApiParam({ name: 'msgId', description: 'Message UUID' })
  @ApiResponse({ status: 202, description: 'Message promoted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async postPromoteMessage(@Param('msgId') msgId: string): Promise<void> {
    return this.chesApiClient.promoteMessage(msgId)
  }

  @Version('1')
  @Delete('cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Cancel CHES messages' })
  @ApiQuery({ name: 'msgId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['accepted', 'cancelled', 'completed', 'failed', 'pending'],
  })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'txId', required: false })
  @ApiResponse({ status: 202, description: 'Messages cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteCancelQuery(@Query() query: ChesStatusQuery): Promise<void> {
    return this.chesApiClient.cancelQuery(query)
  }

  @Version('1')
  @Delete('cancel/:msgId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Cancel a single CHES message' })
  @ApiParam({ name: 'msgId', description: 'Message UUID' })
  @ApiResponse({ status: 202, description: 'Message cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteCancelMessage(@Param('msgId') msgId: string): Promise<void> {
    return this.chesApiClient.cancelMessage(msgId)
  }

  @Version('1')
  @Get('health')
  @ApiOperation({ summary: 'CHES health' })
  @ApiResponse({ status: 200, description: 'CHES health status' })
  getHealth() {
    return { dependencies: [] }
  }
}
