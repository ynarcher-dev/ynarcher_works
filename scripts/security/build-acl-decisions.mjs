#!/usr/bin/env node
// 표마다 "어떤 권한이 필요한가"를 하나씩 정하고 supabase/security/acl-decisions.json에 씁니다.
// **결정 규칙은 이 파일이 정본이고**, 산출 JSON은 그 규칙을 159개 표에 적용한 결과입니다.
// 규칙을 코드로 둔 이유는 159줄을 손으로 적으면 다음 마이그레이션 뒤 다시 손으로 맞춰야 하고,
// 그때 한 줄이 조용히 어긋나기 때문입니다.
//
// 결정의 근거 세 가지 — 셋이 모두 맞아야 권한을 제안합니다.
//   ① 재생된 카탈로그의 **실제 정책**(어떤 명령에 정책이 있는가)
//   ② 소스에서 확인된 **실제 호출**(그 연산을 정말 거는가)
//   ③ 아래 손으로 적은 해소표·예외(설정 객체를 거쳐 가는 호출, 승인된 물리 삭제)
//
// 규칙
//   · 정책이 INSERT를 허용한다는 사실만으로 INSERT를 주지 않습니다. 호출 증거가 있어야 합니다.
//   · DELETE 정책이 없으면 DELETE를 주지 않습니다. 정책이 있어도 승인된 호출 경로가
//     확인된 자리에만 줍니다(현재 한 곳 — 아래 DELETE_EXCEPTIONS).
//   · 자격증명·감사·서버 전용 표에는 쓰기를 주지 않습니다(PROTECTED).
//   · `grant all tables in schema`·기본 권한(default privileges) 변경은 제안에 담지 않습니다.
//     기본 권한은 별도 결정 항목(open_questions)으로 올립니다.
//
// 사용: node scripts/security/build-acl-decisions.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = path.join(REPO_ROOT, 'supabase', 'security')
const ev = JSON.parse(fs.readFileSync(path.join(DIR, 'acl-evidence.json'), 'utf8'))
// RPC가 **호출자 권한으로** 닿는 표. 정책과 `.from`만 보면 INVOKER 함수의 요구가 통째로 빠집니다.
const rpc = JSON.parse(fs.readFileSync(path.join(DIR, 'rpc-reachability.json'), 'utf8'))
// Edge/RPC 담당의 소스 전수 감사(22개 함수 전문 확인). 우리 정규식 스캔보다 넓습니다.
const edge = JSON.parse(fs.readFileSync(path.join(DIR, 'edge-source-findings.json'), 'utf8'))
const OUT = path.join(DIR, 'acl-decisions.json')

const ROW = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const NON_ROW = ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']

