import { maskBy } from '@/lib/mask'
import { supabase } from '@/lib/supabase'
import { GUEST_USER_TYPE_FILTER } from '@/lib/userTypes'
import {
  isMasked,
  type MaskOverrides,
  type SensitiveField,
} from '@/features/admin/sensitiveStore'
import { GLOBAL_TABLE } from '@/features/networks/globalConfig'
import { DIRECTORY_ENTITIES, ENTITIES, type EntityKey } from '@/features/networks/config'
import {
  MANAGEMENT_STATUSES,
  MANAGEMENT_STATUS_LABEL,
  startupContentKey,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

export const GLOBAL_SEARCH_MIN_LENGTH = 2

type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

export type SearchResultKind =
  | 'startup'
  | 'network'
  | 'global_network'
  | 'program'
  | 'fund'
  | 'employee'
  | 'board_post'
  | 'meeting_minute'
  | 'asset'

export interface SearchResult {
  id: string
  name: string
  kind: SearchResultKind
  detail: string | null
  badge: string
  tone: BadgeTone
  path: string
}

type SearchScope = Record<SensitiveField, boolean>

const NETWORK_CONTENT_KEYS = [
  ...DIRECTORY_ENTITIES.map((entity) => `networks.${entity}`),
  'networks.global',
] as const

const STARTUP_CONTENT_KEYS = MANAGEMENT_STATUSES.map((status) => startupContentKey(status))

const SEARCH_POLICY_CONTENT_KEYS = [
  ...STARTUP_CONTENT_KEYS,
  'startup.mine',
  ...NETWORK_CONTENT_KEYS,
] as const

const NETWORK_LIMIT = 4
const SOURCE_LIMIT = 6
const TOTAL_LIMIT = 50

function scopeOf(overrides: MaskOverrides, contentKey: string): SearchScope {
  return {
    name: !isMasked(overrides, contentKey, 'name'),
    email: !isMasked(overrides, contentKey, 'email'),
    phone: !isMasked(overrides, contentKey, 'phone'),
  }
}

export function globalSearchPolicyKey(overrides: MaskOverrides): string {
  return SEARCH_POLICY_CONTENT_KEYS.map((contentKey) => {
    const bits = (['name', 'email', 'phone'] as const)
      .map((field) => (isMasked(overrides, contentKey, field) ? '1' : '0'))
      .join('')
    return `${contentKey}:${bits}`
  }).join('|')
}

function displaySensitive(
  overrides: MaskOverrides,
  contentKey: string,
  field: SensitiveField,
  value: string | null | undefined,
): string {
  const raw = value?.trim()
  if (!raw) return '-'
  return isMasked(overrides, contentKey, field) ? maskBy(field, raw) : raw
}

function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

function orClause(fields: string[], kw: string): string {
  return fields.map((field) => `${field}.ilike.%${kw}%`).join(',')
}

async function safeRows<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await query
  if (error) return []
  return (data ?? []) as T[]
}

function detail(parts: Array<string | number | null | undefined>): string | null {
  const compacted = parts
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
  return compacted.length ? compacted.join(' · ') : null
}

