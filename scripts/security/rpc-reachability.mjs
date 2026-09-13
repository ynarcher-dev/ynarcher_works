#!/usr/bin/env node
// RPC가 **호출자 권한으로** 닿는 표를 끝까지 따라갑니다.
//
// 왜 필요한가: 정책과 `.from('표')`만 보면 ACL 인벤토리가 닫히지 않습니다. `SECURITY INVOKER`
// 함수는 호출자 권한으로 돌기 때문에, 화면이 표를 직접 만지지 않아도 그 함수가 만지는 표에
// 호출자의 테이블 권한이 필요합니다. 반대로 `SECURITY DEFINER`는 소유자(postgres) 권한으로
// 돌므로 그 안쪽 표는 호출자 ACL을 요구하지 않습니다 — **DEFINER를 만나면 거기서 멈춥니다.**
//
// 하는 일
//   1. 재생된 DB에서 public·app 함수의 본문·언어·secdef를 읽습니다(본문은 저장하지 않습니다).
//   2. 함수 간 호출 그래프를 만들고, INVOKER인 동안에만 전이적으로 따라갑니다.
//   3. 각 함수가 호출자 권한으로 요구하는 (표, 연산) 집합을 냅니다.
//   4. 브라우저가 부르는 RPC와 Edge가 부르는 RPC를 그 결과에 붙여, 역할별로 필요한 표 권한을
//      한 벌로 만듭니다.
//
// 한계(정직하게): 본문 텍스트 대조입니다. 동적 SQL(`execute format(...)`)의 대상은 잡히지
// 않으므로 따로 표시하고 사람이 봅니다. 결과는 결정이 아니라 **근거**입니다.
//
// 사용: node scripts/security/rpc-reachability.mjs --state <acl-db.json>

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = path.join(REPO_ROOT, 'supabase', 'security')
const OUT = path.join(DIR, 'rpc-reachability.json')

const argv = process.argv.slice(2)
const sf = argv.indexOf('--state')
const STATE_FILE = sf >= 0 && argv[sf + 1] ? path.resolve(argv[sf + 1]) : process.env.ACL_DB_STATE
if (!STATE_FILE || !fs.existsSync(STATE_FILE)) {
  console.error('[rpc] --state <acl-db.json>가 필요합니다.')
  process.exit(1)
}
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))

function psqlJson(sql) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-P', 'pager=off', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  )
  if (r.status !== 0) throw new Error(`psql 실패 (exit ${r.status})\n${(r.stderr || '').slice(0, 3000)}`)
  const out = r.stdout.trim()
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))
}

// 본문은 여기서만 쓰고 파일로 남기지 않습니다.
const routines = psqlJson(`
begin transaction read only;
select coalesce(jsonb_agg(jsonb_build_object(
         'schema', n.nspname, 'name', p.proname,
         'args', pg_catalog.pg_get_function_identity_arguments(p.oid),
         'secdef', p.prosecdef,
         'lang', l.lanname,
         'kind', p.prokind,
         'src', p.prosrc
       ) order by n.nspname, p.proname), '[]'::jsonb)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
 where n.nspname in ('public', 'app');
commit;
`)

const tables = psqlJson(`
begin transaction read only;
select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm');
commit;
`)
const tableSet = new Set(tables)

// ── 본문에서 (표, 연산) 뽑기 ───────────────────────────────────────────
// 주석과 문자열 리터럴을 먼저 걷어냅니다 — 주석 안의 표 이름이 요구 권한으로 세어지면
// 제안이 조용히 넓어집니다.
function strip(src) {
  return src
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, " '' ")
}

const NAME = '(?:public\\s*\\.\\s*)?"?([a-z_][a-z0-9_]*)"?'
const PATTERNS = [
  [new RegExp(`\\binsert\\s+into\\s+${NAME}`, 'gi'), 'INSERT'],
  [new RegExp(`\\bupdate\\s+(?:only\\s+)?${NAME}`, 'gi'), 'UPDATE'],
  [new RegExp(`\\bdelete\\s+from\\s+(?:only\\s+)?${NAME}`, 'gi'), 'DELETE'],
  [new RegExp(`\\bfrom\\s+(?:only\\s+)?${NAME}`, 'gi'), 'SELECT'],
  [new RegExp(`\\bjoin\\s+(?:only\\s+)?${NAME}`, 'gi'), 'SELECT'],
  [new RegExp(`\\busing\\s+${NAME}`, 'gi'), 'SELECT'],
]

