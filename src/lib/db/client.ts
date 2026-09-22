/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool, type PoolClient } from 'pg'

export type DatabaseError = {
  code: string
  message: string
  details: string | null
  hint: string | null
}

type DynamicRow = any
type Result<T = DynamicRow[]> = { data: T; error: DatabaseError | null; count: number | null; status: number }
type Filter = { column: string; operator: string; value: unknown; negate?: boolean }
type FilterGroup = { or: Filter[] }
type Order = { column: string; ascending: boolean; nullsFirst?: boolean }
type Relation = {
  alias: string
  table: string
  hint?: string
  inner: boolean
  columns: SelectItem[]
}
type SelectItem = { kind: 'column'; column: string; alias?: string } | { kind: 'relation'; relation: Relation }
type ForeignKey = {
  constraint: string
  sourceTable: string
  sourceColumn: string
  targetTable: string
  targetColumn: string
}

const runtime = globalThis as typeof globalThis & { __hollowayPool?: Pool }

const connectionString = () => {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL is required')
  return value
}

export const pool = () => {
  if (!runtime.__hollowayPool) {
    runtime.__hollowayPool = new Pool({
      connectionString: connectionString(),
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 15_000),
      application_name: 'holloway',
    })
    runtime.__hollowayPool.on('error', (error) => console.error('[db] idle client error', error))
  }
  return runtime.__hollowayPool
}

const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`)
  return `"${value.replaceAll('"', '""')}"`
}

const splitTopLevel = (value: string) => {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      out.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  out.push(value.slice(start).trim())
  return out.filter(Boolean)
}

const parseSelect = (value = '*'): SelectItem[] => splitTopLevel(value).map((token) => {
  const open = token.indexOf('(')
  if (open > 0 && token.endsWith(')')) {
    const head = token.slice(0, open).trim()
    const parts = head.split('!').map((part) => part.trim())
    const named = parts[0]!.split(':').map((part) => part.trim())
    const table = named.length === 2 ? named[1]! : named[0]!
    return {
      kind: 'relation',
      relation: {
        alias: named.length === 2 ? named[0]! : table,
        table,
        hint: parts.find((part) => part !== parts[0] && part !== 'inner' && part !== 'left'),
        inner: parts.includes('inner'),
        columns: parseSelect(token.slice(open + 1, -1)),
      },
    }
  }
  if (token === '*') return { kind: 'column', column: '*' }
  const [alias, column] = token.includes(':') ? token.split(':', 2) : [undefined, token]
  return { kind: 'column', column: column!.trim(), alias: alias?.trim() }
})

/**
 * Postgres codes that mean the DEPLOYMENT is wrong, not the data.
 *
 * Every caller here treats `{ data: null, error }` as "nothing to show",
 * because for an ordinary query that is what it means. For these it does not:
 * the table is missing, or the role cannot touch it, and an empty page is a
 * lie rather than an answer.
 *
 * That distinction has now cost three incidents. v1.0.316 shipped code
 * querying `contract_links` before the table existed and served empty reads
 * for twenty-five minutes. `pending_approvals.status` refused a value the app
 * wrote, and the kill switch half-fired. And the operator channel's three
 * tables were applied to production by hand as `postgres`, so the app role
 * could not read them — every contract reported "no notes" for three days and
 * nothing anywhere said why.
 *
 * None of those are quiet failures in the database. They are quiet here.
 */
const STRUCTURAL = new Set([
  '42501', // insufficient_privilege — the role cannot touch the table
  '42P01', // undefined_table — it does not exist
  '42703', // undefined_column — it does not have that column
  '42883', // undefined_function
  '3D000', // invalid_catalog_name
  '28000', // invalid_authorization_specification
  '28P01', // invalid_password
])

const errorResult = (error: unknown): Result<any> => {
  const candidate = error as { code?: string; message?: string; detail?: string; hint?: string }
  if (candidate.code && STRUCTURAL.has(candidate.code)) {
    // Loud, and on stderr, because the caller is about to render this as an
    // empty list and say nothing at all.
    console.error(
      `[db] ${candidate.code} — this is a deployment fault, not an empty result: ${candidate.message ?? String(error)}`,
    )
  }
  return {
    data: null,
    error: {
      code: candidate.code || 'DATABASE_ERROR',
      message: candidate.message || String(error),
      details: candidate.detail || null,
      hint: candidate.hint || null,
    },
    count: null,
    status: 500,
  }
}