function dedupe(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const r of results) {
    const key = `${r.kind}:${r.path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

interface StartupRow {
  id: string
  name: string
  representative: string | null
  management_status: ManagementStatus | null
  industry: string | null
  industries: string[] | null
  biz_reg_no: string | null
}

function startupIndustry(row: StartupRow): string | null {
  if (Array.isArray(row.industries) && row.industries.length > 0) {
    return row.industries.join(', ')
  }
  return row.industry
}

async function searchStartups(kw: string, overrides: MaskOverrides): Promise<SearchResult[]> {
  const groups: Array<{
    status: ManagementStatus | null
    contentKey: string
    label: string
  }> = [
    ...MANAGEMENT_STATUSES.map((status) => ({
      status,
      contentKey: startupContentKey(status),
      label: MANAGEMENT_STATUS_LABEL[status],
    })),
    { status: null, contentKey: 'startup.mine', label: '스타트업' },
  ]

  const chunks = await Promise.all(
    groups.map(async ({ status, contentKey, label }) => {
      const scope = scopeOf(overrides, contentKey)
      const fields = ['name', 'biz_reg_no']
      if (scope.name) fields.push('representative')
      if (scope.email) fields.push('email')
      if (scope.phone) fields.push('phone')

      let query = supabase
        .from('startups')
        .select('id, name, representative, management_status, industry, industries, biz_reg_no')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .or(orClause(fields, kw))
        .order('name', { ascending: true })
        .limit(SOURCE_LIMIT)

      query = status ? query.eq('management_status', status) : query.is('management_status', null)
      const rows = await safeRows<StartupRow>(query)
      return rows.map<SearchResult>((row) => ({
        id: row.id,
        name: row.name,
        kind: 'startup',
        detail: detail(['데이터베이스', label, startupIndustry(row)]),
        badge: '스타트업',
        tone: 'info',
        path: `/startup/discovered/${row.id}`,
      }))
    }),
  )

  return chunks.flat()
}

interface NetworkRow {
  id: string
  name: string
  affiliation: string | null
  email: string | null
  phone: string | null
}

async function searchNetworkEntity(
  entity: EntityKey,
  kw: string,
  overrides: MaskOverrides,
): Promise<SearchResult[]> {
  const contentKey = `networks.${entity}`
  const scope = scopeOf(overrides, contentKey)
  const fields = ['affiliation']
  if (scope.name) fields.push('name')
  if (scope.email) fields.push('email')
  if (scope.phone) fields.push('phone')

  const rows = await safeRows<NetworkRow>(
    supabase
      .from(entity)
      .select('id, name, affiliation, email, phone')
      .is('deleted_at', null)
      .is('merged_into_id', null)
      .or(orClause(fields, kw))
      .order('name', { ascending: true })
      .limit(NETWORK_LIMIT),
  )

  return rows.map((row) => ({
    id: `${entity}:${row.id}`,
    name: displaySensitive(overrides, contentKey, 'name', row.name),
    kind: 'network' as const,
    detail: detail(['데이터베이스', `${ENTITIES[entity].label} 네트워크`, row.affiliation]),
    badge: ENTITIES[entity].label,
    tone: entity === 'others' ? 'warning' : 'success',
    path: `/networks/${entity}/${row.id}`,
  }))
}

interface GlobalNetworkRow extends NetworkRow {
  category: string | null
}

async function searchGlobalNetworks(
  kw: string,
  overrides: MaskOverrides,
): Promise<SearchResult[]> {
  const contentKey = 'networks.global'
  const scope = scopeOf(overrides, contentKey)
  const fields = ['affiliation', 'category']
  if (scope.name) fields.push('name')
  if (scope.email) fields.push('email')
  if (scope.phone) fields.push('phone')

  const rows = await safeRows<GlobalNetworkRow>(
    supabase
      .from(GLOBAL_TABLE)
      .select('id, name, affiliation, email, phone, category')
      .is('deleted_at', null)
      .is('merged_into_id', null)
      .or(orClause(fields, kw))
      .order('name', { ascending: true })
      .limit(SOURCE_LIMIT),
  )

  return rows.map((row) => ({
    id: `${GLOBAL_TABLE}:${row.id}`,
    name: displaySensitive(overrides, contentKey, 'name', row.name),
    kind: 'global_network' as const,
    detail: detail(['데이터베이스', '글로벌 네트워크', row.category, row.affiliation]),
    badge: '글로벌',
    tone: 'success' as const,
    path: `/networks/global/${row.id}`,
  }))
}

interface ProgramSearchSpec {
  table: 'programs' | 'ma_programs' | 'project_programs'
  workspace: string
  badge: string
  basePath: string
  tone: BadgeTone
}

const PROGRAM_SPECS: ProgramSearchSpec[] = [
  { table: 'programs', workspace: 'AC', badge: '사업', basePath: '/ac', tone: 'info' },
  { table: 'ma_programs', workspace: 'M&A', badge: '딜', basePath: '/mna', tone: 'warning' },
  {
    table: 'project_programs',
    workspace: 'PROJECT',
    badge: '프로젝트',
    basePath: '/project',
    tone: 'neutral',
  },
]

interface ProgramRow {
  id: string
  code: string | null
  title: string
  internal_title: string | null
  host_organization: string | null
  partner_organization: string | null
}

async function searchPrograms(spec: ProgramSearchSpec, kw: string): Promise<SearchResult[]> {
  const rows = await safeRows<ProgramRow>(
    supabase
      .from(spec.table)
      .select('id, code, title, internal_title, host_organization, partner_organization')
      .is('deleted_at', null)
      .or(
        orClause(
          ['title', 'internal_title', 'code', 'host_organization', 'partner_organization'],
          kw,
        ),
      )
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(SOURCE_LIMIT),
  )

  return rows.map((row) => ({
    id: `${spec.table}:${row.id}`,
    name: row.title,
    kind: 'program' as const,
    detail: detail(['워크스페이스', spec.workspace, row.code, row.host_organization]),
    badge: spec.badge,
    tone: spec.tone,
    path: `${spec.basePath}/programs/${row.id}`,
  }))
}

interface FundRow {
  id: string
  code: string | null
  name: string
  vintage_year: number | null
}

async function searchFunds(kw: string): Promise<SearchResult[]> {
  const rows = await safeRows<FundRow>(
    supabase
      .from('funds')
      .select('id, code, name, vintage_year')
      .is('deleted_at', null)
      .or(orClause(['name', 'code'], kw))
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(SOURCE_LIMIT),
  )

  return rows.map((row) => ({
    id: `fund:${row.id}`,
    name: row.name,
    kind: 'fund' as const,
    detail: detail(['워크스페이스', 'FUND', row.code, row.vintage_year]),
    badge: '펀드',
    tone: 'warning' as const,
    path: `/fund/${row.id}`,
  }))
}

interface EmployeeRow {
  id: string
  name: string
  email: string | null
  phone: string | null
}

async function searchEmployees(kw: string): Promise<SearchResult[]> {
  const rows = await safeRows<EmployeeRow>(
    supabase
      .from('users')
      .select('id, name, email, phone')
      .not('user_type', 'in', GUEST_USER_TYPE_FILTER)
      .is('deleted_at', null)
      .or(orClause(['name', 'email', 'phone'], kw))
      .order('name', { ascending: true })
      .limit(SOURCE_LIMIT),
  )

  return rows.map((row) => ({
    id: `employee:${row.id}`,
    name: row.name,
    kind: 'employee' as const,
    detail: detail(['워크스페이스', '임직원', row.email]),
    badge: '임직원',
    tone: 'neutral' as const,
    path: `/office/managers/${row.id}`,
  }))
}

type BoardKind = 'POST' | 'ARCHIVE'

interface BoardPostRow {
  id: string
  title: string
  summary: string | null
  author_name: string | null
  global_notice: boolean
  boards:
    | { slug: string; label: string; kind: BoardKind; is_active: boolean }
    | { slug: string; label: string; kind: BoardKind; is_active: boolean }[]
    | null
}

function boardOf(row: BoardPostRow) {
  return Array.isArray(row.boards) ? row.boards[0] : row.boards
}

async function searchBoardPosts(kw: string): Promise<SearchResult[]> {
  const rows = await safeRows<BoardPostRow>(
    supabase
      .from('board_posts')
      .select('id, title, summary, author_name, global_notice, boards!inner(slug, label, kind, is_active)')
      .is('deleted_at', null)
      .eq('boards.is_active', true)
      .or(orClause(['title', 'summary', 'author_name'], kw))
      .order('created_at', { ascending: false })
      .limit(SOURCE_LIMIT),
  )

  return rows.flatMap((row) => {
    const board = boardOf(row)
    if (!board) return []
    const archive = board.kind === 'ARCHIVE'
    return [{
      id: `board:${row.id}`,
      name: row.title,
      kind: 'board_post' as const,
      detail: detail(['워크스페이스', row.global_notice ? '공지사항' : board.label, row.author_name]),
      badge: row.global_notice ? '공지' : archive ? '자료실' : '게시글',
      tone: row.global_notice ? 'danger' as const : archive ? 'neutral' as const : 'info' as const,
      path: archive ? `/office?tab=${board.slug}` : `/office?tab=${board.slug}&post=${row.id}`,
    }]
  })
}

interface MinuteRow {
  id: string
  title: string
  agenda: string | null
  author_name: string | null
  meeting_date: string | null
}

async function searchMinutes(kw: string): Promise<SearchResult[]> {
  const rows = await safeRows<MinuteRow>(
    supabase
      .from('meeting_minutes')
      .select('id, title, agenda, author_name, meeting_date')
      .is('deleted_at', null)
      .or(orClause(['title', 'agenda', 'author_name'], kw))
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .limit(SOURCE_LIMIT),
  )

  return rows.map((row) => ({
    id: `minute:${row.id}`,
    name: row.title,
    kind: 'meeting_minute' as const,
    detail: detail(['워크스페이스', '회의록', row.meeting_date, row.author_name]),
    badge: '회의록',
    tone: 'neutral' as const,
    path: `/office?tab=minutes&minute=${row.id}`,
  }))
}

interface AssetRow {
  id: string
  name: string
  item_type: string | null
  location: string | null
}

/**
 * 검색은 시리얼 번호로도 걸지만(현장에서 기기 뒷면을 보고 찾는 경로다) 결과 줄에는 적지 않는다.
 * 이 결과가 데려가는 곳이 OFFICE 자산 현황이고, 그 화면은 시리얼을 노출하지 않는 화면이기
 * 때문이다 — 검색 결과에만 적으면 눌러 들어간 화면에서 그 값이 사라진다.
 */
async function searchPortableAssets(kw: string): Promise<SearchResult[]> {
  const rows = await safeRows<AssetRow>(
    supabase
      .from('assets')
      .select('id, name, item_type, location')
      .is('deleted_at', null)
      .eq('is_portable', true)
      .or(orClause(['name', 'item_type', 'serial_no', 'location'], kw))
      .order('name', { ascending: true })
      .limit(SOURCE_LIMIT),
  )

  return rows.map((row) => ({
    id: `asset:${row.id}`,
    name: row.name,
    kind: 'asset' as const,
    detail: detail(['워크스페이스', '자산 현황', row.item_type, row.location]),
    badge: '자산',
    tone: 'neutral' as const,
    path: `/office?tab=outbound&asset=${row.id}`,
  }))
}

export async function fetchUnifiedSearch(
  keyword: string,
  overrides: MaskOverrides,
): Promise<SearchResult[]> {
  const kw = sanitizeOrValue(keyword)
  if (kw.length < GLOBAL_SEARCH_MIN_LENGTH) return []

  const [
    startups,
    networkChunks,
    globalNetworks,
    programChunks,
    funds,
    employees,
    boardPosts,
    minutes,
    assets,
  ] = await Promise.all([
    searchStartups(kw, overrides),
    Promise.all(DIRECTORY_ENTITIES.map((entity) => searchNetworkEntity(entity, kw, overrides))),
    searchGlobalNetworks(kw, overrides),
    Promise.all(PROGRAM_SPECS.map((spec) => searchPrograms(spec, kw))),
    searchFunds(kw),
    searchEmployees(kw),
    searchBoardPosts(kw),
    searchMinutes(kw),
    searchPortableAssets(kw),
  ])

  return dedupe([
    ...startups,
    ...networkChunks.flat(),
    ...globalNetworks,
    ...programChunks.flat(),
    ...funds,
    ...employees,
    ...boardPosts,
    ...minutes,
    ...assets,
  ]).slice(0, TOTAL_LIMIT)
}
