# 문서 지도 (DOCUMENTATION_MAP.md)

`docs/` 하위의 모든 마크다운 문서를 한 표에 모으고, 각 문서를 **어느 정도 믿고 쓸 수 있는지**로 분류합니다. **이 지도가 문서 목록의 정본입니다.** 기준은 `main` / `846dfb83` **+ 현재 작업 트리(미커밋)**(2026-09-12)이며, 분류는 같은 날짜의 **정적 비교·작성 결과**입니다.

> [!IMPORTANT]
> **상세 문서가 있다는 사실만으로 정본이 되거나 사용자 승인을 증명하지는 않습니다.** 분류는 각 문서의 역할·경로·마스터 문서와의 관계를 근거로 매긴 것이며, **모든 문서의 본문 전체와 대응 코드를 감사하지는 않았고, 문서 내부 링크의 유효성도 일괄 검증하지 않았습니다.** 이 지도는 **런타임을 검증하지 않습니다** — 실제 실행·테스트 결과는 [CURRENT_STATUS.md](./CURRENT_STATUS.md)가 소유합니다.
> 문서와 코드가 다르면 코드는 현재 동작의 **사실 근거**로, 문서는 **정책 참조**로 읽습니다. 정책 참조의 승인 여부와 현행성은 그때마다 별도로 확인해야 하며, **문서에 적혀 있다는 이유로 안전하지 않은 동작이 자동으로 정당화되지는 않습니다.** 불일치와 미해결 판단은 `CURRENT_STATUS.md`에 남깁니다. 이번 정리에서 문서를 삭제하거나 이동하지 않았습니다.

## 분류 기준

| 분류 | 뜻 |
| :--- | :--- |
| `구현` | 현재 코드/스키마에서 확인되는 사실을 적은 문서 |
| `정책문서` | 규범으로 참조하는 규칙·결정 문서. **승인 여부와 현행성은 별도 확인이 필요합니다** — 문서 존재 자체가 승인이나 현재 유효성의 증거는 아닙니다 |
| `검증대기` | 내용이 상세하나 현재 구현과의 일치를 확인하지 않음. 인용 시 코드 대조 필요 |
| `갱신필요` | 내용 또는 링크에 확인된 오류가 있어 고쳐야 하는 문서. 그대로 인용하지 말 것 |
| `초안참고` | 아이디어·제안·구버전 기획. 확정 아님 |
| `이력` | 과거 기록 보존용. 실행 규칙이 아니며 현재 범위를 덮어쓰지 못함 |

---

## 1. 마스터·운영 문서

| 문서 | 분류 | 근거·비고 |
| :--- | :--- | :--- |
| [DOCUMENTATION_MAP.md](./DOCUMENTATION_MAP.md) | `정책문서` | 본 문서. **문서 목록·분류의 정본**이며 신뢰 상태의 단일 출처 |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | `구현` | 구현 범위의 기준. **실제 실행·테스트 결과는 이 문서가 소유** |
| [OPERATIONS.md](./OPERATIONS.md) | `정책문서` | 실행·배포·DB 운영 절차(2026-09-12 기준) |
| [MASTER_PLAN.md](./MASTER_PLAN.md) | `정책문서` | **계획·백로그의 참조 정본**(2026-09-12). 네 층을 구분해 읽습니다 — ① **구현·로컬 검증이 끝난 부분**(1차 안정화: 배포 게이트 코드·함수 정적 검사·GUEST 러너·인증 경계 테스트·DB 회귀 러너·정화기 회귀, 발송 경로의 거짓 성공 제거), ② **현재 상태·수치**는 [CURRENT_STATUS.md](./CURRENT_STATUS.md)가 소유, ③ **§7.2의 승인된 작업 순서** — 그 표에 오른 것은 착수가 승인되어 있고 순번 사이에 다시 묻는 관문이 없습니다, ④ **그 표에 없는 후속 항목** — 문서에 있다는 이유로 **자동 착수 대상이 되지 않습니다**(§7.1의 시기 구분도 권고이며 승인이 아님) |
| [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) | `구현`(사실) + `검증대기`(추론·잔여) | 2026-09-12. **소스 표본 점검**에 **덮인 범위의 로컬 실행 증거**(단위 테스트·SQL 회귀)를 더해 상태를 적습니다. 각 항목의 "사실"은 코드·실행에서 온 것이고 "조건·영향"은 추론이며, **전수 감사도 운영 환경 점검도 아닙니다** — 내용은 해당 문서가 소유 |
| [docs_master/CLAUDE.md](./docs_master/CLAUDE.md) | `정책문서` | 작업 규칙 정본(2026-09-12 재작성). **작업 한 벌의 순서**(기능 구현 → 권한·실패 경로 점검 → 문서 갱신 → Codex 검토)도 이 문서가 소유하며, 다른 문서는 링크만 둡니다 |
| [docs_master/CLAUDE_HISTORY_2026-09-12.md](./docs_master/CLAUDE_HISTORY_2026-09-12.md) | `이력` | **비실행 원본 보존본.** 구 마스터 규칙 전문. 세부 정책은 코드/승인 대조 전까지 유효하지 않음 |
| [docs_master/PROGRESS.md](./docs_master/PROGRESS.md) | `이력` | 과거 체크리스트. 작업 자동 선정 금지 배너 추가 |
| [docs_master/readme_master.md](./docs_master/readme_master.md) | `검증대기` | 서비스 비전·워크스페이스 정의. AC/PROJECT 개명 반영 여부 미확인 |
| [docs_master/0_service_spec_draft.md](./docs_master/0_service_spec_draft.md) | `초안참고` | 구 문서 인덱스. 정본은 본 지도이며 이 문서는 참고·병합 대상 |

