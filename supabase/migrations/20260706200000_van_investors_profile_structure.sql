-- =====================================================================
-- [Phase 15] VAN·투자사 마스터를 전문가(experts)와 동일한 프로필 구조로 통일
-- - 전문가 네트워크의 상세페이지·등록폼(사진/약력/분야/매칭/소개)을 VAN·투자사도
--   동일 컴포넌트로 재사용하기 위해, experts와 동일한 스칼라/JSONB 컬럼을 추가한다.
--   · email       text                      : 이메일(민감정보 마스킹 대상)
--   · phone       text                      : 연락처(숫자만 저장, 민감정보 마스킹 대상)
--   · affiliation text                      : 소속
--   · expertise   jsonb '[]'                : 전문 분야 목록(field_tags 다중선택)
--   · profile     jsonb '{}'                : 사진/직책/구분/매칭여부/약력/소개
-- - 기존 컬럼(van.category·representative·memo, investors.investor_type·focus 등)은
--   비파괴 유지한다. 공용 프로필 폼은 위 신규 컬럼만 사용한다.
-- - 이미 존재하는 category_tag_id·field_tag_id, contact(jsonb)는 그대로 둔다.
-- - RLS는 기존 테이블 정책(networks read/write)을 그대로 상속한다(컬럼 추가만 수행).
-- 근거: 20260705120400_networks_master.sql(experts 원장 구조),
--       20260706170000_networks_org_masters.sql(van·investors 생성),
--       20260706180000_networks_profile_tags.sql(태그 FK 연결)
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['van', 'investors']
  loop
    -- experts와 동일한 프로필 컬럼 --------------------------------------
    execute format(
      'alter table public.%1$s '
      || 'add column if not exists email text, '
      || 'add column if not exists phone text, '
      || 'add column if not exists affiliation text, '
      || 'add column if not exists expertise jsonb not null default ''[]''::jsonb, '
      || 'add column if not exists profile jsonb not null default ''{}''::jsonb;', t);

    -- 컬럼 주석 ----------------------------------------------------------
    execute format(
      $c$comment on column public.%1$s.expertise is '전문 분야 목록(field_tags 다중선택). experts와 동일 구조';$c$, t);
    execute format(
      $c$comment on column public.%1$s.profile is '사진/직책/구분/매칭여부/약력/소개(jsonb). experts와 동일 구조';$c$, t);
  end loop;
end $$;
