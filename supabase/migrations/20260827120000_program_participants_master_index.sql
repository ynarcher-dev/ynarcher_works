-- =====================================================================
-- 참가자 원장 역참조 인덱스(master_id) — 기업 상세의 '참여 사업/M&A/프로젝트'
--
-- 목적: 스타트업 상세가 "이 기업이 지금 어느 사업에 걸려 있는가"를 되묻는다. 지금까지
--   참가자 원장은 사업 쪽에서만 읽혀 program_id 인덱스 하나로 충분했지만, 기업 상세는
--   반대 방향(master_id → 사업)으로 들어오므로 그 열에 인덱스가 필요하다.
--
-- master_id는 FK가 아니라 NETWORKS 마스터(startups/experts)를 가리키는 soft ref다.
--   FK가 없으니 인덱스도 자동으로 서지 않아, 이 열의 조회는 전량 순차 스캔이었다.
--
-- 부분 인덱스(where master_id is not null)인 이유: 참가자 행의 다수는 마스터가 아니라
--   계정(user_id)으로만 잡히는 내부 인원·게스트다. null 행까지 담으면 인덱스가 원장 전체
--   크기로 자라면서 정작 찾는 마스터 행의 밀도는 떨어진다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 대상 아님: 새 테이블·뷰·정책·함수·Storage 없음. 인덱스 3개 추가가 전부이며
--     기존 RLS(program_participants 등 = can_read_workspace(ws) + can_access_ws_program)를
--     건드리지 않는다. 인덱스는 가시성을 넓히지 않는다 — 못 보던 행이 보이게 되지 않는다.
--   · 운영 영향: 기존 프론트 쿼리(사업 상세의 참가자 풀)는 program_id 인덱스를 계속 쓴다.
-- =====================================================================

create index if not exists idx_program_participants_master
  on public.program_participants (master_id)
  where master_id is not null;

create index if not exists idx_ma_program_participants_master
  on public.ma_program_participants (master_id)
  where master_id is not null;

create index if not exists idx_project_program_participants_master
  on public.project_program_participants (master_id)
  where master_id is not null;
