/**
 * قاعدة Supabase وهمية في الذاكرة لاختبار المسارات بلا شبكة
 * ==========================================================
 * تحاكي من PostgREST ما تستعمله مسارات الطلبات والشحنات وحده: select بأعمدة
 * وعلاقات مضمَّنة (orders!inner(...) وأخواتها)، والفلاتر eq/neq/in على عمود
 * الجدول أو على العلاقة المضمَّنة ("orders.is_test")، و order/limit، و
 * count/head، و maybeSingle/single، و update/insert.
 *
 * السلوك المحاكى كما في PostgREST: فلتر على علاقة داخلية (!inner) يُسقط الصف
 * الأب، وعلى علاقة عادية يُفرغ العلاقة وحدها؛ والفلتر يقع على أعمدة الصف
 * المضمَّن ولو لم تُختَر.
 *
 * كل نداء يُسجَّل في calls، فيُفحص ما لم يحدث أيضاً (لا إدراج، لا تعديل).
 * ما لا تعرفه المحاكاة يرمي خطأً صريحاً بدل نتيجة صامتة خاطئة.
 */

export type Row = Record<string, unknown>

interface Relation {
  table: string
  /** عمود الربط في الجدول الأب */
  local: string
  /** عمود الربط في الجدول المضمَّن */
  foreign: string
  /** متعدد ← مصفوفة، وإلا كائن أو null */
  many: boolean
}

/** العلاقات التي تضمّنها المسارات — مطابقة للمفاتيح الأجنبية في القاعدة الحيّة. */
const RELATIONS: Record<string, Record<string, Relation>> = {
  shipments: {
    orders: { table: 'orders', local: 'order_id', foreign: 'order_id', many: false },
  },
  orders: {
    // shipments.order_id فريد (shipments_order_id_key) فيعيده PostgREST كائناً
    shipments: { table: 'shipments', local: 'order_id', foreign: 'order_id', many: false },
    order_items: { table: 'order_items', local: 'order_id', foreign: 'order_id', many: true },
    merchants: { table: 'merchants', local: 'merchant_id', foreign: 'id', many: false },
  },
  subscriptions: {
    plans: { table: 'plans', local: 'plan_id', foreign: 'id', many: false },
  },
}

type SelectItem =
  | { kind: 'all' }
  | { kind: 'column'; name: string }
  | { kind: 'embed'; name: string; inner: boolean; items: SelectItem[] }

function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function parseSelect(text: string): SelectItem[] {
  return splitTopLevel(text).map((part): SelectItem => {
    if (part === '*') return { kind: 'all' }
    const embed = part.match(/^(\w+)(!inner)?\s*\(([\s\S]*)\)$/)
    if (embed) {
      return { kind: 'embed', name: embed[1], inner: Boolean(embed[2]), items: parseSelect(embed[3]) }
    }
    if (!/^\w+$/.test(part)) throw new Error(`fake-supabase: صيغة select غير مدعومة: ${part}`)
    return { kind: 'column', name: part }
  })
}

type Filter = (row: Row) => boolean

/** null = الصف الأب يسقط (علاقة داخلية بلا صف مطابق). */
function project(
  db: FakeDb,
  table: string,
  row: Row,
  items: SelectItem[],
  embedFilters: Map<string, Filter[]>
): Row | null {
  const out: Row = {}
  for (const item of items) {
    if (item.kind === 'all') Object.assign(out, row)
    else if (item.kind === 'column') out[item.name] = row[item.name]
    else {
      const rel = RELATIONS[table]?.[item.name]
      if (!rel) throw new Error(`fake-supabase: علاقة غير معروفة ${table}.${item.name}`)
      const filters = embedFilters.get(item.name) ?? []
      const matching = db
        .table(rel.table)
        .filter((r) => r[rel.foreign] === row[rel.local] && filters.every((f) => f(r)))
      if (item.inner && matching.length === 0) return null
      const projected = matching.map((r) => project(db, rel.table, r, item.items, new Map()) as Row)
      out[item.name] = rel.many ? projected : (projected[0] ?? null)
    }
  }
  return out
}

export interface Result {
  data: unknown
  error: { message: string } | null
  count: number | null
}

export interface Call {
  table: string
  method: string
  args: unknown[]
}

export class FakeQuery implements PromiseLike<Result> {
  private mode: 'select' | 'update' | 'insert' = 'select'
  private selectItems: SelectItem[] | null = null
  private countRows = false
  private headOnly = false
  private filters: Filter[] = []
  private embedFilters = new Map<string, Filter[]>()
  private orderBy: { column: string; ascending: boolean } | null = null
  private limitTo: number | null = null
  private patch: Row = {}
  private newRows: Row[] = []

  constructor(
    private readonly db: FakeDb,
    private readonly name: string
  ) {}