/** Preserve the JSON timestamp contract exposed by the former PostgREST client. */
export const normalizeDatabaseValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeDatabaseValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeDatabaseValue(entry)]))
  }
  return value
}

const fkCache = new Map<string, ForeignKey[]>()

const foreignKeys = async (client: PoolClient, left: string, right: string) => {
  const key = [left, right].sort().join(':')
  const cached = fkCache.get(key)
  if (cached) return cached
  const { rows } = await client.query<ForeignKey>(`
    select c.conname as constraint,
           src.relname as "sourceTable", sa.attname as "sourceColumn",
           tgt.relname as "targetTable", ta.attname as "targetColumn"
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join lateral unnest(c.conkey) with ordinality sk(attnum, ord) on true
      join lateral unnest(c.confkey) with ordinality tk(attnum, ord) on tk.ord = sk.ord
      join pg_attribute sa on sa.attrelid = src.oid and sa.attnum = sk.attnum
      join pg_attribute ta on ta.attrelid = tgt.oid and ta.attnum = tk.attnum
     where c.contype = 'f'
       and ((src.relname = $1 and tgt.relname = $2) or (src.relname = $2 and tgt.relname = $1))
  `, [left, right])
  fkCache.set(key, rows)
  return rows
}

const resolveForeignKey = async (client: PoolClient, base: string, relation: Relation) => {
  const candidates = await foreignKeys(client, base, relation.table)
  const match = candidates.find((fk) => !relation.hint ||
    fk.constraint === relation.hint || fk.sourceColumn === relation.hint || fk.targetColumn === relation.hint)
  if (!match) throw new Error(`No foreign key from ${base} to ${relation.table}${relation.hint ? ` (${relation.hint})` : ''}`)
  return match
}

const selectColumns = (items: SelectItem[], alias: string) => {
  const columns = items.filter((item): item is Extract<SelectItem, { kind: 'column' }> => item.kind === 'column')
  if (columns.some((item) => item.column === '*')) return `${alias}.*`
  return columns.map((item) => {
    const expression = `${alias}.${identifier(item.column)}`
    return item.alias ? `${expression} as ${identifier(item.alias)}` : expression
  }).join(', ')
}

class DirectQuery<T = DynamicRow[]> implements PromiseLike<Result<T>> {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private selection: SelectItem[] = parseSelect('*')
  private values: any[] = []
  private filters: (Filter | FilterGroup)[] = []
  private orders: Order[] = []
  private rowLimit: number | null = null
  private rowOffset = 0
  private countMode = false
  private head = false
  private returnRows = false
  private cardinality: 'many' | 'single' | 'maybeSingle' = 'many'
  private conflictColumns: string[] = []
  private ignoreDuplicates = false

  constructor(private readonly table: string) {}

  select<TResult = T>(columns = '*', options?: { count?: 'exact'; head?: boolean }): DirectQuery<TResult> {
    this.selection = parseSelect(columns)
    if (this.action !== 'select') this.returnRows = true
    this.countMode = options?.count === 'exact'
    this.head = Boolean(options?.head)
    return this as unknown as DirectQuery<TResult>
  }

  insert(values: any | any[]) {
    this.action = 'insert'
    this.values = Array.isArray(values) ? values : [values]
    return this
  }

  update(values: any) {
    this.action = 'update'
    this.values = [values]
    return this
  }

  upsert(values: any | any[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = 'upsert'
    this.values = Array.isArray(values) ? values : [values]
    this.conflictColumns = options?.onConflict?.split(',').map((column) => column.trim()).filter(Boolean) ?? []
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates)
    return this
  }

