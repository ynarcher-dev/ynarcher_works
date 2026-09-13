#!/usr/bin/env node
// 앱·Edge 소스에서 **테이블에 직접 닿는 자리**를 기계적으로 걷어 옵니다.
// ACL 분류의 근거를 "정책이 있으니 필요하겠지"가 아니라 "이 파일 이 줄이 실제로
// 이 연산을 호출한다"로 세우기 위한 도구이며, 읽기 전용입니다.
//
// 세 가지로 나눠 담습니다. 셋을 섞으면 근거의 강도가 뭉개집니다.
//   direct    .from('테이블')처럼 문자열이 그 자리에 있는 호출. 연산까지 확정됩니다.
//   dynamic   .from(config.tables.x)처럼 식으로 넘기는 호출. 연산만 확정되고 대상은
//             미상이라 사람이 붙여야 합니다(문자열 증거와 대조).
//   literals  카탈로그의 테이블 이름과 **정확히 같은 문자열 리터럴**이 나타난 자리.
//             dynamic을 메우는 보조 증거일 뿐 그 자체로 호출 증거가 아닙니다.
//
// 클라이언트(anon/authenticated 키)와 Edge(service_role)를 뿌리 기준으로 갈라 담습니다.
//
// 사용: node scripts/security/scan-data-access.mjs [--out <path>]
//       카탈로그(supabase/security/acl-inventory.json)가 있으면 테이블 이름을 거기서
//       읽고, 없으면 literals 패스를 건너뜁니다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const INVENTORY = path.join(REPO_ROOT, 'supabase', 'security', 'acl-inventory.json')

const argv = process.argv.slice(2)
const outFlag = argv.indexOf('--out')
const OUT = outFlag >= 0 && argv[outFlag + 1]
  ? path.resolve(argv[outFlag + 1])
  : path.join(REPO_ROOT, 'supabase', 'security', 'data-access-scan.json')

// 뿌리와 그 자리에서 쓰이는 자격(권한 판정의 주체)
const ROOTS = [
  { root: 'apps/works/src', actor: 'client' },
  { root: 'apps/guest/src', actor: 'client' },
  { root: 'packages', actor: 'client' },
  { root: 'supabase/functions', actor: 'edge' },
]
const EXT = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs'])
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage'])
// 테스트는 런타임 경로가 아닙니다. 가짜 클라이언트(`seed()`)가 같은 이름을 쓰므로
// 함께 세면 service_role이 닿는 표를 실제보다 넓게 셉니다.
const SKIP_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(path.join(dir, entry.name), out)
    } else if (EXT.has(path.extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      out.push(path.join(dir, entry.name))
    }
  }
  return out
}

const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/')
const lineOf = (src, index) => src.slice(0, index).split('\n').length

