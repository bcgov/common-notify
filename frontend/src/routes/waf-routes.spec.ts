import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Caddy runs the Coraza WAF in front of the SPA, so a refresh or direct link to any page is a
 * real request that must get past the URI rules before index.html is served. A route whose
 * path matches one is reachable by clicking but 403s on refresh - which is how /admin/* broke.
 */
const frontendRoot = resolve(__dirname, '../..')
const coraza = readFileSync(join(frontendRoot, 'coraza.conf'), 'utf8').replace(/\r\n/g, '\n')

/** The `@rx` pattern of a REQUEST_URI rule, by id. */
function uriRule(id: number): RegExp {
  // Anchored to real rule lines: the comments above rule 1004 quote an example rule with its id.
  const rules = coraza.matchAll(/^SecRule REQUEST_URI\S*\s+"@rx (.+?)"\s*\\\n\s*"id:(\d+),/gm)
  const pattern = [...rules].find((match) => Number(match[2]) === id)?.[1]
  if (!pattern) throw new Error(`REQUEST_URI rule ${id} not found in coraza.conf`)
  // Coraza patterns are RE2; these use no syntax JavaScript reads differently.
  return new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'i' : '')
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routeFiles(path)
    return name.endsWith('.tsx') && !name.endsWith('.spec.tsx') ? [path] : []
  })
}

const routePaths = routeFiles(join(frontendRoot, 'src/routes'))
  .map((file) => readFileSync(file, 'utf8').match(/createFileRoute\('([^']+)'\)/)?.[1])
  .filter((path): path is string => !!path)
  // Route params become a plausible value, as a real URL would have.
  .map((path) => path.replace(/\$[A-Za-z]+/g, '0d2c6a3e-1f4b-4c8d-9e7a-5b6c7d8e9f01'))

describe('WAF URI rules', () => {
  it('finds the app routes to check', () => {
    expect(routePaths).toContain('/admin/monitoring')
    expect(routePaths.length).toBeGreaterThan(10)
  })

  it.each([1004, 1007])('rule %i lets every app route through on refresh', (id) => {
    const rule = uriRule(id)
    expect(routePaths.filter((path) => rule.test(path))).toEqual([])
  })

  it('still blocks the probe paths rule 1004 exists for', () => {
    const rule = uriRule(1004)
    for (const probe of ['/.env', '/.git/config', '/wp-admin', '/config']) {
      expect(rule.test(probe)).toBe(true)
    }
  })
})