// ── ① 설정 객체를 거쳐 가는 호출의 해소표 ────────────────────────────────
// 스캐너가 `.from(config.tables.x)`로만 본 자리를 사람이 붙인 것입니다. 각 항목은
// 그 매핑을 담은 **설정 파일**과 그 설정을 쓰는 **호출 파일**을 근거로 답니다.
const RESOLVED_INDIRECT = {
  // 태그(기준정보) 원장 14개 — ADMIN 태그 관리 화면 한 벌이 같은 훅으로 전부 다룹니다.
  //   설정: apps/works/src/features/admin/tagConfig.ts (TAG_CONFIGS)
  //   호출: apps/works/src/features/admin/hooks.ts useTags/useCreateTag/useUpdateTag/
  //         useSetTagOrder(s)/useSetTagMode/useDeleteTag + TagAdminPanel.tsx:53-61
  //   삭제는 soft delete(`deleted_at` UPDATE)라 DELETE는 쓰지 않습니다(hooks.ts:219).
  ...Object.fromEntries(
    [
      'industry_tags', 'field_tags', 'category_tags', 'region_tags', 'country_tags',
      'investment_stage_tags', 'company_category_tags', 'company_status_tags',
      'location_region_tags', 'location_tags', 'investment_method_tags',
      'position_tags', 'rank_tags', 'pay_step_tags',
    ].map((t) => [t, {
      ops: ['SELECT', 'INSERT', 'UPDATE'],
      why: 'ADMIN 태그 관리 화면(TagAdminPanel)이 useTags/useCreateTag/useUpdateTag로 직접 다룹니다.',
      evidence: ['apps/works/src/features/admin/tagConfig.ts', 'apps/works/src/features/admin/hooks.ts:105-235'],
    }]),
  ),

  // 사업 공용 모듈 원장 — SHARED_TABLES(workspace.tsx:127)를 거쳐 갑니다.
  program_modules: {
    ops: ['SELECT', 'UPDATE'],
    why: 'SHARED_TABLES.modules — 모듈 목록 조회와 상세 수정.',
    evidence: ['apps/works/src/features/program/hooks.ts:257', 'apps/works/src/features/program/detail/detailHooks.ts:66'],
  },
  program_module_assignees: {
    ops: ['SELECT'],
    why: 'moduleCols()가 SHARED_TABLES.moduleAssignees를 PostgREST embedded relation으로 읽습니다. 쓰기는 SECURITY DEFINER set_program_module RPC가 소유합니다.',
    evidence: ['apps/works/src/features/program/hooks.ts:242-260'],
  },
  approval_recipients: {
    ops: ['SELECT'],
    why: 'Approval list/detail selects approval_recipients as a PostgREST embedded relation; the embedded table therefore needs SELECT in addition to its direct INSERT path.',
    evidence: ['apps/works/src/features/approval/approvalApi.ts:9-16', 'apps/works/src/features/approval/approvalApi.ts:174-181'],
  },
  approval_reads: {
    ops: ['SELECT'],
    why: 'Approval list/detail selects approval_reads as a PostgREST embedded relation; the embedded table therefore needs SELECT in addition to its direct UPSERT path.',
    evidence: ['apps/works/src/features/approval/approvalApi.ts:9-16', 'apps/works/src/features/approval/approvalApi.ts:174-181'],
  },
  program_links: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'SHARED_TABLES.links — URL첨부 모듈의 링크 원장.',
    evidence: ['apps/works/src/features/program/moduleContentHooks.ts:108,144,151'],
  },
  program_posts: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'SHARED_TABLES.posts — 글쓰기 모듈의 글 원장.',
    evidence: ['apps/works/src/features/program/moduleContentHooks.ts:34,54,60'],
  },
  program_participant_entries: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'SHARED_TABLES.participantEntries — 참가자 명단.',
    evidence: ['apps/works/src/features/program/rosterHooks.ts:250,396', 'apps/works/src/features/program/participantHooks.ts:332'],
  },
  program_participants: {
    ops: ['SELECT', 'INSERT'],
    why: 'SHARED_TABLES.participants — 참가자(게스트 계정 축).',
    evidence: ['apps/works/src/features/program/participantHooks.ts:509', 'apps/works/src/features/management/employeeActivity.ts:188'],
  },

  // 사업/딜 원장과 그 하위 — config.tables.*(ProjectWorkspace.tsx:26 / MnaWorkspace.tsx:29)
  program_managers: {
    ops: ['SELECT'],
    why: 'config.tables.managers(PROJECT) — 대시보드·활동 집계 읽기. 쓰기는 set_program_staffing RPC가 합니다.',
    evidence: ['apps/works/src/features/project/ProjectWorkspace.tsx:28', 'apps/works/src/features/hub/dashboard/businessDashboardHooks.ts:99'],
  },
  ma_program_managers: {
    ops: ['SELECT'],
    why: 'config.tables.managers(M&A) — 같은 부품, 같은 경로. 쓰기는 set_ma_program_staffing RPC.',
    evidence: ['apps/works/src/features/mna/MnaWorkspace.tsx:31', 'apps/works/src/features/management/employeeActivity.ts:102'],
  },
  program_departments: {
    ops: ['SELECT'],
    why: 'config.tables.departments(PROJECT) — 읽기만. 쓰기는 set_program_staffing RPC.',
    evidence: ['apps/works/src/features/project/ProjectWorkspace.tsx:29', 'apps/works/src/features/program/programsPoolHooks.ts:338'],
  },
  ma_program_departments: {
    ops: ['SELECT'],
    why: 'config.tables.departments(M&A) — 읽기만.',
    evidence: ['apps/works/src/features/mna/MnaWorkspace.tsx:32'],
  },

  // 물리 원장 넷 — LEDGERS(master/ledgers.ts)와 useCreateEntity/useEntity(master/entityHooks.ts)를
  // 거쳐 갑니다. 20260912025406이 같은 근거로 이미 부여한 표이며 여기서 근거를 다시 답니다.
  startups: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'LEDGERS.startups + useCreateEntity/useEntity — 목록·등록·수정과 deactivate_entities의 soft delete.',
    evidence: ['apps/works/src/features/master/ledgers.ts:41', 'apps/works/src/features/master/entityHooks.ts:35,60', 'apps/works/src/features/hub/globalSearch.ts:161'],
  },
  networks: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'NETWORK_TABLE + LEDGERS.networks — NETWORKS 목록·등록·수정.',
    evidence: ['apps/works/src/features/networks/config.ts:17', 'apps/works/src/features/networks/hooks.ts:283,297', 'apps/works/src/features/master/ledgers.ts'],
  },
  programs: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'config.tables.programs(PROJECT) — 사업 목록·생성·상태 변경·soft delete.',
    evidence: ['apps/works/src/features/project/ProjectWorkspace.tsx:27', 'apps/works/src/features/program/hooks.ts:134,161', 'apps/works/src/features/program/programsPoolHooks.ts:354'],
  },
  ma_programs: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'config.tables.programs(M&A) — 같은 program 부품을 공유해 경로가 같습니다.',
    evidence: ['apps/works/src/features/mna/MnaWorkspace.tsx:30', 'apps/works/src/features/program/hooks.ts:134,161'],
  },

  // KPI — 템플릿 보관(soft delete)만 동적 호출이라 여기서 붙입니다.
  // 나머지 KPI 쓰기(버전 발행·배정·실적)는 SECURITY DEFINER RPC가 하므로 표 권한이 필요 없습니다.
  kpi_templates: {
    ops: ['UPDATE'],
    why: 'useArchiveKpiRow(table) — deleted_at UPDATE로 보관합니다.',
    evidence: ['apps/works/src/features/management/kpi/kpiMutations.ts:62-66'],
  },
  kpi_template_items: {
    ops: ['UPDATE'],
    why: 'useArchiveKpiRow(table) — 같은 훅이 두 표를 다룹니다.',
    evidence: ['apps/works/src/features/management/kpi/kpiMutations.ts:56,62-66'],
  },

  // M&A 당사자 원장 — cfg.table(MA_BUYER/MA_SELLER)와 LEDGERS를 거쳐 갑니다.
  ma_buyers: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'MaPartyConfig.table + LEDGERS.ma_buyers — 목록·등록·수정(soft delete 포함).',
    evidence: ['apps/works/src/features/mna/parties/config.ts:82', 'apps/works/src/features/mna/parties/hooks.ts:106,137', 'apps/works/src/features/master/ledgers.ts'],
  },
  ma_sellers: {
    ops: ['SELECT', 'INSERT', 'UPDATE'],
    why: 'MaPartyConfig.table + LEDGERS.ma_sellers — 같은 경로.',
    evidence: ['apps/works/src/features/mna/parties/config.ts:94', 'apps/works/src/features/mna/parties/hooks.ts:106,137', 'apps/works/src/features/master/ledgers.ts'],
  },
}