---

## 2. 개발 문서 (`docs_dev`)

| 문서 | 분류 | 근거·비고 |
| :--- | :--- | :--- |
| [readme_dev.md](./docs_dev/readme_dev.md) | `검증대기` | 폴더 인덱스. 본 지도와 중복되므로 병합 후보 |
| [1_development_stack.md](./docs_dev/1_development_stack.md) | `정책문서` | 스택·코드 규약의 상세 원칙. 마스터 규칙이 직접 참조 |
| [2_auth_permissions_architecture.md](./docs_dev/2_auth_permissions_architecture.md) | `검증대기` | 인증·권한 구조. 게스트 계정 통합(2026-09-05/08) 반영 여부 미확인 |
| [3_database_rls_policy_matrix.md](./docs_dev/3_database_rls_policy_matrix.md) | `갱신필요` | RLS 정책 표. **2026-09-12 소스 대조에서 확인된 오류** — §4 매트릭스는 원장 통합(2026-09-03/04) 이전 판이라 이름 든 표 상당수가 현재 호출부에 없고, 다루는 범위도 약 30개인데 실제 접촉면은 103개입니다. **ACL·권한 판단의 근거로 인용하지 마십시오** — 현재 인벤토리는 [15_authorization_inventory.md](./docs_dev/15_authorization_inventory.md)가 가집니다(근거: [CURRENT_STATUS.md](./CURRENT_STATUS.md) §3.1, [MASTER_PLAN.md](./MASTER_PLAN.md) `AUTHZ-1`) |
| [4_security_privacy_policy.md](./docs_dev/4_security_privacy_policy.md) | `정책문서` | 보안·개인정보 정책. `SECURITY_REVIEW.md`와 교차 확인 권장 |
| [5_backup_retention_privacy.md](./docs_dev/5_backup_retention_privacy.md) | `정책문서` | 백업·보존 기간 정책 |
| [6_api_contracts.md](./docs_dev/6_api_contracts.md) | `검증대기` | RPC/Edge Function 계약. 최근 기능 추가분 반영 여부 미확인 |
| [7_database_design_guidelines.md](./docs_dev/7_database_design_guidelines.md) | `정책문서` | 스키마 설계 규칙(명명·소프트 삭제·감사 컬럼 등) |
| [8_git_branch_commit_convention.md](./docs_dev/8_git_branch_commit_convention.md) | `정책문서` | 커밋 컨벤션 상세. 마스터 6장과 일치해야 함 |
| [9_database_physical_schema.md](./docs_dev/9_database_physical_schema.md) | `검증대기` | 물리 스키마 문서. `supabase/migrations` 최신분과 대조 필요 |
| [10_deployment_cicd_guide.md](./docs_dev/10_deployment_cicd_guide.md) | `검증대기` | 배포·CI/CD. `OPERATIONS.md`와 중복 영역이 있어 우선순위 정리 필요 |
| [11_migration_security_gate.md](./docs_dev/11_migration_security_gate.md) | `정책문서` | 마이그레이션 보안 게이트. 완료 판정 조건으로 유효 |
| [12_database_baseline_operations.md](./docs_dev/12_database_baseline_operations.md) | `정책문서` + `구현`(§0) | `pnpm db:baseline:*`의 **절차와 한계**(그 통과가 보증하지 않는 것 포함)의 정본. **값은 `supabase/baseline/manifest.json`**, **실행 결과는 [CURRENT_STATUS.md](./CURRENT_STATUS.md) §3**이 각각 가집니다 |
| [12_immediate_security_stabilization_tasks.md](./docs_dev/12_immediate_security_stabilization_tasks.md) | `이력` | 특정 시점 과제 목록(번호 12가 위 문서와 겹침). 현재 보안 과제는 `SECURITY_REVIEW.md`를 봄 |
| [13_future_development_guardrails.md](./docs_dev/13_future_development_guardrails.md) | `검증대기` | 구 가드레일 문서. **작업 순서·가드레일의 정본은 [docs_master/CLAUDE.md](./docs_master/CLAUDE.md)**이며, 이 문서의 세부는 **일부가 낡았거나 확인되지 않았습니다**(전체가 검증되었다는 뜻이 아님). 인용 전 정본과 대조할 것 |
| [14_stabilization_refactoring_day_checklist.md](./docs_dev/14_stabilization_refactoring_day_checklist.md) | `이력` | 특정 일자 리팩터링 체크리스트 |
| [15_authorization_inventory.md](./docs_dev/15_authorization_inventory.md) | `구현` | `AUTHZ-1`/`AUTHZ-2`의 권한 인벤토리 진입점(2026-09-12). 표 단위 결정·수치는 본문이 아니라 `supabase/security/`의 산출물이 소유합니다. **격리된 신규 DB 재생 기준이며 운영 DB 조회가 아니고, 역할×워크스페이스 전역 감사도 아닙니다** |