// 쓰기 문이 **추가로** SELECT를 요구하는 두 경우. 첫 낱말만 보면 놓칩니다.
//   · `update|delete ... where` — WHERE에 쓰인 칸을 읽을 수 있어야 합니다.
//   · `insert ... returning`   — 돌려줄 칸을 읽을 수 있어야 합니다.
// INVOKER 함수는 호출자 권한으로 돌므로 이 SELECT가 없으면 실행 시점에 42501입니다.
const WRITE_NEEDS_SELECT = [
  [new RegExp(`\\bupdate\\s+(?:only\\s+)?${NAME}`, 'gi'), /\bwhere\b|\breturning\b/i],
  [new RegExp(`\\bdelete\\s+from\\s+(?:only\\s+)?${NAME}`, 'gi'), /\bwhere\b|\breturning\b/i],
  [new RegExp(`\\binsert\\s+into\\s+${NAME}`, 'gi'), /\breturning\b/i],
]

function tableOps(src) {
  const body = strip(src)
  const ops = {}
  const add = (t, op) => {
    if (!tableSet.has(t)) return
    ;(ops[t] ??= new Set()).add(op)
  }
  for (const [re, op] of PATTERNS) {
    for (const m of body.matchAll(re)) add(m[1].toLowerCase(), op)
  }
  // 문(statement) 단위로 봅니다 — 매치 지점부터 다음 `;`까지가 그 문의 범위입니다.
  for (const [re, tail] of WRITE_NEEDS_SELECT) {
    for (const m of body.matchAll(re)) {
      const end = body.indexOf(';', m.index)
      const stmt = body.slice(m.index, end < 0 ? body.length : end)
      if (tail.test(stmt)) add(m[1].toLowerCase(), 'SELECT')
    }
  }
  return ops
}

