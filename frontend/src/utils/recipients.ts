/**
 * True when two recipient lists hold the same addresses in the same order.
 *
 * Used to tell a genuine change from the same list arriving back from the server, e.g. after a
 * save re-seeds a tab with backend-normalized values.
 */
export function sameAddresses(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((address, index) => address === b[index])
}
