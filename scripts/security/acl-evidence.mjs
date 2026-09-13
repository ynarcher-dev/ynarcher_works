#!/usr/bin/env node
// 카탈로그(acl-inventory.json)와 소스 증거(data-access-scan.json)를 **표 단위로 합쳐**
// 결정에 필요한 사실만 한 줄에 세웁니다. 판단은 하지 않습니다 — 분류는 사람이
// supabase/security/acl-decisions.json에 적고, 이 파일은 그 근거를 기계적으로 만듭니다.
//
// 한 표당 담는 것
//   policy_commands   실제 정책이 존재하는 명령(SELECT/INSERT/UPDATE/DELETE/ALL)
//   policy_roles      정책이 대상으로 선언한 역할
//   current           지금 이 DB에서 anon/authenticated/service_role이 가진 유효 권한
//   client_ops        앱(브라우저 키)이 이 표에 직접 거는 연산 — .from('표')가 확정한 것
//   edge_*_ops        Edge Function이 거는 연산 — service_role / 호출자 JWT / 미상으로 가름
//   literal_sites     표 이름 문자열이 앱 소스에 나타난 자리 수(동적 호출 보조 증거)
//   gap_policy_no_acl 정책은 허용하는데 ACL이 없어 42501로 먼저 막히는 명령
//   gap_acl_no_policy ACL은 있는데 그 명령의 정책이 없어 실제로는 0행인 명령
//
// 사용: node scripts/security/acl-evidence.mjs [--print]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = path.join(REPO_ROOT, 'supabase', 'security')
const inv = JSON.parse(fs.readFileSync(path.join(DIR, 'acl-inventory.json'), 'utf8'))
const scan = JSON.parse(fs.readFileSync(path.join(DIR, 'data-access-scan.json'), 'utf8'))
const OUT = path.join(DIR, 'acl-evidence.json')

const ROW = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
// 행을 열지 않는 권한. Data API(PostgREST) 경로는 이 넷을 하나도 쓰지 않습니다.
const NON_ROW = ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']

const tables = inv.relations.filter((r) => r.schema === 'public' && (r.kind === 'table' || r.kind === 'partitioned_table'))

const rows = tables.map((t) => {
  const priv = t.privileges || {}
  const cmds = new Set()
  for (const p of t.policies || []) {
    if (p.command === 'ALL') ROW.forEach((c) => cmds.add(c))
    else cmds.add(p.command)
  }
  const policyRoles = [...new Set((t.policies || []).flatMap((p) => p.roles))].sort()
  const d = scan.direct[t.name]
  const clientOps = d?.client_ops ?? []
  const edgeSvcOps = d?.edge_service_role_ops ?? []
  const edgeCallerOps = d?.edge_caller_ops ?? []
  const edgeUnknownOps = d?.edge_unknown_ops ?? []
  const auth = (priv.authenticated || []).filter((p) => ROW.includes(p))

  return {
    table: t.name,
    rls_enabled: t.rls_enabled,
    rls_forced: t.rls_forced,
    policy_count: (t.policies || []).length,
    policy_commands: [...cmds].sort(),
    policy_roles: policyRoles,
    current: {
      anon: priv.anon || [],
      authenticated: priv.authenticated || [],
      service_role: priv.service_role || [],
    },
    client_ops: clientOps,
    edge_service_role_ops: edgeSvcOps,
    edge_caller_ops: edgeCallerOps,
    edge_unknown_ops: edgeUnknownOps,
    direct_sites: d?.sites?.length ?? 0,
    literal_sites: (scan.literals[t.name] || []).length,
    // 정책은 허용하는데 권한이 없어 42501로 먼저 막히는 명령
    gap_policy_no_acl: [...cmds].filter((c) => !auth.includes(c)).sort(),
    // 권한은 있는데 그 명령의 정책이 없어 실제로는 아무 행에도 닿지 않는 명령
    gap_acl_no_policy: auth.filter((c) => !cmds.has(c)).sort(),
    non_row_residue: {
      anon: (priv.anon || []).filter((p) => NON_ROW.includes(p)),
      authenticated: (priv.authenticated || []).filter((p) => NON_ROW.includes(p)),
      service_role: (priv.service_role || []).filter((p) => NON_ROW.includes(p)),
    },
  }
})

const doc = {
  provenance: {
    generator: 'scripts/security/acl-evidence.mjs',
    inputs: ['supabase/security/acl-inventory.json', 'supabase/security/data-access-scan.json'],
    source_cutoff: inv.provenance.source_cutoff,
    migrations_sha256: inv.provenance.migrations_sha256,
    caveat: '기계적 결합입니다. 분류·결정은 supabase/security/acl-decisions.json이 갖습니다.',
  },
  counts: {
    tables: rows.length,
    rls_disabled: rows.filter((r) => !r.rls_enabled).length,
    client_touched: rows.filter((r) => r.client_ops.length).length,
    edge_service_role_touched: rows.filter((r) => r.edge_service_role_ops.length).length,
    edge_caller_touched: rows.filter((r) => r.edge_caller_ops.length).length,
    edge_unknown_touched: rows.filter((r) => r.edge_unknown_ops.length).length,
    untouched_by_source: rows.filter(
      (r) => !r.client_ops.length && !r.edge_service_role_ops.length && !r.edge_caller_ops.length &&
        !r.edge_unknown_ops.length && !r.literal_sites,
    ).length,
    with_policy_no_acl_gap: rows.filter((r) => r.gap_policy_no_acl.length).length,
    with_acl_no_policy_gap: rows.filter((r) => r.gap_acl_no_policy.length).length,
    anon_non_row_residue: rows.filter((r) => r.non_row_residue.anon.length).length,
    authenticated_non_row_residue: rows.filter((r) => r.non_row_residue.authenticated.length).length,
    service_role_non_row_residue: rows.filter((r) => r.non_row_residue.service_role.length).length,
    service_role_without_any_row_priv: rows.filter(
      (r) => !r.current.service_role.some((p) => ROW.includes(p)),
    ).length,
  },
  tables: rows.sort((a, b) => (a.table < b.table ? -1 : 1)),
}

fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log(`[evidence] 기록: supabase/security/acl-evidence.json`)
console.log(JSON.stringify(doc.counts, null, 2))

if (process.argv.includes('--print')) {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`\n${pad('table', 38)}${pad('pol.cmds', 26)}${pad('auth.now', 24)}${pad('client', 22)}edge`)
  for (const r of doc.tables) {
    console.log(
      pad(r.table, 38) +
        pad(r.policy_commands.map((c) => c[0]).join('') || '-', 26) +
        pad(r.current.authenticated.filter((p) => ROW.includes(p)).map((c) => c[0]).join('') || '-', 24) +
        pad(r.client_ops.map((c) => c[0]).join('') || '-', 22) +
        (r.edge_service_role_ops.map((c) => c[0]).join('') || '-'),
    )
  }
}
