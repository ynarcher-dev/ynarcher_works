-- =====================================================================
-- 제안 단계 재정의: 선정(SELECTED) 상태 추가
-- 제안 단계 상태 3분류: 시도(PROPOSED) · 선정(SELECTED) · 미선정(NOT_SELECTED)
-- 프로젝트 수명주기(개정):
--   시도(PROPOSED) → (선정) 선정(SELECTED) → 운영: 준비(DRAFT) → 진행중(OPERATING) → 종료(FINISHED)
--                  ↘ (미선정) 미선정(NOT_SELECTED)  … 프로젝트 종료(terminal)
--                                     준비/진행중 → (중단) 취소(CANCELLED)
-- 라벨 매핑(프론트 config.ts): PROPOSED=시도, SELECTED=선정, NOT_SELECTED=미선정,
--   DRAFT=준비, OPERATING=진행중, FINISHED=종료, CANCELLED=취소.
-- 선정 시 운영 단계(준비)로 즉시 자동 전환되므로 SELECTED는 대부분 경유 상태이나,
--   레거시·전환 경계 데이터 표시를 위해 enum 값으로 보존한다.
-- 멱등: add value if not exists 로 재적용 안전.
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블/RPC/Storage/SECURITY DEFINER/정책 변경 없음. enum 값 1개 추가만.
--   - RLS·권한 경계·감사 로그 영향 없음. 개인정보/다운로드/Export 영향 없음.
-- 참고: 새 enum 값은 같은 트랜잭션 내에서 사용하지 않으므로(값 추가만) 안전하다(PG12+).
-- =====================================================================

alter type public.program_status add value if not exists 'SELECTED' after 'PROPOSED';