// ── ② 서버 전용·보호 표 ──────────────────────────────────────────────────
// 클라이언트에 **쓰기를 주지 않습니다.** 읽기를 주는 자리는 이유를 함께 답니다.
const PROTECTED = {
  guest_credentials: {
    client: [],
    why: '게스트 자격증명(해시·잠금 카운터). 정책이 한 건도 없어 기본 거부이며, 취급은 Edge(service_role) 전용입니다.',
  },
  audit_logs: {
    client: ['SELECT'],
    why: '감사 로그. 위조 불가해야 하므로 쓰기를 주지 않습니다. 열람 경계는 audit_logs_select(app.is_admin())가 정합니다.',
  },
  access_logs: {
    client: ['SELECT'],
    why: '접근 로그. 적재는 서버(service_role·SECURITY DEFINER)가 하고 화면은 읽기만 합니다.',
  },
  approval_budget_revisions: {
    client: [],
    why: '서버가 쓰는 예산 감사 이력. 기존 결정(20260912025406)대로 DML을 주지 않습니다.',
  },
  approval_doc_counters: {
    client: [],
    why: '문서번호 채번 카운터. 정책이 없고 채번은 SECURITY DEFINER RPC가 합니다.',
  },
  entity_codes: {
    client: [],
    why: '엔티티 코드 채번. 정책이 없고 assign_entity_code 트리거가 소유합니다.',
  },
  notification_logs: {
    client: [],
    why: '발송 로그. 적재는 서버 경로이며 화면 직접 조회 증거가 없습니다.',
  },
  guest_identities: {
    client: ['SELECT'],
    why: '원장 행과 게스트 계정의 연결. 생성·연결은 ADMIN Edge 경로가 맡습니다(기존 결정 유지).',
  },
  workspace_permissions: {
    client: ['SELECT'],
    why: '권한 원장. 변경은 권한 변경 RPC/Edge 경로가 맡고 감사 로그가 함께 남습니다.',
  },
  permission_templates: {
    client: ['SELECT'],
    why: '권한 템플릿(기준정보). 프로비저닝은 Edge가 읽어 씁니다.',
  },
}

// ── ③ 승인된 물리 삭제 예외 ─────────────────────────────────────────────
// DELETE 정책이 있고 **실제 승인된 CRUD 경로가 물리 삭제를 쓰는** 자리만 적습니다.
const DELETE_EXCEPTIONS = {
  capital_call_payments: {
    role: 'authenticated',
    why: '캐피탈콜 삭제 시 납입 행을 물리 삭제합니다 — 순수 배정성 데이터라 원자 교체 RPC도 hard DELETE 하고, 남기면 집계와 화면이 어긋납니다.',
    evidence: ['apps/works/src/features/fund/hooks.ts:314-330', 'capital_call_payments의 DELETE 정책 존재'],
  },
  users: {
    role: 'service_role',
    why: '임직원 생성 실패 시 되돌리기(hr_profiles 저장 실패 → 방금 만든 public/auth 계정 회수). 클라이언트에는 주지 않습니다.',
    evidence: ['supabase/functions/employee-create/index.ts:133'],
  },
}