---

## 3. 디자인 문서 (`docs_design`)

| 문서 | 분류 | 근거·비고 |
| :--- | :--- | :--- |
| [readme_design.md](./docs_design/readme_design.md) | `검증대기` | 폴더 인덱스. 본 지도와 중복되므로 병합 후보 |
| [1_ui_ux_mobile.md](./docs_design/1_ui_ux_mobile.md) | `검증대기` | 모바일 UI/UX 원칙. GUEST 현재 화면과 대조 필요 |
| [2_app_layout_navigation.md](./docs_design/2_app_layout_navigation.md) | `검증대기` | 레이아웃·내비게이션. PROJECT 개명·경로 정리 반영 여부 미확인 |
| [3_typography_rules.md](./docs_design/3_typography_rules.md) | `정책문서` | 글자 위계 규칙. 값 SSOT는 `tailwind-preset.mjs`/`densityScale.ts` |
| [4_color_system_rules.md](./docs_design/4_color_system_rules.md) | `정책문서` | 컬러 시스템(쿨 슬레이트 + 브랜드 인디고) |
| [5_component_spec_rules.md](./docs_design/5_component_spec_rules.md) | `정책문서` | 컴포넌트 스펙 규칙 |
| [6_motion_transition_rules.md](./docs_design/6_motion_transition_rules.md) | `정책문서` | 모션·전환 규칙 |
| [7_chart_visualization_rules.md](./docs_design/7_chart_visualization_rules.md) | `정책문서` | 차트 시각화 규칙(recharts 사용 확인) |
| [8_z_index_system_rules.md](./docs_design/8_z_index_system_rules.md) | `정책문서` | z-index 체계 |
| [9_feedback_notification_rules.md](./docs_design/9_feedback_notification_rules.md) | `정책문서` | 피드백·알림 표현 규칙 |
| [10_icon_implementation_rules.md](./docs_design/10_icon_implementation_rules.md) | `정책문서` | 아이콘 규칙(lucide-react 사용 확인) |
| [design_system_compliance_audit.md](./docs_design/design_system_compliance_audit.md) | `이력` | 특정 시점 준수 감사 결과. 현재 코드 상태와 다를 수 있음 |

---

