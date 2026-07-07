-- =====================================================================
-- [Phase 15] NETWORKS 조직 마스터(기업·기관·대학·외주/거래·미분류)를
--            전문가(experts)와 동일한 프로필 구조로 통일
-- - 업로드 양식을 '전문가' 단일 컴포넌트로 통일하고, "구분"을 엔티티 선택자로
--   재정의하여 선택값에 따라 해당 테이블로 라우팅한다. 이를 위해 조직 5종 테이블도
--   experts와 동일한 스칼라/JSONB 컬럼을 갖도록 확장한다.
--   · email       text                      : 이메일(민감정보 마스킹 대상)
--   · phone       text                      : 연락처(숫자만 저장, 민감정보 마스킹 대상)
--   · affiliation text                      : 소속
--   · expertise   jsonb '[]'                : 전문 분야 목록(조직 유형은 미사용, 빈 배열)
--   · profile     jsonb '{}'                : 사진/직책/부서/구분/매칭여부/약력/소개
-- - 기존 contact(jsonb)에 저장하던 인물 필드를 신규 컬럼으로 백필한다(비파괴 유지).
-- - 게스트/스타트업 등 비-네트워크 분류분은 미분류(others)로 일괄 이관한다.
-- - RLS는 컬럼 추가만 수행하므로 기존 정책(networks read/write)을 그대로 상속한다.
-- 근거: 20260706200000_van_investors_profile_structure.sql(van·investors 선례),
--       20260706170000_networks_org_masters.sql(org 마스터 생성),
--       20260706210000_networks_vendors_master.sql(vendors 생성)
-- =====================================================================

-- 1) experts와 동일한 프로필 컬럼 추가 -----------------------------------
do $$
declare t text;
begin
  foreach t in array array['corporates','institutions','universities','vendors','others']
  loop
    execute format(
      'alter table public.%1$s '
      || 'add column if not exists email text, '
      || 'add column if not exists phone text, '
      || 'add column if not exists affiliation text, '
      || 'add column if not exists expertise jsonb not null default ''[]''::jsonb, '
      || 'add column if not exists profile jsonb not null default ''{}''::jsonb;', t);

    execute format(
      $c$comment on column public.%1$s.expertise is '전문 분야 목록(조직 유형은 미사용). experts와 동일 구조';$c$, t);
    execute format(
      $c$comment on column public.%1$s.profile is '사진/직책/부서/구분/매칭여부/약력/소개(jsonb). experts와 동일 구조';$c$, t);
  end loop;
end $$;

-- 2) 기존 contact(jsonb) → 신규 컬럼 백필 -------------------------------
--    프로필 상세/목록이 스칼라(email/phone/affiliation)와 profile.* 를 읽으므로
--    표시 일관성을 위해 contact의 인물 필드를 이관한다(빈 값은 null 유지).
do $$
declare t text;
begin
  foreach t in array array['corporates','institutions','universities','vendors','others']
  loop
    execute format($u$
      update public.%1$s set
        email       = coalesce(email, nullif(contact->>'email', '')),
        phone       = coalesce(phone, nullif(contact->>'phone', '')),
        affiliation = coalesce(affiliation, nullif(contact->>'affiliation', '')),
        profile = profile || jsonb_strip_nulls(jsonb_build_object(
          'photo',      nullif(contact->>'photo', ''),
          'position',   nullif(contact->>'position', ''),
          'department', nullif(contact->>'department', ''),
          'category',   nullif(contact->>'category', '')
        ))
      where deleted_at is null
        and coalesce(contact, '{}'::jsonb) <> '{}'::jsonb;
    $u$, t);
  end loop;
end $$;

-- 3) 게스트/스타트업 등 비-네트워크 분류분 → 미분류(others) 일괄 이관 -------
--    프로필/조직 테이블에서 profile.category(또는 contact.category)가
--    '게스트'/'스타트업'인 레코드를 others로 복사 insert 후 원본 soft-delete.
--    (물리삭제 금지 준수. 현재 시드에 해당 레코드가 없으면 실질 no-op.)
--    experts는 contact 컬럼이 없어 profile만 참조하고, others 자신은 제외한다.
do $$
declare t text;
        cat_expr text;
begin
  foreach t in array array['experts','van','investors','corporates','institutions','universities','vendors']
  loop
    -- experts는 contact 컬럼이 없으므로 profile만, 나머지는 profile→contact 순으로 판정
    if t = 'experts' then
      cat_expr := $q$profile->>'category'$q$;
    else
      cat_expr := $q$coalesce(profile->>'category', contact->>'category')$q$;
    end if;

    -- 3-1) others로 비파괴 복사(스칼라 + expertise + profile 통일 스키마) --
    execute format($ins$
      insert into public.others (name, email, phone, affiliation, expertise, profile, created_by, created_at)
      select s.name, s.email, s.phone, s.affiliation,
             coalesce(s.expertise, '[]'::jsonb),
             coalesce(s.profile, '{}'::jsonb),
             s.created_by, s.created_at
      from public.%1$s s
      where s.deleted_at is null
        and s.merged_into_id is null
        and %2$s in ('게스트','스타트업');
    $ins$, t, cat_expr);

    -- 3-2) 원본 soft-delete -------------------------------------------
    execute format($del$
      update public.%1$s set deleted_at = now()
      where deleted_at is null
        and merged_into_id is null
        and %2$s in ('게스트','스타트업');
    $del$, t, cat_expr);
  end loop;
end $$;
