-- =====================================================================
-- 자료 분석 캐시에 "누가 뽑았는가"를 남긴다 (2026-09-09)
--
-- 배경: PDF 텍스트 레이어 추출이 **브라우저**로 간다(3_3_6 Phase 2). Edge Function은 요청당
-- CPU가 2초라 pdf.js가 수백 쪽을 훑지 못하고, 브라우저가 원장 파일의 바이트를 쥐는 순간은
-- 업로드 그때 하나다(2026-07-16에 직접 다운로드를 닫았다). 그래서 "저장되는 캐시는 언제나
-- 서버가 만든 값"이라는 종전 규칙이 풀린다.
--
-- **권한이 넓어지는 것은 아니다.** 이 행을 쓸 수 있는 사람은 그 레코드를 고칠 수 있는
-- 사람뿐이고(분석 함수가 `canWrite`를 되묻는다), 그 사람은 이미 폼 값을 직접 고치거나 조작된
-- 파일을 올릴 수 있다. 그래서 막아야 하는 것은 '조작된 글자'가 아니라 **다른 파일의 글자를
-- 이 행에 심는 것**이고, 그 하나는 서버가 스토리지 실물의 SHA-256을 다시 계산해 막는다.
--
-- 이 컬럼이 하는 일은 통제가 아니라 **판독**이다. 초안 품질이 나빠졌을 때 파서를 의심할지
-- 모델 OCR을 의심할지가 이 값으로 갈린다. 통제였다면 컬럼이 아니라 정책이어야 한다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 새 테이블: 없음 (기존 표에 컬럼 1개)
--   - RLS: 기존 정책 그대로 — 이 표의 SELECT/쓰기는 원본 첨부의 권한에 위임돼 있고
--     컬럼이 하나 늘어도 그 판정은 달라지지 않는다
--   - 새 RPC / SECURITY DEFINER 함수: 없음
--   - Storage 정책: 없음
--   - 개인정보: 없음 (값은 'server' | 'client' 두 문자열뿐)
--   - 운영 영향: 기존 행은 전부 'server'로 채워진다(그때는 그것이 사실이었다)
-- =====================================================================

alter table public.attachment_extracts
  add column if not exists extracted_by text not null default 'server';

-- 값을 둘로 잠근다. 자유 문자열로 두면 오타 하나가 조용히 새 부류를 만들고, 그러면 이 칸으로
-- 무엇을 의심할지 가르는 일 자체가 성립하지 않는다.
alter table public.attachment_extracts drop constraint if exists attachment_extracts_extracted_by_ck;

alter table public.attachment_extracts
  add constraint attachment_extracts_extracted_by_ck check (extracted_by in ('server', 'client'));

comment on column public.attachment_extracts.extracted_by is
  '이 글자를 뽑은 쪽. server=Edge Function(오피스·텍스트·링크·모델 OCR), client=브라우저 Worker(PDF 텍스트 레이어). 권한 축이 아니라 품질 판독용이며, 다른 파일의 글자가 심기는 것은 서버의 SHA-256 대조가 막는다.';
