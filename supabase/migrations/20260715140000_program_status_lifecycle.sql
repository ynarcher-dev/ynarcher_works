-- =====================================================================
-- [Phase 7] program_status 수명주기 확장: 제안(PROPOSED) · 미선정(NOT_SELECTED) 추가
-- 프로젝트 수명주기:
--   제안(PROPOSED) → (성공) 준비(DRAFT) → 진행중(OPERATING) → 종료(FINISHED)
--                  ↘ (제안 실패) 미선정(NOT_SELECTED)
--                                   준비/진행중 → (중단) 취소(CANCELLED)
-- 라벨 매핑(프론트 config.ts): PROPOSED=제안, DRAFT=준비, OPERATING=진행중,
--   FINISHED=종료, CANCELLED=취소, NOT_SELECTED=미선정.
-- 멱등: add value if not exists 로 재적용 안전.
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블/RPC/Storage/SECURITY DEFINER/정책 변경 없음. enum 값 2개 추가만.
--   - RLS·권한 경계·감사 로그 영향 없음. 개인정보/다운로드/Export 영향 없음.
-- 참고: 새 enum 값은 같은 트랜잭션 내에서 사용하지 않으므로(값 추가만) 안전하다(PG12+).
-- =====================================================================

alter type public.program_status add value if not exists 'PROPOSED' before 'DRAFT';
alter type public.program_status add value if not exists 'NOT_SELECTED';