// ── ④ 동적 SQL RPC가 닿는 표 ────────────────────────────────────────────
// `execute format('update public.%I …')`처럼 대상이 인자로 들어오는 INVOKER 함수는 본문
// 대조로 잡히지 않습니다. 대상 후보는 함수 안 화이트리스트가 정하고(여기서는
// `app.has_contribution_trigger` / `app.merge_ref_tables`), 실제로 넘어오는 값은 호출부가
// 정합니다. **함수가 받아들일 수 있는 표 전부가 아니라 호출부가 실제로 넘기는 표만** 적습니다.
const DYNAMIC_RPC_TARGETS = {
  // update_entity(p_table) / restore_entity(p_entity_key) / merge_entity(p_table)
  //   호출부가 넘기는 값: LEDGERS 4개(master/ledgers.ts) + config.tables.programs 2개.
  //   함수는 log_entity_contribution 트리거가 달린 표면 무엇이든 받지만(partners 포함),
  //   partners를 넘기는 호출부가 없으므로 권한을 주지 않습니다.
  startups: { ops: ['UPDATE'], why: 'update_entity/merge_entity/restore_entity가 호출자 권한으로 UPDATE 합니다.', evidence: ['apps/works/src/features/master/entityHooks.ts:87', 'public.update_entity (INVOKER, execute format)'] },
  networks: { ops: ['UPDATE'], why: '같음 + upload_enrich_entity(대량 보강).', evidence: ['apps/works/src/features/networks/hooks.ts:325,381', 'apps/works/src/features/networks/BulkUploadPanel.tsx:322'] },
  ma_buyers: { ops: ['UPDATE'], why: 'update_entity(p_table=cfg.table) — 화면은 직접 UPDATE 하지 않고 이 RPC를 경유합니다.', evidence: ['apps/works/src/features/mna/parties/hooks.ts:167,190'] },
  ma_sellers: { ops: ['UPDATE'], why: '같음.', evidence: ['apps/works/src/features/mna/parties/hooks.ts:167,190'] },
  programs: { ops: ['UPDATE'], why: 'update_entity(p_table=config.tables.programs).', evidence: ['apps/works/src/features/program/detail/detailHooks.ts:39'] },
  ma_programs: { ops: ['UPDATE'], why: '같음(M&A 설정).', evidence: ['apps/works/src/features/program/detail/detailHooks.ts:39', 'apps/works/src/features/mna/MnaWorkspace.tsx:30'] },

  // merge_entity가 다형 참조를 정본으로 옮기는 단계(app.merge_ref_tables).
  attachments: { ops: ['UPDATE'], why: "merge_entity의 'move' 단계가 target_id를 정본으로 옮깁니다.", evidence: ['app.merge_ref_tables → attachments(move)'] },
  entity_feedback: { ops: ['UPDATE'], why: "merge_entity의 'move' 단계.", evidence: ['app.merge_ref_tables → entity_feedback(move)'] },
  program_participant_entries: { ops: ['UPDATE'], why: "merge_entity의 'soft' 단계가 겹치는 줄을 접습니다.", evidence: ['app.merge_ref_tables → program_participant_entries(soft)'] },
  program_participants: { ops: ['SELECT'], why: "merge_entity의 'block' 검사(읽기만).", evidence: ['app.merge_ref_tables → program_participants(block)'] },
}

// guest_invitations는 여기(PROTECTED)에 있었습니다. "초대 소진은 Edge(service_role)가 한다"는
// 전제였는데, 실제 경로가 그렇지 않습니다 — guest-access-invite/index.ts는 **호출자의 토큰을
// 그대로 달아** open_program_guest_access(SECURITY INVOKER)를 부르고, 그 함수 본문이
// guest_invitations를 UPDATE 하고 없으면 INSERT 합니다(20260909240000). 즉 요구되는 권한은
// service_role이 아니라 **authenticated**의 것입니다. 화면 호출만 보면 SELECT 하나로 보이므로
// 이 자리는 INVOKER 전이 폐포가 없으면 통째로 빠집니다. 권한을 열어도 경계는 그대로 RLS가
// 집니다 — guest_inv_insert/update는 is_admin() 또는 project·guest 워크스페이스 쓰기 권한을
// 요구하고, guest_inv_select는 게스트 세 역할을 명시적으로 뺍니다.

// merge_entity가 요구하지만 **정책이 없어 권한을 줘도 닿지 않는** 자리. 권한으로 덮지 않고
// 사실로 보고합니다(정책 공백이지 ACL 공백이 아닙니다).
const POLICY_GAP_BLOCKED = {
  meeting_minute_links: {
    needed: ['UPDATE', 'DELETE'],
    why: 'merge_entity가 회의록 상호참조를 정본으로 옮기고 겹치면 지웁니다. 그런데 이 표에는 SELECT 정책 하나뿐이라 authenticated 호출자에게는 RLS가 먼저 막습니다 — 권한을 줘도 0행입니다.',
    action: '권한을 주지 않습니다. 병합이 회의록 링크를 옮기지 못하는 것은 정책 쪽 결함이며 별도 과제입니다.',
  },
}

// ── 분류 ────────────────────────────────────────────────────────────────
const uniq = (a) => [...new Set(a)].sort((x, y) => ROW.indexOf(x) - ROW.indexOf(y))

