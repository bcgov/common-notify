/**
 * Out-of-order response guard for list thunks.
 *
 * Two fetches of the same data are routinely in flight at once — switching tenant
 * twice, searching twice, an SSE refetch landing on top of a user-triggered one, or
 * a page that dispatches both from an effect and from its own handler. Redux applies
 * whichever resolves last, so a slow earlier response overwrites a newer one and
 * leaves rows on screen that match neither the current query nor the current tenant.
 *
 * Slices record the request id of the fetch they are waiting on in `pending` and pass
 * it here from `fulfilled` / `rejected`, dropping anything that has been superseded.
 * Resetting the slice (see the `selectTenant` cases) clears the tracked id, which also
 * discards any response still in flight for the previous tenant.
 */
export const isStaleResponse = (
  trackedRequestId: string | null,
  action: { meta: { requestId: string } },
): boolean => trackedRequestId !== action.meta.requestId
