import { Injectable, Logger } from '@nestjs/common'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import { isInlineRendering } from './rendering.strategy'
import type { NotifyEmailChannel } from './schemas/notify-email-channel'
import type { NotifySmsChannel } from './schemas/notify-sms-channel'
import type { NotifyMsgAppChannel } from './schemas/notify-msg-app-channel'

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name)

  constructor(private inlineRenderingService: InlineRenderingService) {}

  notImplemented() {
    return {
      error: 'Not implemented',
      message: 'This endpoint is not yet implemented',
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Render email channel content if using inline rendering
   * If templateId is specified, content will be resolved from template during processing
   */
  async renderEmailIfInline(channel: NotifyEmailChannel) {
    if (isInlineRendering(channel) && channel.content) {
      return this.inlineRenderingService.renderEmail(channel.content, channel.params)
    }
    return null
  }

  /**
   * Render SMS channel content if using inline rendering
   * If templateId is specified, content will be resolved from template during processing
   */
  async renderSmsIfInline(channel: NotifySmsChannel) {
    if (isInlineRendering(channel) && channel.content) {
      return this.inlineRenderingService.renderSms(channel.content, channel.params)
    }
    return null
  }

  /**
   * Render message app channel content if using inline rendering
   * If templateId is specified, content will be resolved from template during processing
   */
  async renderMsgAppIfInline(channel: NotifyMsgAppChannel) {
    if (isInlineRendering(channel) && channel.content) {
      return this.inlineRenderingService.renderMsgApp(channel.content, channel.params)
    }
    return null
  }
}