  delete(options?: { count?: 'exact' }) { this.action = 'delete'; this.countMode = options?.count === 'exact'; return this }
  eq(column: string, value: unknown) { this.filters.push({ column, operator: '=', value }); return this }
  neq(column: string, value: unknown) { this.filters.push({ column, operator: '<>', value }); return this }
  gt(column: string, value: unknown) { this.filters.push({ column, operator: '>', value }); return this }
  gte(column: string, value: unknown) { this.filters.push({ column, operator: '>=', value }); return this }
  lt(column: string, value: unknown) { this.filters.push({ column, operator: '<', value }); return this }
  lte(column: string, value: unknown) { this.filters.push({ column, operator: '<=', value }); return this }
  is(column: string, value: unknown) { this.filters.push({ column, operator: 'is', value }); return this }
  in(column: string, value: unknown[]) { this.filters.push({ column, operator: 'in', value }); return this }
  ilike(column: string, value: unknown) { this.filters.push({ column, operator: 'ilike', value }); return this }
  like(column: string, value: unknown) { this.filters.push({ column, operator: 'like', value }); return this }
  contains(column: string, value: unknown) { this.filters.push({ column, operator: '@>', value }); return this }
  overlaps(column: string, value: unknown) { this.filters.push({ column, operator: '&&', value }); return this }
  not(column: string, operator: string, value: unknown) { this.filters.push({ column, operator, value, negate: true }); return this }
  or(expression: string) {
    const filters = splitTopLevel(expression).map((part): Filter => {
      const match = part.match(/^([^.]+)\.(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.*)$/)
      if (!match) throw new Error(`Unsupported OR filter: ${part}`)
      const operators: Record<string, string> = {
        eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', is: 'is', in: 'in', like: 'like', ilike: 'ilike',
      }
      let value: unknown = match[3]
      if (match[2] === 'is') value = match[3] === 'null' ? null : match[3] === 'true'
      return { column: match[1]!, operator: operators[match[2]!]!, value }
    })
    this.filters.push({ or: filters })
    return this
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false, nullsFirst: options?.nullsFirst })
    return this
  }
  limit(value: number) { this.rowLimit = value; return this }
  range(from: number, to: number) { this.rowOffset = from; this.rowLimit = Math.max(0, to - from + 1); return this }
  single<TResult = DynamicRow>() { this.cardinality = 'single'; return this as unknown as DirectQuery<TResult> }
  maybeSingle<TResult = DynamicRow>() { this.cardinality = 'maybeSingle'; return this as unknown as DirectQuery<TResult | null> }

  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private scalarClause(filter: Filter, column: string, parameters: unknown[]) {
    let clause: string
    if (filter.operator === 'is') {
      clause = `${column} is ${filter.value === null ? 'null' : filter.value === true ? 'true' : 'false'}`
    } else if (filter.operator === 'in' || filter.operator === 'not.in') {
      const values = Array.isArray(filter.value)
        ? filter.value
        : String(filter.value).replace(/^\(|\)$/g, '').split(',').filter(Boolean)
      if (values.length === 0) clause = filter.operator === 'not.in' || filter.negate ? 'true' : 'false'
      else {
        const refs = values.map((value) => { parameters.push(value); return `$${parameters.length}` })
        clause = `${column} ${filter.operator === 'not.in' || filter.negate ? 'not in' : 'in'} (${refs.join(', ')})`
      }
    } else if (filter.operator === 'not' || (filter.negate && filter.operator === 'is')) {
      clause = `${column} is not ${filter.value === null ? 'null' : String(filter.value)}`
    } else {
      parameters.push(filter.value)
      clause = `${column} ${filter.operator} $${parameters.length}`
    }
    return filter.negate && filter.operator !== 'is' && filter.operator !== 'in' && filter.operator !== 'not.in'
      ? `not (${clause})`
      : clause
  }

  private async filterClause(
    client: PoolClient,
    filter: Filter,
    parameters: unknown[],
    table = this.table,
    alias = 'b',
    counter = { value: 0 },
  ): Promise<string> {
    const path = filter.column.split('.')
    if (path.length === 1) return this.scalarClause(filter, `${alias}.${identifier(path[0]!)}`, parameters)
    const related = path.shift()!
    const relation: Relation = { alias: related, table: related, inner: true, columns: [] }
    const fk = await resolveForeignKey(client, table, relation)
    const childAlias = `f${counter.value++}`
    const forward = fk.sourceTable === table
    const join = forward
      ? `${childAlias}.${identifier(fk.targetColumn)} = ${alias}.${identifier(fk.sourceColumn)}`
      : `${childAlias}.${identifier(fk.sourceColumn)} = ${alias}.${identifier(fk.targetColumn)}`
    const nested = await this.filterClause(client, { ...filter, column: path.join('.') }, parameters, related, childAlias, counter)
    return `exists (select 1 from ${identifier(related)} ${childAlias} where ${join} and ${nested})`
  }

  private async where(client: PoolClient, parameters: unknown[]) {
    const clauses: string[] = []
    for (const item of this.filters) {
      if ('or' in item) {
        const group = await Promise.all(item.or.map((filter) => this.filterClause(client, filter, parameters)))
        clauses.push(`(${group.join(' or ')})`)
      } else {
        clauses.push(await this.filterClause(client, item, parameters))
      }
    }
    return clauses.length ? ` where ${clauses.join(' and ')}` : ''
  }

  private async projection(
    client: PoolClient,
    table: string,
    alias: string,
    items: SelectItem[],
    counter: { value: number },
  ): Promise<{ expressions: string[]; innerClauses: string[] }> {
    const scalar = selectColumns(items, alias)
    const expressions = scalar ? [scalar] : []
    const innerClauses: string[] = []
    for (const item of items) {
      if (item.kind !== 'relation') continue
      const relation = item.relation
      const fk = await resolveForeignKey(client, table, relation)
      const forward = fk.sourceTable === table
      const relationAlias = `r${counter.value++}`
      const nested = await this.projection(client, relation.table, relationAlias, relation.columns, counter)
      const relationColumns = nested.expressions.join(', ') || `${relationAlias}.*`
      const join = forward
        ? `${relationAlias}.${identifier(fk.targetColumn)} = ${alias}.${identifier(fk.sourceColumn)}`
        : `${relationAlias}.${identifier(fk.sourceColumn)} = ${alias}.${identifier(fk.targetColumn)}`
      const nestedWhere = nested.innerClauses.length ? ` and ${nested.innerClauses.join(' and ')}` : ''
      if (forward) {
        expressions.push(`(select row_to_json(rel) from (select ${relationColumns} from ${identifier(relation.table)} ${relationAlias} where ${join}${nestedWhere} limit 1) rel) as ${identifier(relation.alias)}`)
      } else {
        expressions.push(`coalesce((select json_agg(rel) from (select ${relationColumns} from ${identifier(relation.table)} ${relationAlias} where ${join}${nestedWhere}) rel), '[]'::json) as ${identifier(relation.alias)}`)
      }
      if (relation.inner) innerClauses.push(`exists (select 1 from ${identifier(relation.table)} ${relationAlias} where ${join}${nestedWhere})`)
    }
    return { expressions, innerClauses }
  }

  private async selectSql(client: PoolClient, parameters: unknown[]) {
    const projected = await this.projection(client, this.table, 'b', this.selection, { value: 0 })
    let where = await this.where(client, parameters)
    if (projected.innerClauses.length) where += `${where ? ' and' : ' where'} ${projected.innerClauses.join(' and ')}`
    const order = this.orders.length
      ? ` order by ${this.orders.map((entry) => `b.${identifier(entry.column)} ${entry.ascending ? 'asc' : 'desc'}${entry.nullsFirst === undefined ? '' : entry.nullsFirst ? ' nulls first' : ' nulls last'}`).join(', ')}`
      : ''
    const limit = this.rowLimit === null ? '' : ` limit ${Math.max(0, Math.floor(this.rowLimit))}`
    const offset = this.rowOffset ? ` offset ${Math.max(0, Math.floor(this.rowOffset))}` : ''
    return { sql: `select ${projected.expressions.join(', ')} from ${identifier(this.table)} b${where}${order}${limit}${offset}`, where }
  }

  private async execute(): Promise<Result<T>> {
    const client = await pool().connect()
    try {
      const parameters: unknown[] = []
      if (this.action === 'select') {
        const built = await this.selectSql(client, parameters)
        let count: number | null = null
        if (this.countMode) {
          const countResult = await client.query<{ count: string }>(`select count(*)::text as count from ${identifier(this.table)} b${built.where}`, parameters)
          count = Number(countResult.rows[0]?.count ?? 0)
        }
        const rows = this.head ? [] : (await client.query(built.sql, parameters)).rows.map(normalizeDatabaseValue)
        return this.shape(rows, count) as Result<T>
      }

      const whereParameters: unknown[] = []
      const where = await this.where(client, whereParameters)
      let sql = ''
      const returningItems = this.selection.filter((item): item is Extract<SelectItem, { kind: 'column' }> => item.kind === 'column')
      const returning = this.returnRows
        ? ` returning ${returningItems.some((item) => item.column === '*')
          ? '*'
          : returningItems.map((item) => `${identifier(item.column)}${item.alias ? ` as ${identifier(item.alias)}` : ''}`).join(', ')}`
        : ''
      if (this.action === 'delete') {
        sql = `delete from ${identifier(this.table)} b${where}${returning}`
        parameters.push(...whereParameters)
      } else if (this.action === 'update') {
        const patch = this.values[0] ?? {}
        const entries = Object.entries(patch)
        const set = entries.map(([column, value]) => { parameters.push(value); return `${identifier(column)} = $${parameters.length}` })
        const shiftedWhere = where.replace(/\$(\d+)/g, (_, value) => `$${Number(value) + parameters.length}`)
        parameters.push(...whereParameters)
        sql = `update ${identifier(this.table)} b set ${set.join(', ')}${shiftedWhere}${returning}`
      } else {
        const rows = this.values
        if (!rows.length) return { data: [], error: null, count: null, status: 201 } as Result<T>
        const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
        const tuples = rows.map((row) => `(${columns.map((column) => { parameters.push(row[column] ?? null); return `$${parameters.length}` }).join(', ')})`)
        sql = `insert into ${identifier(this.table)} (${columns.map(identifier).join(', ')}) values ${tuples.join(', ')}`
        if (this.action === 'upsert') {
          if (!this.conflictColumns.length) throw new Error('upsert requires onConflict')
          sql += ` on conflict (${this.conflictColumns.map(identifier).join(', ')}) `
          sql += this.ignoreDuplicates
            ? 'do nothing'
            : `do update set ${columns.filter((column) => !this.conflictColumns.includes(column)).map((column) => `${identifier(column)} = excluded.${identifier(column)}`).join(', ')}`
        }
        sql += returning
      }
      const result = await client.query(sql, parameters)
      return this.shape(result.rows.map(normalizeDatabaseValue), this.countMode ? result.rowCount : null, this.action === 'insert' || this.action === 'upsert' ? 201 : 200) as Result<T>
    } catch (error) {
      return errorResult(error) as Result<T>
    } finally {
      client.release()
    }
  }

  private shape(rows: DynamicRow[], count: number | null, status = 200): Result<any> {
    if (this.cardinality === 'single' && rows.length !== 1) {
      return { data: null, error: { code: 'PGRST116', message: `Expected one row, found ${rows.length}`, details: null, hint: null }, count, status: 406 }
    }
    if (this.cardinality === 'maybeSingle' && rows.length > 1) {
      return { data: null, error: { code: 'PGRST116', message: `Expected at most one row, found ${rows.length}`, details: null, hint: null }, count, status: 406 }
    }
    const data = this.cardinality === 'many' ? rows : rows[0] ?? null
    return { data, error: null, count, status }
  }
}