function decide(r) {
  const policy = new Set(r.policy_commands)
  const indirect = RESOLVED_INDIRECT[r.table]
  const protectedRule = PROTECTED[r.table]
  const del = DELETE_EXCEPTIONS[r.table]

  const dynRpc = DYNAMIC_RPC_TARGETS[r.table]
  const blocked = POLICY_GAP_BLOCKED[r.table]
  // Edge/RPC 담당의 전수 감사(소스 전문 확인) — 우리 정규식 스캔의 상위 집합입니다.
  const edgeBrowser = edge.browser_tables[r.table]?.ops ?? []
  const edgeCaller = edge.edge_caller_tables[r.table] ?? []
  const edgeSvc = edge.edge_service_role_tables[r.table] ?? []
  // INVOKER RPC가 호출자 권한으로 요구하는 연산.
  const rpcAuth = rpc.required_by_authenticated[r.table]?.ops ?? []
  const rpcAuthVia = rpc.required_by_authenticated[r.table]?.via_rpc ?? []
  const rpcSvc = rpc.required_by_service_role[r.table]?.ops ?? []

  const observedClient = uniq([
    ...r.client_ops, ...(indirect?.ops ?? []), ...r.edge_caller_ops,
    ...edgeBrowser, ...edgeCaller, ...rpcAuth, ...(dynRpc?.ops ?? []),
  ])
  const svcObserved = uniq([...r.edge_service_role_ops, ...edgeSvc, ...rpcSvc])
  const unresolvedEdge = r.edge_unknown_ops ?? []

  let cls
  let clientGrant = []
  const notes = []

  if (r.table.startsWith('_retired_')) {
    cls = 'legacy-unused'
    notes.push('구 원장(이관 완료). 호출 증거가 없으므로 권한을 주지 않습니다. 표 자체의 존치는 별도 과제입니다.')
  } else if (protectedRule) {
    cls = 'server-only-protected'
    clientGrant = protectedRule.client
    notes.push(protectedRule.why)
  } else if (observedClient.length === 0 && svcObserved.length === 0) {
    cls = r.literal_sites > 0 ? 'unresolved' : 'unresolved'
    notes.push(
      r.literal_sites > 0
        ? `표 이름 문자열은 소스에 ${r.literal_sites}곳 나타나지만 직접 호출 증거가 없습니다 — 화면 경로 확인이 필요합니다.`
        : '앱·Edge 어디에서도 직접 호출 증거가 없습니다 — 미사용인지 RPC 전용인지 소유자 확인이 필요합니다.',
    )
  } else if (observedClient.length === 0) {
    cls = 'server-only-protected'
    notes.push('클라이언트 호출 증거가 없고 Edge(service_role)만 닿습니다.')
  } else if (observedClient.length === 1 && observedClient[0] === 'SELECT') {
    cls = /_tags$/.test(r.table) ? 'lookup' : 'read-only'
    clientGrant = ['SELECT']
  } else {
    cls = /_tags$/.test(r.table) ? 'lookup' : 'policy-backed-client-dml'
    clientGrant = observedClient
  }

  // 정책이 없는 명령은 주지 않습니다 — 주더라도 0행이고, 정책 공백을 권한으로 덮게 됩니다.
  const withoutPolicy = clientGrant.filter((op) => !policy.has(op))
  if (withoutPolicy.length) {
    notes.push(`호출은 있으나 정책이 없어 제외한 명령: ${withoutPolicy.join(', ')} — 정책 공백으로 별도 보고합니다.`)
  }
  clientGrant = clientGrant.filter((op) => policy.has(op))

  // DELETE는 (ㄱ) 그 표에 DELETE 정책이 있고 (ㄴ) 승인된 경로가 실제로 물리 삭제를 쓸 때만
  // 줍니다. 승인된 경로에는 화면의 직접 호출과 **INVOKER RPC의 행 교체**가 함께 들어갑니다 —
  // 배정성 원장(담당자·목적·납입)은 "지우고 다시 넣기"가 정상 동작이며, 그 RPC는 호출자
  // 권한으로 돌기 때문에 권한이 없으면 그 자리에서 42501로 멈춥니다.
  const deleteWanted = clientGrant.includes('DELETE') || del?.role === 'authenticated'
  clientGrant = clientGrant.filter((op) => op !== 'DELETE')
  if (deleteWanted && policy.has('DELETE')) {
    clientGrant.push('DELETE')
    notes.push(
      del?.role === 'authenticated'
        ? `물리 삭제 예외: ${del.why}`
        : `물리 삭제 예외(행 교체): INVOKER RPC ${rpcAuthVia.join(', ')}가 호출자 권한으로 이 표의 행을 지우고 다시 넣습니다. DELETE 정책이 있습니다.`,
    )
  } else if (deleteWanted) {
    notes.push('DELETE를 요구하는 경로가 있으나 DELETE 정책이 없어 주지 않습니다.')
  }

  let svcGrant = svcObserved.filter((op) => op !== 'DELETE')
  if (svcObserved.includes('DELETE') || del?.role === 'service_role') {
    svcGrant.push('DELETE')
    notes.push(`service_role 물리 삭제: ${del?.why ?? 'Edge 전수 감사에서 확인된 서버 경로.'}`)
  }
  if (unresolvedEdge.length) {
    notes.push(`우리 스캔에서 Edge 자격이 미상인 호출이 있었습니다(${unresolvedEdge.join(', ')}). Edge 전수 감사 결과로 갈음합니다.`)
  }
  if (rpcAuth.length) {
    notes.push(`INVOKER RPC가 호출자 권한으로 요구: ${rpcAuth.join(', ')} (경유 ${rpcAuthVia.slice(0, 4).join(', ')}).`)
  }
  if (dynRpc) notes.push(`동적 SQL RPC 대상: ${dynRpc.why}`)
  if (blocked) notes.push(`정책 공백으로 막힌 요구: ${blocked.why} ${blocked.action}`)

  const currentAuth = r.current.authenticated.filter((p) => ROW.includes(p))
  const currentSvc = r.current.service_role.filter((p) => ROW.includes(p))

  return {
    table: r.table,
    decision: cls,
    rls_enabled: r.rls_enabled,
    policy_commands: r.policy_commands,
    evidence: {
      client_ops_direct: r.client_ops,
      client_ops_resolved_indirect: indirect?.ops ?? [],
      client_ops_edge_caller: r.edge_caller_ops,
      edge_service_role_ops: r.edge_service_role_ops,
      edge_unresolved_ops: unresolvedEdge,
      direct_call_sites: r.direct_sites,
      name_literal_sites: r.literal_sites,
      indirect_why: indirect?.why ?? null,
      indirect_evidence: indirect?.evidence ?? [],
      // Edge/RPC 담당의 전수 감사
      edge_audit_browser_ops: edgeBrowser,
      edge_audit_caller_ops: edgeCaller,
      edge_audit_service_role_ops: edgeSvc,
      edge_audit_sites: edge.browser_tables[r.table]?.sites ?? [],
      // INVOKER RPC 전이 폐포
      invoker_rpc_required_ops: rpcAuth,
      invoker_rpc_via: rpcAuthVia,
      dynamic_rpc_ops: dynRpc?.ops ?? [],
      dynamic_rpc_evidence: dynRpc?.evidence ?? [],
      policy_gap_blocked: blocked ?? null,
    },
    proposed: {
      authenticated: uniq(clientGrant),
      service_role: uniq(svcGrant),
      anon: [],
    },
    // 이번 마이그레이션 뒤에 **실제로 남아야 하는** 권한입니다. 제안(proposed)과 다를 수 있는
    // 이유는 하나뿐입니다 — 근거를 찾지 못한 기존 권한을 이번에 회수하지 않기로 했기 때문입니다
    // (delta.authenticated_unjustified_review). 회귀 테스트는 제안이 아니라 이 값을 봅니다.
    expected: {
      authenticated: uniq([...clientGrant, ...currentAuth]),
      service_role: uniq([...svcGrant, ...currentSvc]),
      anon: [],
    },
    current: { authenticated: currentAuth, service_role: currentSvc },
    delta: {
      // 지금 제안하는 것 — 정책과 호출 증거가 함께 있는 자리에만 더합니다.
      authenticated_grant: uniq(clientGrant).filter((p) => !currentAuth.includes(p)),
      service_role_grant: uniq(svcGrant).filter((p) => !currentSvc.includes(p)),
      // 행을 열지 않는 권한. 근거 없이 기본 권한으로 딸려 온 것이라 회수를 제안합니다.
      non_row_revoke: {
        anon: r.non_row_residue.anon,
        authenticated: r.non_row_residue.authenticated,
      },
      // **제안이 아니라 확인 대기**입니다. 지금 권한이 있는데 호출 증거를 찾지 못한 자리이며,
      // 스캐너가 못 본 경로일 수 있으므로 이번 마이그레이션에서 회수하지 않습니다.
      authenticated_unjustified_review: currentAuth.filter((p) => !clientGrant.includes(p)),
    },
    notes,
  }
}

