/**
 * Event status shown on the Events list.
 *
 * Derived, not stored: an event is ACTIVE once any of its channels is switched on,
 * and DRAFT until then.
 */
export enum EventStatus {
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
}
