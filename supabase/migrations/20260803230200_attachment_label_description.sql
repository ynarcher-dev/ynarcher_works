-- =====================================================================
-- [사업 모듈] 파일첨부에 표시명·설명 부여
-- 선행: 20260803230100_program_module_content.sql
--
-- 배경: 파일첨부 모듈이 파일명만 보여 주고 있었다. 파일명은 올린 사람의 사정(버전 표기·
--   부서 약어·한글 깨짐)을 그대로 달고 오므로 받는 사람에게 "이게 무엇인지"를 말해 주지
--   못한다. URL첨부가 표시명·설명을 갖는 것과 같은 이유로 파일에도 둘을 단다.
--
-- 원장을 따로 만들지 않고 attachments에 두 컬럼을 더하는 이유: 파일첨부 모듈의 파일은
--   사업 자료와 **같은 행**이다(20260803230100 §3). 표시명을 별도 원장에 두면 같은 파일이
--   두 화면에서 다른 이름으로 불리게 되고, 어느 쪽이 그 파일의 이름인지 답할 근거가 없다.
--   두 컬럼 모두 nullable이며 값이 없으면 기존처럼 파일명이 그 자리를 대신한다 —
--   NETWORKS·회의록 등 기존 첨부 화면은 값을 넣지 않으므로 표시가 달라지지 않는다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: 공용(attachments는 워크스페이스 무관 원장)
--   - 데이터 등급: Internal (파일의 표시용 메타. 개인정보 원본 아님)
--   - 접근 주체: 기존 attachments 정책을 그대로 따른다(내부 사용자, 게스트 default deny)
--   - Scope 기준: 변경 없음 — 컬럼 추가는 접근 경계를 건드리지 않는다
--   - 감사 로그: 해당 없음(다운로드 경로·권한 변경 없음)
--   - 운영 영향: nullable 컬럼 2개 추가만. 기존 행·정책·프론트 쿼리 무변경
--   - 신규 테이블/RPC/Storage 정책/SECURITY DEFINER 함수 없음 → RLS 체크리스트 비대상
--     (attachments의 SELECT/INSERT/UPDATE 정책은 20260723150000판을 그대로 유지한다)
-- =====================================================================

alter table public.attachments add column if not exists label       text;
alter table public.attachments add column if not exists description text;

comment on column public.attachments.label is
  '파일의 표시명. 비어 있으면 화면은 file_name을 대신 쓴다(파일명은 올린 사람의 사정을 달고 온다)';
comment on column public.attachments.description is
  '파일 설명(한 줄). 파일첨부 모듈·자료 관리 목록에서 표시명 아래에 노출한다';
