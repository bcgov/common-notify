/** What each terminal method of the fake resolves to. */
export interface FakeQueryResults {
  one?: unknown
  many?: unknown[]
  manyAndCount?: [unknown[], number]
  rawOne?: unknown
  rawMany?: unknown[]
}

/**
 * A TypeORM SelectQueryBuilder stand-in for unit specs: every builder method returns the builder,
 * the terminal methods resolve the given results, and the calls are recorded to assert on.
 *
 * - `where`: each where/andWhere clause with its parameters, in order
 * - `calls`: the latest arguments to each other method, by name
 * - `log`: every non-where call in order, for asserting on sequence (e.g. orderBy then addOrderBy)
 * - `parameters`: everything passed to setParameter/setParameters, merged
 */
export function fakeQueryBuilder(results: FakeQueryResults = {}) {
  const where: Array<[string, Record<string, unknown> | undefined]> = []
  const calls: Record<string, unknown[]> = {}
  const log: Array<[string, ...unknown[]]> = []
  const parameters: Record<string, unknown> = {}
  const terminals: Record<string, () => Promise<unknown>> = {
    getOne: () => Promise.resolve(results.one ?? null),
    getMany: () => Promise.resolve(results.many ?? []),
    getManyAndCount: () => Promise.resolve(results.manyAndCount ?? [[], 0]),
    getRawOne: () => Promise.resolve(results.rawOne),
    getRawMany: () => Promise.resolve(results.rawMany ?? []),
  }

  const qb: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop in terminals) return terminals[prop]
        return (...args: unknown[]) => {
          if (prop === 'where' || prop === 'andWhere') {
            where.push([args[0] as string, args[1] as Record<string, unknown> | undefined])
            return qb
          }
          if (prop === 'setParameter') parameters[args[0] as string] = args[1]
          if (prop === 'setParameters') Object.assign(parameters, args[0])
          calls[prop] = args
          log.push([prop, ...args])
          return qb
        }
      },
    },
  )
  return { qb, where, calls, log, parameters }
}
