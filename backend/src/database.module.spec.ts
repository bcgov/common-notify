import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard against a startup-only crash class.
 *
 * TypeORM infers a column's database type from the property's reflected `design:type`
 * when the decorator does not declare one. A property typed `string | null` reflects as
 * `Object`, which has no Postgres equivalent, so the app dies during
 * `DataSource.initialize()` with:
 *
 *   DataTypeNotSupportedError: Data type "Object" in "ApiKeyConsumer.credentialIdentifier"
 *   is not supported by "postgres" database.
 *
 * Nothing earlier catches it — it compiles, lints, and every unit test passes, because
 * unit tests mock repositories rather than building a DataSource.
 *
 * This is checked against the source rather than at runtime on purpose. Whether a union
 * reflects as `Object` or collapses to `String` depends on the transform: the swc plugin
 * vitest uses and the swc `nest build` uses do not agree, so a reflection-based
 * assertion passes here while the real build still crashes. The source rule — a nullable
 * union column must declare `type` — holds regardless of transform.
 */
describe('entity column declarations', () => {
  const entityFiles = collectEntityFiles(join(__dirname))

  it('finds the entity files to check', () => {
    expect(entityFiles.length).toBeGreaterThan(20)
  })

  it('declares an explicit column type for every nullable union property', () => {
    const offenders = entityFiles.flatMap((file) => findUntypedUnionColumns(file))

    expect(offenders).toEqual([])
  })
})

function collectEntityFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collectEntityFiles(full)
    return entry.endsWith('.entity.ts') ? [full] : []
  })
}

/**
 * Report `prop: X | null` declarations whose owning @Column has no `type`.
 *
 * Walks backwards from the property to the decorator that precedes it, which is reliable
 * here because entity files are prettier-formatted and one decorator per property.
 */
function findUntypedUnionColumns(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  const offenders: string[] = []

  lines.forEach((line, index) => {
    const property = /^\s{2}(\w+)\??:\s*[^=]*\|\s*null\s*$/.exec(line)
    if (!property) return

    // Gather the decorator immediately above, which may span several lines.
    let decorator = ''
    for (let i = index - 1; i >= 0 && i > index - 12; i--) {
      decorator = `${lines[i]}\n${decorator}`
      if (/@(Column|CreateDateColumn|UpdateDateColumn)\s*\(/.test(lines[i])) break
      // A blank line or another property means this one carries no column decorator.
      if (lines[i].trim() === '' && decorator.trim() !== '') break
    }

    if (!/@(Column|CreateDateColumn|UpdateDateColumn)\s*\(/.test(decorator)) return
    if (/\btype\s*:/.test(decorator)) return

    offenders.push(
      `${file.replace(__dirname, 'src')}:${index + 1} — ${property[1]} is a nullable union ` +
        'but its @Column does not declare a type',
    )
  })

  return offenders
}
