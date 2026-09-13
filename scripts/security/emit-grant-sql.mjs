#!/usr/bin/env node
// 결정 매니페스트(acl-decisions.json)를 **그대로** SQL 문장으로 옮깁니다.
// 마이그레이션 본문을 손으로 옮겨 적다가 한 표가 빠지거나 한 연산이 늘어나는 일을 막기 위한
// 도구이며, 판단은 하지 않습니다. 출력은 표준출력으로만 나가고 파일을 쓰지 않습니다.
//
// 사용: node scripts/security/emit-grant-sql.mjs [grant-auth|grant-service|revoke-nonrow|expected-matrix]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const d = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'security', 'acl-decisions.json'), 'utf8'),
)
const mode = process.argv[2] || 'grant-auth'
const ROW = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']

// 같은 권한 조합을 가진 표를 한 문장으로 묶습니다 — 문장 수가 줄어 읽기 쉽고,
// 표 이름은 그대로 남아 `all tables in schema`가 되지 않습니다.
function groupByOps(pick) {
  const groups = new Map()
  for (const x of d.decisions) {
    const ops = pick(x)
    if (!ops.length) continue
    const k = ops.join(', ').toLowerCase()
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(x.table)
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
}

function emitGrants(role, pick) {
  for (const [ops, tables] of groupByOps(pick)) {
    console.log(`grant ${ops} on table`)
    console.log(tables.sort().map((t) => `  public.${t}`).join(',\n'))
    console.log(`to ${role};`)
    console.log()
  }
}

if (mode === 'grant-auth') {
  emitGrants('authenticated', (x) => x.proposed.authenticated)
} else if (mode === 'grant-service') {
  emitGrants('service_role', (x) => x.proposed.service_role)
} else if (mode === 'revoke-nonrow') {
  const tables = d.decisions
    .filter((x) => x.delta.non_row_revoke.anon.length || x.delta.non_row_revoke.authenticated.length)
    .map((x) => x.table)
    .sort()
  console.log('revoke truncate, references, trigger on table')
  console.log(tables.map((t) => `  public.${t}`).join(',\n'))
  console.log('from anon, authenticated;')
  console.log(`-- ${tables.length} tables`)
} else if (mode === 'expected-matrix') {
  // pgTAP이 읽을 기대 행렬 — (표, 역할, 연산, 기대값)
  for (const x of d.decisions) {
    for (const op of ROW) {
      console.log(
        [x.table, 'authenticated', op, x.proposed.authenticated.includes(op)].join('|'),
      )
      console.log([x.table, 'service_role', op, x.proposed.service_role.includes(op)].join('|'))
      console.log([x.table, 'anon', op, false].join('|'))
    }
  }
} else {
  console.error('알 수 없는 모드입니다.')
  process.exit(1)
}