## 4. 기획 문서 (`docs_planning`)

| 문서 | 분류 | 근거·비고 |
| :--- | :--- | :--- |
| [readme_planning.md](./docs_planning/readme_planning.md) | `갱신필요` | 폴더 인덱스. **상대 경로 링크가 깨진 항목이 확인됨** — 링크를 고치기 전까지 목록을 그대로 따라가지 말 것. 다른 문서의 링크 유효성은 일괄 검증하지 않음 |
| [0_as_built_reverse_spec.md](./docs_planning/0_as_built_reverse_spec.md) | `구현` | 구현 역설계 명세(2026-09-12 기준). 시점 문서로 읽을 것 |
| [1_roles_permissions.md](./docs_planning/1_roles_permissions.md) | `갱신필요` | 역할·권한 정의. **2026-09-12 소스 대조에서 확인된 오류 셋** — §1.1 역할 목록이 enum 11종과 어긋나고(`read_only` 누락), §2.1이 `AC`/`PROJECT`를 살아 있는 둘로 두며(개명 완료됨), §3의 게스트 `3요소+OTP` 로그인 기술은 **폐기**되었습니다. 로그인 정책 정본은 [3_9_1 §6](./docs_planning/3_9_1_guest_unified_account.md)이며 **그쪽으로 되돌리는 제안은 올리지 않습니다** |
| [2_business_scenarios.md](./docs_planning/2_business_scenarios.md) | `검증대기` | 업무 시나리오 |
| [3_0_workspace_overview.md](./docs_planning/3_0_workspace_overview.md) | `검증대기` | 워크스페이스 전체 개요·우선순위. PROJECT 폐지/개명 이력과 충돌 가능 |
| [3_1_workspace_hub.md](./docs_planning/3_1_workspace_hub.md) | `검증대기` | 파일명은 HUB이나 실제 대응은 OFFICE(링크 연속성 목적 유지) |
| [3_1_1_board_archive_notice.md](./docs_planning/3_1_1_board_archive_notice.md) | `검증대기` | 게시판·아카이브·공지. `features/hub` 구현과 대조 필요 |
| [3_1_2_office_asset_checkout.md](./docs_planning/3_1_2_office_asset_checkout.md) | `검증대기` | 사내 자산 대여 |
| [3_1_3_approval_return_flow.md](./docs_planning/3_1_3_approval_return_flow.md) | `검증대기` | 결재 반려·보완 흐름. 2026-09-10/11 결정으로 일부 대체됨 |
| [3_1_4_approval_budget_expense.md](./docs_planning/3_1_4_approval_budget_expense.md) | `검증대기` | 예산·경비 결재 |
| [3_2_workspace_admin.md](./docs_planning/3_2_workspace_admin.md) | `검증대기` | ADMIN 워크스페이스 |
| [3_2_1_admin_module_registry.md](./docs_planning/3_2_1_admin_module_registry.md) | `검증대기` | 모듈 템플릿 카탈로그. 템플릿 4종 축소(2026-09-03) 반영 여부 확인 필요 |
| [3_3_workspace_networks.md](./docs_planning/3_3_workspace_networks.md) | `검증대기` | NETWORKS 워크스페이스 |
| [3_3_1_startup_pool_classification.md](./docs_planning/3_3_1_startup_pool_classification.md) | `검증대기` | 스타트업 구분 체계 |
| [3_3_2_networks_dashboard.md](./docs_planning/3_3_2_networks_dashboard.md) | `검증대기` | NETWORKS 대시보드 |
| [3_3_3_startup_menu_stat_cards.md](./docs_planning/3_3_3_startup_menu_stat_cards.md) | `검증대기` | 목록 상단 요약 카드 |
| [3_3_4_networks_unified_ledger.md](./docs_planning/3_3_4_networks_unified_ledger.md) | `검증대기` | 네트워크 원장 통합(`public.networks`) |
| [3_3_5_startup_ai_fill.md](./docs_planning/3_3_5_startup_ai_fill.md) | `검증대기` | AI 작성하기. 2026-09-06~09 다회 재설계로 변동 큼 |
| [3_3_7_ai_fill_visual_read.md](./docs_planning/3_3_7_ai_fill_visual_read.md) | `검증대기` | AI 시각 판독. `3_3_6` 결번 |
| [3_3_8_ledger_identity_dedup.md](./docs_planning/3_3_8_ledger_identity_dedup.md) | `정책문서` | 원장 중복 판정 2층 구조(2026-09-11 사용자 확정) |
| [3_4_workspace_ac.md](./docs_planning/3_4_workspace_ac.md) | `검증대기` | 사업 워크스페이스 정본. 현재 구현 이름은 PROJECT |
| [3_4_1_ac_dashboard.md](./docs_planning/3_4_1_ac_dashboard.md) | `검증대기` | 사업 대시보드 |
| [3_4_2_ac_program_overview.md](./docs_planning/3_4_2_ac_program_overview.md) | `검증대기` | 사업 개요 |
| [3_4_3_ac_recruitment.md](./docs_planning/3_4_3_ac_recruitment.md) | `검증대기` | 모집 모듈(잔존 4종 중 하나) |
| [3_4_4_ac_participant_pool.md](./docs_planning/3_4_4_ac_participant_pool.md) | `검증대기` | 참가자 명부. 명부 역할 제거(2026-09-05) 반영 확인 필요 |
| [3_4_12_ac_program_timeline.md](./docs_planning/3_4_12_ac_program_timeline.md) | `검증대기` | 사업 타임라인. `3_4_5`~`3_4_11` 결번 |
| [3_4_14_ac_custom_activities.md](./docs_planning/3_4_14_ac_custom_activities.md) | `초안참고` | 커스텀 활동. 모듈 7종 철회(2026-09-03)와 겹치는 영역 |
| [3_4_15_ac_public_links.md](./docs_planning/3_4_15_ac_public_links.md) | `검증대기` | 공개 링크. GUEST `PublicModulePage` 구현 존재 |
| [3_5_workspace_fund.md](./docs_planning/3_5_workspace_fund.md) | `검증대기` | FUND 워크스페이스 |
| [3_6_workspace_ma.md](./docs_planning/3_6_workspace_ma.md) | `검증대기` | M&A/PE 워크스페이스 |
| [3_6_1_ma_seller_quick_review.md](./docs_planning/3_6_1_ma_seller_quick_review.md) | `검증대기` | 셀러 퀵 리뷰(AI 재사용 두 번째 사례) |
| [3_7_workspace_management.md](./docs_planning/3_7_workspace_management.md) | `검증대기` | MANAGEMENT 워크스페이스 |
| [3_7_1_management_performance_kpi.md](./docs_planning/3_7_1_management_performance_kpi.md) | `검증대기` | KPI. 조직 원장 1:1 결정(2026-09-10) 반영 확인 필요 |
| [3_7_2_management_assets.md](./docs_planning/3_7_2_management_assets.md) | `검증대기` | 자산 관리 |
| [3_7_3_management_attendance.md](./docs_planning/3_7_3_management_attendance.md) | `검증대기` | 근태 관리 |
| [3_7_4_management_partners.md](./docs_planning/3_7_4_management_partners.md) | `검증대기` | 협력사 관리 |
| [3_9_workspace_guest.md](./docs_planning/3_9_workspace_guest.md) | `검증대기` | GUEST 앱. `3_8` 번호에 해당하는 파일은 없음 |
| [3_9_1_guest_unified_account.md](./docs_planning/3_9_1_guest_unified_account.md) | `정책문서` | 게스트 통합 계정(계정·문·열쇠 3축, 2026-09-05). **§6은 게스트 로그인·계정 개시 정책의 정본(2026-09-12 사용자 확정)** — 이메일 아이디 + 개인 비밀번호, 설정 전에만 유효한 초기 연락처, 자격증명의 오프라인 취급. 다른 문서는 인용만 하며 **초대 토큰 강제 전환·초기 로그인 차단으로 대체하는 제안을 다시 올리지 않습니다** |
| [3_9_2_external_portal_expansion.md](./docs_planning/3_9_2_external_portal_expansion.md) | `정책문서` | 외부 포털 확장(AC·FUND·M&A 3맥락, 2026-09-08) |