  private record(method: string, args: unknown[]) {
    this.db.calls.push({ table: this.name, method, args })
  }

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.record('select', [columns, options])
    this.selectItems = parseSelect(columns)
    this.countRows = Boolean(options?.count)
    this.headOnly = Boolean(options?.head)
    return this
  }

  eq(column: string, value: unknown) {
    return this.where('eq', column, value, (v) => v === value)
  }

  neq(column: string, value: unknown) {
    return this.where('neq', column, value, (v) => v !== value)
  }

  in(column: string, values: unknown[]) {
    return this.where('in', column, values, (v) => values.includes(v))
  }

  or(expression: string): this {
    throw new Error(`fake-supabase: or() غير مدعوم (${expression})`)
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.record('order', [column, options])
    this.orderBy = { column, ascending: options?.ascending ?? true }
    return this
  }

  limit(count: number) {
    this.record('limit', [count])
    this.limitTo = count
    return this
  }

  update(patch: Row) {
    this.record('update', [patch])
    this.mode = 'update'
    this.patch = patch
    return this
  }

  insert(rows: Row | Row[]) {
    this.record('insert', [rows])
    this.mode = 'insert'
    this.newRows = Array.isArray(rows) ? rows : [rows]
    return this
  }

  maybeSingle(): Promise<Result> {
    return this.run('maybe')
  }

  single(): Promise<Result> {
    return this.run('one')
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run(null).then(onFulfilled, onRejected)
  }

  private where(method: string, column: string, value: unknown, test: (v: unknown) => boolean) {
    this.record(method, [column, value])
    const dot = column.indexOf('.')
    if (dot > 0) {
      const relation = column.slice(0, dot)
      const field = column.slice(dot + 1)
      const list = this.embedFilters.get(relation) ?? []
      list.push((row) => test(row[field]))
      this.embedFilters.set(relation, list)
    } else {
      this.filters.push((row) => test(row[column]))
    }
    return this
  }

  private async run(single: 'maybe' | 'one' | null): Promise<Result> {
    let rows: Row[]
    if (this.mode === 'insert') {
      rows = this.newRows.map((r) => this.db.insertRow(this.name, r))
    } else {
      rows = this.db.table(this.name).filter((r) => this.filters.every((f) => f(r)))
      if (this.mode === 'update') {
        for (const r of rows) Object.assign(r, this.patch)
        if (!this.selectItems) return { data: null, error: null, count: null }
      }
    }

    const items = this.selectItems ?? [{ kind: 'all' as const }]
    let pairs = rows
      .map((raw) => ({ raw, out: project(this.db, this.name, raw, items, this.embedFilters) }))
      .filter((p): p is { raw: Row; out: Row } => p.out !== null)

    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      pairs = [...pairs].sort((a, b) => {
        const x = String(a.raw[column] ?? '')
        const y = String(b.raw[column] ?? '')
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1)
      })
    }
    if (this.limitTo !== null) pairs = pairs.slice(0, this.limitTo)

    const data = pairs.map((p) => p.out)
    const count = this.countRows ? data.length : null
    if (this.headOnly) return { data: null, error: null, count }

    if (single) {
      if (data.length > 1) return { data: null, error: { message: 'fake-supabase: أكثر من صف' }, count }
      if (data.length === 0) {
        return single === 'maybe'
          ? { data: null, error: null, count }
          : { data: null, error: { message: 'fake-supabase: لا صف' }, count }
      }
      return { data: data[0], error: null, count }
    }
    return { data, error: null, count }
  }
}

let trackingSeq = 900

export class FakeDb {
  tables: Record<string, Row[]> = {}
  calls: Call[] = []

  /** يبدأ كل اختبار من نسخة جديدة — تعديلات اختبار لا تتسرّب لغيره. */
  reset(tables: Record<string, Row[]>) {
    this.tables = structuredClone(tables)
    this.calls = []
  }

  table(name: string): Row[] {
    return (this.tables[name] ??= [])
  }

  from(name: string) {
    return new FakeQuery(this, name)
  }

  /** نداءات نوع واحد على جدول — «لا إدراج» = callsTo('shipments', 'insert') فارغة. */
  callsTo(table: string, method: string): Call[] {
    return this.calls.filter((c) => c.table === table && c.method === method)
  }

  /** الإدراج بقيم القاعدة الافتراضية للشحنة (الترحيل ٠٠٢): رقم تتبع وحالة أولى. */
  insertRow(name: string, row: Row): Row {
    const stored: Row =
      name === 'shipments'
        ? {
            id: `fake-${++trackingSeq}`,
            tracking_number: `BRQ-${String(trackingSeq).padStart(6, '0')}`,
            status: 'ORDER_RECEIVED',
            settlement_status: 'PENDING',
            currency: 'IQD',
            courier_id: null,
            created_at: new Date().toISOString(),
            ...row,
          }
        : { ...row }
    this.table(name).push(stored)
    return stored
  }
}
