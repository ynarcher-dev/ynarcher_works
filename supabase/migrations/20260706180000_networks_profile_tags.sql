-- =====================================================================
-- [Phase 15] 투자/전문가 네트워크 마스터 ↔ 기준정보 태그 연결
-- - experts / van / investors 마스터에 구분태그·분야태그 FK를 추가한다.
--   · category_tag_id → public.category_tags(id)  (구분: 게스트/스타트업/전문가 등)
--   · field_tag_id    → public.field_tags(id)      (분야: 마케팅/재무·회계/기술·개발 등)
-- - 공용 프로필 목록(전문가/VAN/투자자)의 '구분'/'분야' 컬럼이 ADMIN 기준정보 태그를
--   참조하도록 하기 위한 연결 컬럼이다.
-- - 태그 원장은 soft delete(deleted_at)만 수행하므로 FK는 단순 참조(하드 삭제 미발생).
-- - 컬럼 추가만 하며 RLS는 기존 테이블 정책(networks read/write)을 그대로 상속한다.
-- 근거: 20260706160000_category_tags.sql, 20260706130000_field_tags.sql,
--       20260706170000_networks_org_masters.sql
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['experts', 'van', 'investors']
  loop
    -- 구분/분야 태그 참조 컬럼 --------------------------------------------
    execute format(
      'alter table public.%1$s '
      || 'add column if not exists category_tag_id uuid references public.category_tags(id), '
      || 'add column if not exists field_tag_id uuid references public.field_tags(id);', t);

    -- 조인/필터 인덱스 ----------------------------------------------------
    execute format(
      'create index if not exists idx_%1$s_category_tag on public.%1$s (category_tag_id);', t);
    execute format(
      'create index if not exists idx_%1$s_field_tag on public.%1$s (field_tag_id);', t);

    -- 컬럼 주석 ----------------------------------------------------------
    execute format(
      $c$comment on column public.%1$s.category_tag_id is '구분 태그(category_tags) 참조';$c$, t);
    execute format(
      $c$comment on column public.%1$s.field_tag_id is '분야 태그(field_tags) 참조';$c$, t);
  end loop;
end $$;