---

## 5. 기타 문서 (`docs_etc`)

| 문서 | 분류 | 근거·비고 |
| :--- | :--- | :--- |
| [readme_etc.md](./docs_etc/readme_etc.md) | `검증대기` | 폴더 인덱스. 본 지도와 중복되므로 병합 후보 |
| [gemini_matching_ac_planning_rework_guide.md](./docs_etc/gemini_matching_ac_planning_rework_guide.md) | `초안참고` | 외부 도구 기반 기획 재작업 가이드. 확정 결정 아님 |
| [gemini_security_docs_master_guide.md](./docs_etc/gemini_security_docs_master_guide.md) | `초안참고` | 보안 문서 작성 가이드 제안 |
| [google_workspace_integration_ideation.md](./docs_etc/google_workspace_integration_ideation.md) | `초안참고` | 연동 아이디어. 미승인 |

---

## 6. 현재 구현에서 확인한 사실

* WORKS 라우트에 `office`·`my-office`·`startup`·`networks`·`project`·`fund`·`mna`(`buyers`/`sellers`)·`management`·`approval`·`admin`·`styleguide`·`me`가 존재하고, 구 `ac` 경로는 리다이렉트로 살아 있습니다(`apps/works/src/router.tsx`).
* GUEST에는 개요·공지·일정·Q&A·지원·모듈(글/링크/파일)·마이페이지·공개 모듈 화면이 있습니다(`apps/guest/src/pages`).
* 검증 스크립트는 루트 `lint`/`typecheck`/`typecheck:functions`/`test`/`test:db`/`build`이며, 앱 개별 `lint`는 여전히 자리표시자입니다. `apps/guest`에도 `test` 스크립트가 생겨 루트 `pnpm test`가 WORKS·GUEST를 함께 돕니다(`package.json`). 실행 결과 수치는 [CURRENT_STATUS.md](./CURRENT_STATUS.md) §3이 소유합니다.