// .from( 뒤에 이어지는 첫 PostgREST 동사. upsert는 INSERT+UPDATE 둘 다로 읽습니다.
const VERB = /\.(select|insert|upsert|update|delete)\s*\(/
function verbAfter(src, from) {
  const m = VERB.exec(src.slice(from, from + 600))
  return m ? m[1] : null
}
const OPS = { select: ['SELECT'], insert: ['INSERT'], upsert: ['INSERT', 'UPDATE'], update: ['UPDATE'], delete: ['DELETE'] }

// **첫 동사만 보면 SELECT 요구를 놓칩니다.** PostgreSQL은
//   · `insert ... returning`(supabase-js의 `.insert(...).select()`)에서 돌려줄 칸의 SELECT를,
//   · `update`/`delete`의 WHERE에 쓰인 칸의 SELECT를
// 각각 따로 요구합니다. RLS를 우회하는 service_role도 **테이블 ACL은 그대로 받습니다** —
// 그래서 "INSERT만 주면 된다"가 실행 시점에 42501로 무너집니다.
//
// 체인 꼬리를 읽어 그 두 경우를 잡습니다. 체인은 다음 문(statement)이 시작하기 전까지로 봅니다.
const CHAIN_TAIL = /^[\s\S]{0,900}?(?=\n\s*(?:const|let|var|return|if|await\s+\w+\s*\.\s*from|\}\s*$)|$)/
const FILTERS = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|match|filter|or|not|rangeGt|rangeLt|textSearch)\s*\(/
const RETURNS = /\.(select|single|maybeSingle)\s*\(/

// 반환값을 받는 자리도 RETURNING입니다 — `.single()`만 붙는 형태와 구조분해 둘 다 봅니다.
function tailOps(src, at, verb) {
  const tail = (CHAIN_TAIL.exec(src.slice(at)) || [''])[0]
  const ops = new Set()
  // 쓰기 뒤에 값을 돌려받으면 RETURNING이고, RETURNING은 SELECT 권한을 요구합니다.
  if (verb !== 'select' && RETURNS.test(tail)) ops.add('SELECT')
  // UPDATE·DELETE의 WHERE 절에 쓰인 칸은 읽을 수 있어야 합니다.
  if ((verb === 'update' || verb === 'delete') && FILTERS.test(tail)) ops.add('SELECT')
  return [...ops]
}

// storage.from(...)은 테이블이 아니라 버킷입니다.
function isStorage(src, at) {
  return /\.storage\s*$/.test(src.slice(Math.max(0, at - 40), at))
}

// Edge에서 같은 `.from()`이라도 **어느 자격으로 도는지**가 갈립니다.
//   supabaseAdmin()      → service_role (RLS 우회, 표 권한 필요)
//   supabaseAsCaller(..) → 호출자 JWT를 실은 anon 키 = authenticated
// 수신 식별자를 같은 파일 안의 대입문까지 따라가 가릅니다. 못 가리면 unknown으로 둡니다 —
// 여기서 임의로 service_role이라고 접으면 권한 제안이 넓어집니다.
const RECEIVER = /([A-Za-z_$][A-Za-z0-9_$]*)\s*$/
function edgeActor(src, at, cache) {
  // 수신자가 앞줄에 오는 형태(`await caller` 개행 뒤 `.from(`)까지 잡도록 넉넉히 되돌아봅니다.
  const m = RECEIVER.exec(src.slice(Math.max(0, at - 120), at))
  const id = m?.[1]
  if (!id) return 'edge-unknown'
  if (!(id in cache)) {
    const decl = new RegExp(`(?:const|let|var)\\s+${id}\\s*(?::[^=]+)?=\\s*([^\\n]*)`).exec(src)
    const rhs = decl?.[1] ?? ''
    if (/supabaseAdmin\s*\(/.test(rhs)) cache[id] = 'edge-service_role'
    else if (/supabaseAsCaller\s*\(|ANON_KEY/.test(rhs)) cache[id] = 'edge-caller'
    // _shared/*는 클라이언트를 **인자로 받습니다** — 같은 파일에 대입문이 없습니다.
    // 그때는 이름 규약으로만 가릅니다. 추정임을 이름에 남겨 확정 증거와 섞이지 않게 합니다.
    else if (/^(admin|db)$/.test(id)) cache[id] = 'edge-service_role-inferred'
    else if (/^caller/.test(id)) cache[id] = 'edge-caller-inferred'
    else cache[id] = 'edge-unknown'
  }
  return cache[id]
}

const direct = new Map()   // table -> { ops:Set, sites:[] }
const dynamic = []
const rpcs = new Map()     // fn -> sites
const buckets = new Map()  // bucket-expr -> sites
const literals = new Map() // table -> sites

let tableNames = []
if (fs.existsSync(INVENTORY)) {
  const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'))
  tableNames = (inv.relations || [])
    .filter((r) => r.schema === 'public' && (r.kind === 'table' || r.kind === 'partitioned_table' || r.kind === 'view'))
    .map((r) => r.name)
} else {
  console.error('[scan] 카탈로그가 없어 literals 패스를 건너뜁니다 — acl-inventory.mjs export를 먼저 돌리세요.')
}
const tableSet = new Set(tableNames)

const FROM = /\.from\(\s*(?:(['"`])([A-Za-z0-9_]+)\1|([^)]{0,80}?))\s*\)/g
const RPC = /\.rpc\(\s*(['"`])([A-Za-z0-9_]+)\1/g
const LITERAL = /(['"`])([A-Za-z0-9_]+)\1/g

for (const { root, actor: rootActor } of ROOTS) {
  for (const file of walk(path.join(REPO_ROOT, root))) {
    const src = fs.readFileSync(file, 'utf8')
    const where = (i) => `${rel(file)}:${lineOf(src, i)}`
    const receiverCache = {}

    for (const m of src.matchAll(FROM)) {
      const at = m.index
      const actor = rootActor === 'edge' ? edgeActor(src, at, receiverCache) : rootActor
      if (isStorage(src, at)) {
        const key = (m[2] ?? m[3] ?? '').trim()
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push({ actor, site: where(at) })
        continue
      }
      const verb = verbAfter(src, at + m[0].length)
      if (!verb) continue // Array.from 등 PostgREST 호출이 아닌 자리
      // 첫 동사 + 체인 꼬리가 요구하는 추가 권한(RETURNING·WHERE)을 함께 셉니다.
      const extra = tailOps(src, at, verb)
      const allOps = [...OPS[verb], ...extra]
      if (m[2]) {
        if (!direct.has(m[2])) direct.set(m[2], { ops: new Set(), sites: [] })
        const rec = direct.get(m[2])
        for (const op of allOps) rec.ops.add(op)
        rec.sites.push({ actor, op: verb, requires: allOps, site: where(at) })
      } else {
        dynamic.push({ actor, arg: (m[3] || '').trim(), op: verb, requires: allOps, site: where(at) })
      }
    }

    for (const m of src.matchAll(RPC)) {
      const actor = rootActor === 'edge' ? edgeActor(src, m.index, receiverCache) : rootActor
      if (!rpcs.has(m[2])) rpcs.set(m[2], [])
      rpcs.get(m[2]).push({ actor, site: where(m.index) })
    }

    if (tableSet.size) {
      for (const m of src.matchAll(LITERAL)) {
        if (!tableSet.has(m[2])) continue
        if (!literals.has(m[2])) literals.set(m[2], [])
        literals.get(m[2]).push({ actor: rootActor, site: where(m.index) })
      }
    }
  }
}

const sortObj = (m, fn) => Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, fn(v)]))
const bySite = (a, b) => (a.site < b.site ? -1 : a.site > b.site ? 1 : 0)

const doc = {
  provenance: {
    generator: 'scripts/security/scan-data-access.mjs',
    roots: ROOTS,
    catalog_used: fs.existsSync(INVENTORY) ? 'supabase/security/acl-inventory.json' : null,
    caveat:
      'direct/rpc는 정적 증거, dynamic은 대상 미상, literals는 보조 증거입니다. ' +
      'ACL 결정은 이 파일만으로 내리지 않고 정책·화면 경로와 함께 읽습니다.',
  },
  counts: {
    direct_tables: direct.size,
    direct_sites: [...direct.values()].reduce((n, r) => n + r.sites.length, 0),
    dynamic_sites: dynamic.length,
    rpc_names: rpcs.size,
    storage_bucket_exprs: buckets.size,
  },
  direct: sortObj(direct, (r) => ({
    ops: [...r.ops].sort(),
    client_ops: [...new Set(r.sites.filter((s) => s.actor === 'client').flatMap((s) => s.requires ?? OPS[s.op]))].sort(),
    // Edge는 자격별로 갈라 담습니다 — service_role만 표 권한을 따로 필요로 합니다.
    edge_service_role_ops: [...new Set(r.sites.filter((s) => s.actor.startsWith('edge-service_role')).flatMap((s) => s.requires ?? OPS[s.op]))].sort(),
    edge_caller_ops: [...new Set(r.sites.filter((s) => s.actor.startsWith('edge-caller')).flatMap((s) => s.requires ?? OPS[s.op]))].sort(),
    edge_unknown_ops: [...new Set(r.sites.filter((s) => s.actor === 'edge-unknown').flatMap((s) => s.requires ?? OPS[s.op]))].sort(),
    sites: r.sites.sort(bySite),
  })),
  dynamic: dynamic.sort(bySite),
  rpc: sortObj(rpcs, (v) => v.sort(bySite)),
  storage_buckets: sortObj(buckets, (v) => v.sort(bySite)),
  literals: sortObj(literals, (v) => v.sort(bySite)),
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log(`[scan] 기록: ${rel(OUT)}`)
console.log(
  `[scan] 직접 호출 표 ${doc.counts.direct_tables}개(${doc.counts.direct_sites}곳) / ` +
    `동적 ${doc.counts.dynamic_sites}곳 / RPC ${doc.counts.rpc_names}개 / 버킷식 ${doc.counts.storage_bucket_exprs}개`,
)
