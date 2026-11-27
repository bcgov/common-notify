/** Keys that would reach Object.prototype if written blindly into a nested object. */
const UNSAFE_PARAM_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Write one value into a params object, expanding a dotted name into nested objects: the renderer
 * reads `{{alert.id}}` as a path, so a literal `"alert.id"` key would never bind, and the
 * personalisation check looks for the root key `alert`. Mirrors `setMergeParam`, which builds the
 * same shape server-side for a bulk send.
 *
 * The first value written for a path wins; a name that would collide with one already written
 * (`alert` after `alert.id`, or the reverse) is dropped.
 */
export function setParam(params: Record<string, unknown>, key: string, value: unknown): void {
  const segments = key.split('.')

  if (segments.some((segment) => !segment || UNSAFE_PARAM_SEGMENTS.has(segment))) {
    return
  }

  let target = params
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    // Own properties only: an inherited name such as `toString` is not a value already written.
    const existing = Object.hasOwn(target, segment) ? target[segment] : undefined

    if (existing === undefined) {
      target[segment] = {}
    } else if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      return
    }

    target = target[segment] as Record<string, unknown>
  }

  const leaf = segments.at(-1)!
  if (!Object.hasOwn(target, leaf)) {
    target[leaf] = value
  }
}
