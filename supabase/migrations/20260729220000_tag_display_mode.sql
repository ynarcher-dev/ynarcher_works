-- =====================================================================
-- [Phase 15] 직급·직책 태그 표기 방식(display_mode)
-- - 이름 옆 호칭('책임매니저' / '실장' / '이사/본부장')을 코드 상수가 아니라
--   태그 원장의 입력값으로 정한다. 새 직급·직책이 생겨도 코드 배포 없이 운영이 정한다.
-- - 값: DEFAULT(기본) / PRIORITY(이쪽만 표기) / PARALLEL(직급·직책 함께 표기)
--   판정 순서는 프론트 `features/management/jobTitle.ts`가 소유하며,
--   직급 PRIORITY > 직책 PRIORITY > 직급 PARALLEL > 직책 PARALLEL > 기본 순으로 본다
--   (둘 다 '우선'이면 직급이 이긴다).
-- 소유 워크스페이스: management(인사 기준정보) / 데이터 등급: Internal
-- 기존 RLS·정책 변경 없음(열 추가만) — rank_tags·position_tags는 이미
--   SELECT=내부 사용자 전체, INSERT/UPDATE=app.is_admin()으로 분리되어 있다.
-- 근거: 20260706140000_position_tags.sql / 20260706150000_rank_tags.sql
-- =====================================================================

alter table public.rank_tags
  add column if not exists display_mode text not null default 'DEFAULT';
alter table public.position_tags
  add column if not exists display_mode text not null default 'DEFAULT';

-- 값 집합은 DB가 강제한다 — 화면 셀렉트만 믿으면 임의 문자열이 들어와 호칭이 조용히 기본값으로
-- 떨어진다(오타가 화면에서 드러나지 않는 종류의 버그다).
alter table public.rank_tags drop constraint if exists rank_tags_display_mode_chk;
alter table public.rank_tags add constraint rank_tags_display_mode_chk
  check (display_mode in ('DEFAULT', 'PRIORITY', 'PARALLEL'));

alter table public.position_tags drop constraint if exists position_tags_display_mode_chk;
alter table public.position_tags add constraint position_tags_display_mode_chk
  check (display_mode in ('DEFAULT', 'PRIORITY', 'PARALLEL'));

comment on column public.rank_tags.display_mode is
  '이름 옆 호칭 표기 방식. PRIORITY=직급만(직책이 있어도 이긴다), PARALLEL=직급/직책 나란히, DEFAULT=직책 설정을 따른다.';
comment on column public.position_tags.display_mode is
  '이름 옆 호칭 표기 방식. PRIORITY=직책만, PARALLEL=직급을 앞에 붙여 한 단어로(책임매니저), DEFAULT=직책만.';

-- 지금 운영 중인 호칭을 그대로 유지하는 초기값 --------------------------------
-- 심사역·매니저는 그 자체로 위계가 없어 직급을 앞에 붙여 부른다(선임심사역·책임매니저).
update public.position_tags
   set display_mode = 'PARALLEL'
 where deleted_at is null
   and name in ('심사역', '매니저')
   and display_mode = 'DEFAULT';

-- 임원 직급은 맡은 직책과 나란히 적는다(이사/본부장). 원장에 없으면 아무 행도 바뀌지 않는다.
update public.rank_tags
   set display_mode = 'PARALLEL'
 where deleted_at is null
   and name in ('이사', '상무', '전무', '부사장', '사장')
   and display_mode = 'DEFAULT';
