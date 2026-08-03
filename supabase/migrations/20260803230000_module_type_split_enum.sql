-- =====================================================================
-- [사업 모듈] 커스텀 활동 → 글쓰기·URL첨부·파일첨부 3종 분리 (1/2: enum)
-- 후속: 20260803230100_program_module_content.sql
--
-- 배경: '커스텀 활동' 하나가 "정형 템플릿에 속하지 않는 모든 것"을 받아 내느라
--   운영 중 실제로 벌어지는 세 가지 다른 일(글을 남긴다 / 링크를 모아 둔다 /
--   파일을 나눠 준다)이 한 화면에 섞여 있었다. 셋은 저장 대상도 진입 동선도 다르므로
--   템플릿을 셋으로 가른다.
--     POST 글쓰기   — 본문(리치텍스트) 글 N건. 카드 클릭 시 전체 화면 탭으로 진입.
--     LINK URL첨부  — URL + 설명 N건. 카드 클릭 시 링크 버튼 모달.
--     FILE 파일첨부 — 파일 N건(다운로드·뷰어). 카드 클릭 시 파일 모달.
--
-- 본 파일이 enum 값 추가만 담당하는 이유: PostgreSQL은 같은 트랜잭션에서 방금 추가한
--   enum 값을 사용할 수 없다(ALTER TYPE ... ADD VALUE 직후 해당 값 참조 시 오류).
--   Supabase CLI는 마이그레이션 파일 단위로 트랜잭션을 열므로, 값 추가와 그 값을 쓰는
--   데이터 이관을 반드시 다른 파일로 갈라야 한다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project 공용(사업 모듈 템플릿 정의)
--   - 데이터 등급: Internal (enum 타입 정의. 데이터 없음)
--   - 접근 주체: 변경 없음
--   - Scope 기준: 변경 없음
--   - 감사 로그: 해당 없음(개인정보·다운로드·Export·권한 변경 경로 없음)
--   - 운영 영향: 값 추가만 하므로 기존 행·정책·프론트 쿼리에 영향 없음
--   - 신규 테이블/RPC/Storage 정책/SECURITY DEFINER 함수 없음 → RLS 체크리스트 비대상
-- 근거: 20260705150000_ac_enums.sql, 20260716160000_program_module_instances.sql
-- =====================================================================

alter type public.module_type add value if not exists 'POST';
alter type public.module_type add value if not exists 'LINK';
alter type public.module_type add value if not exists 'FILE';

comment on type public.module_type is
  '사업 모듈 템플릿. 기본 3종(POST 글쓰기 / LINK URL첨부 / FILE 파일첨부) + 운영 7종.
   CUSTOM_ACTIVITY는 2026-08-03 POST로 이관된 구 값으로, 신규 등록에는 쓰지 않는다';