const decisions = ev.tables.map(decide)
const by = (c) => decisions.filter((d) => d.decision === c).map((d) => d.table)

const doc = {
  provenance: {
    generator: 'scripts/security/build-acl-decisions.mjs',
    input: 'supabase/security/acl-evidence.json',
    source_cutoff: ev.provenance.source_cutoff,
    migrations_sha256: ev.provenance.migrations_sha256,
    status: '이 파일은 마이그레이션이 아니며 DB를 바꾸지 않습니다. 결정과 기대 권한의 정본입니다.',
    // delta·named_lists는 **생성 시점의 카탈로그**를 기준으로 한 차이입니다. ACL 마이그레이션이
    // 이미 반영된 DB에서 다시 돌리면 모두 0이 되며, 그것이 곧 "제안이 그대로 들어갔다"는
    // 확인입니다. 반대로 expected는 카탈로그 상태와 무관하게 같아야 합니다(멱등).
    catalog_state: ev.counts.anon_non_row_residue === 0 && ev.counts.authenticated_non_row_residue === 0
      ? 'ACL 마이그레이션 반영 후'
      : 'ACL 마이그레이션 반영 전',
    applied_by: [
      'supabase/migrations/20260912160000_acl_table_privileges.sql',
      'supabase/migrations/20260912160500_acl_default_privileges.sql',
      'supabase/migrations/20260912161000_acl_rpc_execute_narrowing.sql',
      'supabase/migrations/20260913011827_grant_program_module_assignees_read.sql',
      'supabase/migrations/20260913170000_restore_approval_embedded_read_grants.sql',
    ],
  },
  classes: {
    'policy-backed-client-dml': '정책이 뒷받침하고 화면이 실제로 쓰는 표. 관찰된 연산만 부여합니다.',
    'read-only': '화면이 읽기만 하는 표. SELECT만 부여합니다.',
    lookup: '기준정보(태그) 원장. ADMIN 화면이 SELECT/INSERT/UPDATE로 다룹니다(삭제는 soft).',
    'server-only-protected': '서버(service_role·SECURITY DEFINER)만 쓰는 표. 클라이언트 쓰기를 주지 않습니다.',
    'legacy-unused': '이관이 끝난 구 원장. 권한을 주지 않습니다.',
    unresolved: '호출 증거가 없거나 간접 증거만 있어 소유자 확인이 필요한 표.',
  },
  counts: {
    tables: decisions.length,
    by_decision: Object.fromEntries(
      ['policy-backed-client-dml', 'read-only', 'lookup', 'server-only-protected', 'legacy-unused', 'unresolved']
        .map((c) => [c, by(c).length]),
    ),
    authenticated_grant_changes: decisions.filter((d) => d.delta.authenticated_grant.length).length,
    authenticated_review_candidates: decisions.filter((d) => d.delta.authenticated_unjustified_review.length).length,
    service_role_grant_changes: decisions.filter((d) => d.delta.service_role_grant.length).length,
    non_row_revoke_tables: decisions.filter(
      (d) => d.delta.non_row_revoke.anon.length || d.delta.non_row_revoke.authenticated.length,
    ).length,
  },
  named_lists: {
    // 마이그레이션을 쓸 때 그대로 옮겨 적을 이름 목록입니다. `all tables in schema`는 쓰지 않습니다.
    grant_authenticated: Object.fromEntries(
      ROW.map((op) => [op, decisions.filter((d) => d.delta.authenticated_grant.includes(op)).map((d) => d.table)])
        .filter(([, v]) => v.length),
    ),
    // 회수 제안이 아니라 **확인 대기 목록**입니다. 이번 마이그레이션 대상이 아닙니다.
    review_authenticated_row: Object.fromEntries(
      ROW.map((op) => [op, decisions.filter((d) => d.delta.authenticated_unjustified_review.includes(op)).map((d) => d.table)])
        .filter(([, v]) => v.length),
    ),
    grant_service_role: Object.fromEntries(
      ROW.map((op) => [op, decisions.filter((d) => d.delta.service_role_grant.includes(op)).map((d) => d.table)])
        .filter(([, v]) => v.length),
    ),
    revoke_non_row_anon: decisions.filter((d) => d.delta.non_row_revoke.anon.length).map((d) => d.table),
    revoke_non_row_authenticated: decisions.filter((d) => d.delta.non_row_revoke.authenticated.length).map((d) => d.table),
    non_row_privileges: NON_ROW,
  },
  open_questions: [
    {
      id: 'Q1-service-role-row-privileges',
      fact: '재생된 DB에서 service_role은 public 159개 표 전부에 SELECT/INSERT/UPDATE/DELETE가 없습니다(비행 권한 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN만 있습니다).',
      impact: 'supabaseAdmin() 경로의 Edge Function이 새 환경·복구 환경에서 42501로 떨어집니다 — 내부 인증(internalAuth.ts)이 users·workspace_permissions를 읽지 못해 함께 막힙니다.',
      options: [
        'A. 관찰된 표만 이름으로 부여(named_lists.grant_service_role) — 최소 권한이지만 스캐너가 못 본 경로가 있으면 그 자리에서 깨집니다.',
        'B. Edge 담당의 소스 인벤토리로 목록을 확정한 뒤 A를 적용 — 권장.',
      ],
      needs: '부모 판단 + Edge 담당의 service_role 사용 지점 확정',
    },
    {
      id: 'Q2-service-role-rpc-execute',
      fact: 'Edge가 부르는 RPC 8개 중 7개에 service_role EXECUTE가 없습니다. 다만 그 7개는 호출자 JWT 클라이언트(supabaseAsCaller)로 부르는 것으로 보입니다.',
      impact: '추정이 맞으면 문제가 없고, 틀리면 해당 Edge 경로가 새 환경에서 실패합니다.',
      needs: 'Edge 담당의 호출 자격 확인',
    },
    {
      id: 'Q3-default-privileges',
      fact: 'public 스키마의 기본 권한(postgres 소유)이 anon·authenticated·service_role에 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN을 계속 부여합니다.',
      impact: '표 단위 회수는 그 시점의 표만 고칩니다. 다음 마이그레이션의 새 표에서 같은 잔여가 다시 생깁니다.',
      options: [
        'A. 이번에는 이름 목록 회수만 하고 잔여 재발은 회귀 테스트로 감시.',
        'B. `alter default privileges in schema public revoke ...`를 함께 둔다 — 재발을 막지만 기본 권한 변경이라 이번 범위 밖입니다.',
      ],
      needs: '부모 판단(기본 권한 변경은 지시에서 제외된 범위)',
    },
    {
      id: 'Q4-security-invoker-views',
      fact: 'portable_assets·trade_partners_directory 두 뷰가 security_invoker=false이며 authenticated에 SELECT가 있습니다.',
      impact: '뷰는 소유자(postgres) 권한으로 돌아 기반 표(assets·trade_partners)의 RLS를 우회합니다. 경계는 뷰 본문의 app.is_internal_user() 하나뿐입니다.',
      needs: '의도된 마스킹 뷰인지, 워크스페이스 열람 권한까지 봐야 하는지 소유자 확인',
    },
    {
      id: 'Q5-public-execute-on-mutating-rpc',
      fact: 'set_program_staffing·set_ma_program_staffing·set_application_form·network_entity_metrics의 EXECUTE가 PUBLIC에 부여되어 anon도 호출할 수 있습니다.',
      impact: '네 함수 모두 본문 첫머리에서 자체 인가(app.is_admin / can_write_workspace / can_access_program)를 확인하므로 즉시 새는 자리는 아닙니다. 다만 부여 근거가 없습니다.',
      options: ['EXECUTE를 authenticated로 좁히고 PUBLIC에서 회수(별도 마이그레이션).'],
      needs: '부모 판단 — 이번 범위(표 ACL)에 포함할지',
    },
    {
      id: 'Q7-service-role-non-row-privileges',
      fact: 'service_role도 159개 표 전부에 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN을 갖고 있습니다(기본 권한의 잔여).',
      impact: 'service_role은 서버 신뢰 역할이라 anon·authenticated만큼 급하지 않지만, TRUNCATE는 여기서도 정책을 거치지 않고 표를 비웁니다.',
      options: ['A. 이번 회수 대상은 anon·authenticated로 한정(지시 그대로).', 'B. service_role까지 함께 회수 — 별도 판단.'],
      needs: '부모 판단. 기본 제안은 A입니다.',
    },
    {
      id: 'Q6-vestigial-delete-policies',
      fact: 'fund_managers·fund_purposes·investment_purposes·program_module_assignees·startup_managers에 DELETE 정책이 있으나 클라이언트 물리 삭제 호출 증거가 없습니다.',
      impact: '권한을 주지 않으므로 지금은 닫혀 있습니다. 정책 쪽이 남아 있는 이유(원자 교체 RPC의 흔적)를 확인해야 합니다.',
      needs: '정책 정리 여부는 별도 과제 — 이번에는 DELETE를 주지 않는 것으로 닫습니다.',
    },
  ],
  out_of_scope: {
    routines:
      'app.* RLS 헬퍼와 클라이언트 RPC의 EXECUTE는 **건드리지 않습니다**. 클라이언트가 부르는 RPC 79개는 ' +
      '모두 authenticated EXECUTE가 있고, 정책이 경유하는 app.* 헬퍼도 그대로 둡니다. 좁힐 후보는 Q5뿐입니다.',
    storage:
      'storage 스키마는 storage 서비스가 소유하며 이 저장소의 마이그레이션이 만든 ACL이 아닙니다. ' +
      'storage.objects의 경계는 RLS 정책 14건이 정하고 DELETE 정책은 한 건도 없습니다. ' +
      'storage.buckets에는 정책이 없어 기본 거부입니다. 버킷 8개 중 공개는 3개입니다 ' +
      '(approval-form-assets, meeting-room-photos, program-posters). 이번 범위 밖이며 사실만 기록합니다.',
    sequences: 'public 스키마에 시퀀스가 없습니다(0개). 모든 PK가 uuid라 시퀀스 ACL은 대상이 아닙니다.',
    views:
      'public 뷰 2개(portable_assets·trade_partners_directory)는 security_invoker=false입니다. ' +
      'Q4로 올립니다 — 권한 변경이 아니라 설계 확인 항목입니다.',
  },
  by_class: Object.fromEntries(
    ['policy-backed-client-dml', 'read-only', 'lookup', 'server-only-protected', 'legacy-unused', 'unresolved']
      .map((c) => [c, by(c)]),
  ),
  decisions,
}

fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log('[decisions] 기록: supabase/security/acl-decisions.json')
console.log(JSON.stringify(doc.counts, null, 2))
