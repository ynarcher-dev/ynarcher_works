-- 대표자 이름과 분리해 성별을 선택 입력으로 보관한다.
-- 기존 행은 null이며, 화면은 값이 있을 때만 대표자명 뒤에 붙인다.
alter table public.startups
  add column if not exists representative_gender text;

comment on column public.startups.representative_gender is
  '대표자 성별(선택 입력). null이면 대표자 이름만 표시한다.';