class RpcQuery<T = any> implements PromiseLike<Result<T>> {
  private cardinality: 'many' | 'single' | 'maybeSingle' = 'many'
  constructor(private readonly name: string, private readonly args: Record<string, unknown>) {}
  single() { this.cardinality = 'single'; return this }
  maybeSingle() { this.cardinality = 'maybeSingle'; return this }
  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> { return this.execute().then(onfulfilled, onrejected) }
  private async execute(): Promise<Result<T>> {
    try {
      const entries = Object.entries(this.args)
      const invocation = entries.map(([key], index) => `${identifier(key)} => $${index + 1}`).join(', ')
      const { rows } = await pool().query(`select * from ${identifier(this.name)}(${invocation})`, entries.map(([, value]) => value))
      const normalizedRows = rows.map(normalizeDatabaseValue)
      let data: any = normalizedRows
      if (normalizedRows.length === 1 && Object.keys(normalizedRows[0] as object).length === 1 && this.name in (normalizedRows[0] as object)) data = (normalizedRows[0] as Record<string, unknown>)[this.name]
      else if (this.cardinality !== 'many') data = normalizedRows[0] ?? null
      return { data, error: null, count: null, status: 200 } as Result<T>
    } catch (error) {
      return errorResult(error) as Result<T>
    }
  }
}

export class DirectPostgresClient {
  from(table: string) { return new DirectQuery(table) }
  rpc<TResult = any>(name: string, args: Record<string, unknown> = {}) { return new RpcQuery<TResult>(name, args) }
}

const directClient = new DirectPostgresClient()
export const admin = () => directClient

export const transaction = async <T>(run: (client: PoolClient) => Promise<T>) => {
  const client = await pool().connect()
  try {
    await client.query('begin')
    const value = await run(client)
    await client.query('commit')
    return value
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
