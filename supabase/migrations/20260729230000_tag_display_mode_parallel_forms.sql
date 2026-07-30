-- =====================================================================
-- [Phase 15] 직급·직책 태그 표기 방식 — 병렬 표기를 두 모양으로 분리
-- - 기존 PARALLEL 하나가 원장에 따라 다른 모양으로 찍혔다(직급=슬래시, 직책=붙여쓰기).
--   같은 값이 자리에 따라 다르게 보이면 운영이 결과를 예측할 수 없으므로, 모양을 값으로 올린다.
--   PARALLEL_JOINED   = 붙여쓰기('책임매니저')
--   PARALLEL_SEPARATE = 따로쓰기('이사/본부장')
-- - 두 값 모두 양쪽 원장에서 고를 수 있다. 판정 순서는 종전대로
--   직급 우선 > 직책 우선 > 직급 병렬 > 직책 병렬 > 기본이며, 모양은 병렬을 선언한 쪽이 정한다.
-- 소유 워크스페이스: management(인사 기준정보) / 데이터 등급: Internal
-- 기존 RLS·정책 변경 없음(값 집합 교체만).
-- 근거: 20260729220000_tag_display_mode.sql
-- =====================================================================

-- 제약 → 데이터 → 제약 순서다. 옛 제약이 붙어 있는 채로 새 값을 넣으면 UPDATE가 먼저 막힌다.
alter table public.rank_tags drop constraint if exists rank_tags_display_mode_chk;
alter table public.position_tags drop constraint if exists position_tags_display_mode_chk;

-- 지금 찍히던 모양을 그대로 값으로 옮긴다(직급=슬래시, 직책=붙여쓰기).
update public.rank_tags     set display_mode = 'PARALLEL_SEPARATE' where display_mode = 'PARALLEL';
update public.position_tags set display_mode = 'PARALLEL_JOINED'   where display_mode = 'PARALLEL';

alter table public.rank_tags add constraint rank_tags_display_mode_chk
  check (display_mode in ('DEFAULT', 'PRIORITY', 'PARALLEL_JOINED', 'PARALLEL_SEPARATE'));

alter table public.position_tags add constraint position_tags_display_mode_chk
  check (display_mode in ('DEFAULT', 'PRIORITY', 'PARALLEL_JOINED', 'PARALLEL_SEPARATE'));

comment on column public.rank_tags.display_mode is
  '이름 옆 호칭 표기 방식. PRIORITY=직급만(직책이 있어도 이긴다), PARALLEL_JOINED=붙여쓰기, PARALLEL_SEPARATE=직급/직책, DEFAULT=직책 설정을 따른다.';
comment on column public.position_tags.display_mode is
  '이름 옆 호칭 표기 방식. PRIORITY=직책만, PARALLEL_JOINED=직급을 앞에 붙여 한 단어로(책임매니저), PARALLEL_SEPARATE=직급/직책, DEFAULT=직책만.';