// 동적 SQL은 대상이 본문에 없습니다. 따로 표시합니다.
const DYNAMIC = /\bexecute\s+(format\s*\(|'|"|\w+\s*\|\|)/i

// ── 함수 그래프 ────────────────────────────────────────────────────────
const byName = new Map() // "schema.name" -> [routine...]
for (const r of routines) {
  const k = `${r.schema}.${r.name}`
  if (!byName.has(k)) byName.set(k, [])
  byName.get(k).push(r)
}
const bareName = new Map() // name -> ["schema.name"...]
for (const k of byName.keys()) {
  const n = k.split('.')[1]
  if (!bareName.has(n)) bareName.set(n, [])
  bareName.get(n).push(k)
}

function callees(src) {
  const body = strip(src)
  const found = new Set()
  for (const m of body.matchAll(/\b(?:app\s*\.\s*|public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const n = m[1].toLowerCase()
    for (const k of bareName.get(n) ?? []) found.add(k)
  }
  return [...found]
}

const analyzed = new Map()
for (const [k, list] of byName) {
  const merged = {}
  let dynamic = false
  const out = new Set()
  for (const r of list) {
    for (const [t, ops] of Object.entries(tableOps(r.src))) {
      ;(merged[t] ??= new Set())
      for (const o of ops) merged[t].add(o)
    }
    if (DYNAMIC.test(strip(r.src))) dynamic = true
    for (const c of callees(r.src)) if (c !== k) out.add(c)
  }
  analyzed.set(k, {
    key: k,
    secdef: list.some((r) => r.secdef),
    mixed_secdef: new Set(list.map((r) => r.secdef)).size > 1,
    lang: [...new Set(list.map((r) => r.lang))].sort(),
    own_tables: merged,
    calls: [...out].sort(),
    dynamic_sql: dynamic,
  })
}

// INVOKER인 동안에만 전이적으로 따라갑니다. DEFINER를 만나면 그 가지는 거기서 끝입니다.
function callerReach(root) {
  const need = {}
  const seenDefinerStops = new Set()
  const dynamicAt = new Set()
  const seen = new Set()
  const stack = [root]
  while (stack.length) {
    const k = stack.pop()
    if (seen.has(k)) continue
    seen.add(k)
    const a = analyzed.get(k)
    if (!a) continue
    for (const [t, ops] of Object.entries(a.own_tables)) {
      ;(need[t] ??= new Set())
      for (const o of ops) need[t].add(o)
    }
    if (a.dynamic_sql) dynamicAt.add(k)
    for (const c of a.calls) {
      const ca = analyzed.get(c)
      if (!ca) continue
      if (ca.secdef) { seenDefinerStops.add(c); continue } // 권한 경계 — 넘지 않습니다
      stack.push(c)
    }
  }
  return { need, definer_stops: [...seenDefinerStops].sort(), dynamic_at: [...dynamicAt].sort(), visited: [...seen].sort() }
}

// ── 호출자(브라우저·Edge)가 부르는 RPC ─────────────────────────────────
const scan = JSON.parse(fs.readFileSync(path.join(DIR, 'data-access-scan.json'), 'utf8'))
const callers = {}
for (const [fn, sites] of Object.entries(scan.rpc)) {
  const k = `public.${fn}`
  if (!analyzed.has(k)) { callers[fn] = { exists: false, sites }; continue }
  const a = analyzed.get(k)
  const principals = [...new Set(sites.map((s) => s.actor))].sort()
  const reach = a.secdef
    ? { need: {}, definer_stops: [k], dynamic_at: [], visited: [k] }
    : callerReach(k)
  callers[fn] = {
    exists: true,
    security: a.secdef ? 'DEFINER' : 'INVOKER',
    mixed_secdef: a.mixed_secdef,
    principals,
    sites: sites.map((s) => s.site),
    // DEFINER면 호출자 ACL 요구는 없습니다(EXECUTE만 필요).
    caller_required_table_ops: Object.fromEntries(
      Object.entries(reach.need).map(([t, s]) => [t, [...s].sort()]).sort(([a1], [b1]) => (a1 < b1 ? -1 : 1)),
    ),
    definer_boundary_at: reach.definer_stops,
    dynamic_sql_in: reach.dynamic_at,
    invoker_chain_size: reach.visited.length,
  }
}

const invokerCalled = Object.entries(callers).filter(([, v]) => v.exists && v.security === 'INVOKER')

// 역할별 합산 — 호출자 자격이 authenticated인 경로만 표 권한을 요구합니다.
function aggregate(actorTest) {
  const need = {}
  for (const [fn, v] of invokerCalled) {
    if (!v.principals.some(actorTest)) continue
    for (const [t, ops] of Object.entries(v.caller_required_table_ops)) {
      ;(need[t] ??= { ops: new Set(), via: [] })
      for (const o of ops) need[t].ops.add(o)
      need[t].via.push(fn)
    }
  }
  return Object.fromEntries(
    Object.entries(need).sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([t, v]) => [t, { ops: [...v.ops].sort(), via_rpc: [...new Set(v.via)].sort() }]),
  )
}

const doc = {
  provenance: {
    generator: 'scripts/security/rpc-reachability.mjs',
    project_id: state.project_id,
    source_cutoff: state.source_cutoff,
    migrations_sha256: state.migrations_sha256,
    method: 'pg_proc.prosrc 텍스트 대조 + INVOKER 전이 폐포. 함수 본문은 저장하지 않습니다.',
    limits: [
      'execute format(...) 같은 동적 SQL의 대상은 잡히지 않습니다 — dynamic_sql_in으로 표시합니다.',
      'SECURITY DEFINER를 만나면 그 가지에서 멈춥니다(권한 경계).',
      '이 파일은 근거이며 결정이 아닙니다. 결정은 acl-decisions.json이 갖습니다.',
    ],
  },
  counts: {
    routines_public_app: byName.size,
    rpc_called_by_source: Object.keys(callers).length,
    rpc_not_found_in_db: Object.values(callers).filter((v) => !v.exists).length,
    rpc_definer: Object.values(callers).filter((v) => v.exists && v.security === 'DEFINER').length,
    rpc_invoker: invokerCalled.length,
    rpc_invoker_requiring_caller_table_ops: invokerCalled.filter(
      ([, v]) => Object.keys(v.caller_required_table_ops).length,
    ).length,
    rpc_with_dynamic_sql: Object.values(callers).filter((v) => v.exists && v.dynamic_sql_in?.length).length,
  },
  // 호출자 자격별로 필요한 표 권한
  required_by_authenticated: aggregate((a) => a === 'client' || a.startsWith('edge-caller')),
  required_by_service_role: aggregate((a) => a.startsWith('edge-service_role')),
  rpcs: Object.fromEntries(Object.entries(callers).sort(([a], [b]) => (a < b ? -1 : 1))),
}

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log('[rpc] 기록: supabase/security/rpc-reachability.json')
console.log(JSON.stringify(doc.counts, null, 2))
