/**
 * Which recipient list an event recipient belongs to.
 *
 * EMAIL channels use all three; SMS is TO only, enforced by
 * chk_event_channel_recipient_sms_kind.
 */
export enum EventRecipientKind {
  TO = 'TO',
  CC = 'CC',
  BCC = 'BCC',
}
