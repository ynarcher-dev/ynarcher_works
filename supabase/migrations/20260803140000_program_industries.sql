-- =====================================================================
-- 사업(Program) 산업 태그 — programs / ma_programs / project_programs 3종에 industries 추가
--
-- 왜 필요한가
--   사업 목록은 "누가 언제 무엇을 하는가"까지만 답하고, "이 사업이 어느 산업군의 스타트업을
--   발굴·대상으로 하는가"에는 답하지 못했다. 스타트업 원장은 이미 같은 질문을 산업 태그
--   (startups.industries)로 답하고 있으므로, 사업 쪽도 같은 태그 원장(industry_tags)을 읽는
--   같은 모양의 배열 컬럼으로 둔다 — 두 원장이 다른 어휘를 쓰면 "이 사업이 발굴한 기업의 산업"과
--   "이 사업이 노리는 산업"을 나란히 놓을 수 없다.
--
-- 왜 3종 모두인가
--   AC·M&A·PROJECT는 화면(features/program)을 통째로 공유하고 조회 select 문자열도 한 곳에서
--   조립한다. 한 원장에만 컬럼을 두면 나머지 두 워크스페이스의 목록 조회가 통째로 깨진다.
--   워크스페이스별 차이는 config 주입으로만 표현한다는 규칙(CLAUDE.md)과 같은 이유다.
--
-- 형태(jsonb 배열)를 startups.industries와 같게 맞춘 이유
--   업로드(kind: 'tags')·폼(TagChip 다중선택)·목록 표기가 이미 그 형태를 다루는 코드를 갖고 있다.
--   여기서만 text[]로 두면 같은 값을 두 벌의 코드로 읽어야 한다.
--   대표값 미러(startups.industry)는 두지 않는다 — 사업에는 단일 산업을 읽는 레거시 소비자가 없다.
--
-- 소유 워크스페이스: AC · M&A · PROJECT · 데이터 등급: Internal
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음. 기존 원장에 컬럼 1개 추가.
--   - RLS는 행 단위 판정이라 컬럼 추가로 새로 열리는 접근 경로가 없다(정책 무변경).
--   - 개인정보 아님(태그명 문자열 배열). 마스킹·다운로드 정책 영향 없음.
--   - not null default '[]' 이므로 기존 행 백필이 필요 없고, 값 유실도 없다.
-- 근거: 20260710220000_startups_industries.sql(같은 형태의 선례),
--       20260706120000_industry_tags.sql(태그 원장), CLAUDE.md(사업 공용 모듈 규칙)
-- =====================================================================

alter table public.programs
  add column if not exists industries jsonb not null default '[]'::jsonb;

alter table public.ma_programs
  add column if not exists industries jsonb not null default '[]'::jsonb;

alter table public.project_programs
  add column if not exists industries jsonb not null default '[]'::jsonb;

comment on column public.programs.industries is
  '산업 태그(industry_tags) 다중 선택 배열(최대 3개). 이 사업이 발굴·대상으로 하는 산업군.';
comment on column public.ma_programs.industries is
  '산업 태그(industry_tags) 다중 선택 배열(최대 3개). 이 딜이 대상으로 하는 산업군.';
comment on column public.project_programs.industries is
  '산업 태그(industry_tags) 다중 선택 배열(최대 3개). 이 프로젝트가 대상으로 하는 산업군.';