## 7. 처리 방향

다음은 문서를 **어떻게 다룰지**에 대한 실무 방침입니다. 이번 정리에서 개명·삭제·이동은 하지 않았습니다. 파일명·번호 정리는 앞으로 일상적인 정리 작업으로 처리하며, 별도의 승인 관문을 두지 않습니다.

| 묶음 | 방향 | 내용 |
| :--- | :--- | :--- |
| 마스터·운영 현행 문서 | `유지` | 본 지도, `CURRENT_STATUS`, `OPERATIONS`, `docs_master/CLAUDE.md` — 현행 기준으로 계속 씀 |
| 상세 개발·디자인·기획 문서 | `갱신` | `검증대기` 항목은 확인된 범위부터 코드 대조 후 갱신. 표시는 "틀렸다"가 아니라 "확인하지 않았다"는 뜻 |
| 중복 인덱스·템플릿·사용법 | `병합` | `0_service_spec_draft.md`와 폴더별 `readme_*` — 목록 기능은 본 지도로 모으고 고유 내용만 남김 |
| `PROGRESS`·`CLAUDE_HISTORY`·구 과제 지시서 | `이력` | 보존하되 실행 규칙으로 쓰지 않음 |
| 아이디어·외부 도구 가이드 | `아이디어` | `docs_etc` 제안 문서 — 승인 전 제안으로만 취급 |

* **AC/PROJECT 이름 축**: 코드는 `features/project`이고 기획 문서는 `3_4_*_ac_*` 이름을 유지합니다. 파일명은 링크 연속성 때문에 그대로 두고, 본문에서 현재 이름이 `PROJECT`임을 밝히는 쪽으로 갱신합니다. 파일 번호와 결번은 구현 근거가 아니므로 상태 판단에 쓰지 않습니다.
* **링크 검증**: `docs_planning/readme_planning.md`의 깨진 링크는 `갱신필요`로 남아 있습니다. 나머지 문서의 상대 경로 링크는 일괄 검증하지 않았습니다.
* **인가 인벤토리 문서(등록 완료)**: `AUTHZ-1`이 정리하는 역할×기능·RPC·`service_role`·Storage는 [15_authorization_inventory.md](./docs_dev/15_authorization_inventory.md)가 소유하며 위 §2에 등록했습니다. `3_database_rls_policy_matrix.md`의 `갱신필요`는 **그대로 둡니다** — 새 문서가 인벤토리를 가져갔다고 해서 구 매트릭스가 고쳐진 것은 아니고, 대체·정리 여부는 보정의 리뷰 교정이 끝난 뒤에 판정합니다.
