import type { NotifyEmailChannel } from './schemas/notify-email-channel'
import type { NotifySmsChannel } from './schemas/notify-sms-channel'
import type { NotifyMsgAppChannel } from './schemas/notify-msg-app-channel'

/**
 * Utility to determine the rendering strategy for a channel
 */
export type RenderingStrategy = 'template' | 'inline'

/**
 * Determines whether to use template-based or inline rendering
 * @returns 'template' if content.templateId is specified, 'inline' if content.renderer is specified
 */
export function getRenderingStrategy(
  channel: NotifyEmailChannel | NotifySmsChannel | NotifyMsgAppChannel,
): RenderingStrategy | null {
  if (channel.content?.templateId) {
    return 'template'
  }

  if (channel.content?.renderer) {
    return 'inline'
  }

  return null
}

/**
 * Checks if a channel has inline rendering configured
 */
export function isInlineRendering(
  channel: NotifyEmailChannel | NotifySmsChannel | NotifyMsgAppChannel,
): boolean {
  return getRenderingStrategy(channel) === 'inline'
}

/**
 * Checks if a channel has template-based rendering configured
 */
export function isTemplateBasedRendering(
  channel: NotifyEmailChannel | NotifySmsChannel | NotifyMsgAppChannel,
): boolean {
  return getRenderingStrategy(channel) === 'template'
}
