/** Statuses seeded by V83. The code table is the source of truth; these name the ones code relies on. */
export enum TenantRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /** Approved, then what was granted was taken back. */
  RELEASED = 'released',
  /** Cancelled by the tenant while pending. */
  CANCELLED = 'cancelled',
}

/** Who made a change: the stable id stored for audit, and a display name if the token had one. */
export interface RequestActor {
  id: string
  name: string | null
}
