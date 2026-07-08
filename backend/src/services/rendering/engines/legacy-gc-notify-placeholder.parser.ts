const LEGACY_GC_NOTIFY_PLACEHOLDER_REGEX =
  /\(\(([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\?[^)]*)?\)\)/g

export function extractLegacyGcNotifyPlaceholders(text?: string): string[] {
  if (!text) {
    return []
  }

  const placeholders = new Set<string>()

  for (const match of text.matchAll(LEGACY_GC_NOTIFY_PLACEHOLDER_REGEX)) {
    const key = match[1]
    if (key) {
      placeholders.add(key)
    }
  }

  return [...placeholders]
}
