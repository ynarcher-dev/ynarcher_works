#!/usr/bin/env node
/**
 * 운영 DB에 SQL 파일 하나를 실행한다 — **기본은 롤백**이다.
 *
 * 왜 스크립트로 고정해 두는가. 매번 임시 폴더에 일회용 스크립트를 써서 붙으면, 승인 규칙을
 * 걸 자리가 없다(경로가 세션마다 바뀐다). 운영 DB로 가는 문은 하나여야 규칙도 하나로 건다.
 *
 * 규칙 셋을 이 파일이 진다.
 *   · **드라이런이 기본**이다. `begin` → 실행 → `rollback`. 실제로 적히려면 `--commit`을
 *     손으로 붙여야 한다. 손이 미끄러져 적히는 일을 없앤다.
 *   · **TLS 검증을 끄지 않는다.** Supabase 사설 CA를 pin한다(`rejectUnauthorized:false` 금지는
 *     이 저장소의 규칙이다). CA는 CLI가 받아 둔 것을 쓴다.
 *   · **잠금을 오래 붙들지 않는다.** lock_timeout 5초, statement_timeout 2분.
 *
 * 쓰임:
 *   node scripts/db/run-sql.mjs supabase/migrations/2026….sql            # 드라이런
 *   node scripts/db/run-sql.mjs supabase/migrations/2026….sql --commit   # 실제 적용
 *   node scripts/db/run-sql.mjs scripts/db/adhoc/check.sql               # 조회도 같은 문으로
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * `pg`는 이 저장소의 의존성이 아니다(앱은 supabase-js로만 붙는다). 운영용 스크립트 하나 때문에
 * 런타임 의존성을 늘리지 않는다 — 대신 밖에 설치한 것을 빌려 쓴다.
 *   npm i pg --no-save --prefix "$TMP" && PG_MODULE_DIR="$TMP/node_modules" node scripts/db/run-sql.mjs …
 */
const loadPg = () => {
  const dirs = [
    import.meta.dirname,
    process.env.PG_MODULE_DIR,
    // 이 기계에서 `npm i pg --no-save`가 떨어지는 자리. 있으면 환경변수 없이도 그냥 붙는다.
    path.join(os.tmpdir(), 'claude', 'node_modules'),
  ].filter(Boolean)
  for (const dir of dirs) {
    try {
      return createRequire(path.join(dir, 'noop.cjs'))('pg')
    } catch {
      /* 다음 자리를 본다 */
    }
  }
  console.error(
    'pg 모듈을 찾지 못했습니다. 임시 폴더에 설치한 뒤 PG_MODULE_DIR로 그 node_modules를 가리켜 주세요.',
  )
  process.exit(2)
}
const pg = loadPg()

const ENV_FILE = 'apps/works/.env.local'
const CA_FILE = 'supabase/.temp/pgdelta/pgdelta-target-ca.crt'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const file = args.find((a) => !a.startsWith('--'))

if (!file) {
  console.error('실행할 .sql 파일을 지정해 주세요. 예) node scripts/db/run-sql.mjs supabase/migrations/….sql')
  process.exit(2)
}
if (!fs.existsSync(file)) {
  console.error(`파일이 없습니다: ${file}`)
  process.exit(2)
}

const env = fs.readFileSync(ENV_FILE, 'utf8')
const matched = env.match(/^SUPABASE_DB_URL="?([^"\r\n]+)"?/m)
if (!matched) {
  console.error(`${ENV_FILE}에 SUPABASE_DB_URL이 없습니다.`)
  process.exit(2)
}

if (!fs.existsSync(CA_FILE)) {
  console.error(
    `사설 CA(${CA_FILE})가 없습니다. TLS 검증은 끄지 않습니다 — ` +
      'https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt 를 받아 이 자리에 두세요.',
  )
  process.exit(2)
}

const sql = fs.readFileSync(file, 'utf8')
const client = new pg.Client({
  connectionString: matched[1],
  ssl: { ca: fs.readFileSync(CA_FILE, 'utf8'), rejectUnauthorized: true },
  connectionTimeoutMillis: 20000,
})
client.on('notice', (n) => console.log('NOTICE:', n.message))

console.log(`${commit ? '적용' : '드라이런'}: ${path.normalize(file)}`)
await client.connect()
try {
  await client.query('begin')
  await client.query("set local lock_timeout = '5s'")
  await client.query("set local statement_timeout = '120s'")
  const result = await client.query(sql)
  // 조회용 SQL이면 결과를 보여 준다(여러 문장이면 pg가 배열로 준다).
  for (const r of Array.isArray(result) ? result : [result]) {
    if (r.rows?.length) console.table(r.rows)
  }
  await client.query(commit ? 'commit' : 'rollback')
  console.log(commit ? '=== 적용 완료(COMMIT) ===' : '=== 되돌림(ROLLBACK) — 실제 적용은 --commit ===')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error(`실패 ${e.code ?? ''}: ${e.message}`)
  if (e.position) {
    const i = Number(e.position) - 1
    console.error('--- 그 자리 ---')
    console.error(sql.slice(Math.max(0, i - 200), i + 120))
  }
  process.exitCode = 1
} finally {
  await client.end()
}
