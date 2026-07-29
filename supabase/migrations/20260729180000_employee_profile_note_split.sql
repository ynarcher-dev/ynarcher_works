-- =====================================================================
-- [Phase 7] 임직원 프로필 노트 3분할: 액셀러레이터 철학 · 관심분야 · 한마디
-- 목적: 자유 텍스트 한 칸이던 profile.note를 성격이 다른 세 항목으로 가른다.
--   · 철학     : profile.philosophy = 자유 텍스트
--   · 관심분야 : profile.interests  = 산업 태그명(text) 배열 jsonb — ADMIN industry_tags 원장 값
--   · 한마디   : profile.one_liner  = 자유 텍스트
-- 종전 profile.note는 컬럼(jsonb 키)을 지우지 않고 남긴다 — 아직 옮기지 않은 글이 사라지지 않도록
-- 화면이 '이전 기록'으로 노출하고, 편집 시 철학 칸으로 옮겨 담은 뒤에만 이 키를 비운다.
-- 원장 스키마 변경 없음(profile은 이미 jsonb) — 백필/DDL 없이 본인 쓰기 경로만 넓힌다.
--
-- 본인 직접 UPDATE는 20260708130000에서 차단되어 있어 마이페이지의 유일한 쓰기 경로가 이 RPC다.
-- 따라서 새 세 키를 본인이 저장하려면 이 함수의 키 화이트리스트를 넓히는 것 외에 방법이 없다.
-- 인사 관리(관리자) 화면은 users_update RLS를 타는 일반 UPDATE라 이 함수와 무관하다.
--
-- 보안 게이트 체크리스트(11_migration_security_gate.md):
--  · 소유 워크스페이스: management(임직원 마스터) / 데이터 등급: Personal
--  · 접근 주체: 내부 임직원 본인(self) / Scope: self — where id = app.current_app_user_id()
--  · 신규 테이블/Storage 정책 없음. RLS 정책 변경 없음(users_update는 20260708130000 그대로)
--  · SECURITY DEFINER: search_path 고정(app, public), 대상 행을 호출자 본인으로 한정,
--    키 화이트리스트(photo/background/philosophy/interests/one_liner/note)만 병합 —
--    역할(user_type)·부서·이메일 등 권한/계정 필드에는 접근할 수 없다
--  · 입력 검증: photo는 data:image/ 접두사 + 길이 상한, background는 알려진 섹션 키의 배열만 허용,
--    interests는 문자열 배열(최대 5개·각 60자) 만 허용, 철학/한마디는 길이 상한
--  · GRANT EXECUTE 대상 authenticated 로 제한(public revoke)
--  · 개인정보 원본 조회/Export/권한변경 아님(본인 자기소개) → 별도 감사로그 없음
-- 근거: 20260721180000_employee_profile_photo_background.sql, 20260708130000_employee_self_profile.sql
-- =====================================================================

-- 구 signature 제거(신 signature와 이름이 같아 오버로드 모호성을 남기지 않는다) -------
drop function if exists public.update_my_profile(text, text, jsonb);

-- 본인 프로필(사진·약력·노트 3항목) 갱신 RPC ---------------------------------------
-- 나머지 profile 키(company/position/bio 등)와 스칼라 컬럼(user_type/department_id 등)은 불변.
-- 전달값으로 덮어쓴다 — null/빈 값은 곧 해당 항목 삭제를 뜻한다(부분 갱신 아님).
create or replace function public.update_my_profile(
  p_note       text    default null,
  p_photo      text    default null,
  p_background jsonb   default null,
  p_philosophy text    default null,
  p_interests  jsonb   default null,
  p_one_liner  text    default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid        uuid := app.current_app_user_id();
  v_photo      text := nullif(btrim(coalesce(p_photo, '')), '');
  v_philosophy text := nullif(btrim(coalesce(p_philosophy, '')), '');
  v_one_liner  text := nullif(btrim(coalesce(p_one_liner, '')), '');
  v_bg         jsonb;
  v_interests  jsonb;
  v_key        text;
  v_item       jsonb;
  -- 약력 섹션 키: careerConfig.ts의 CAREER_SECTIONS와 동일 집합.
  v_sections constant text[] := array['education', 'career', 'certifications', 'awards'];
  -- 관심분야 상한: noteConfig.ts의 MAX_INTERESTS와 같은 값.
  v_max_interests constant int := 5;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  -- 사진: 이미지 data URL만 허용. 원본 2MB의 base64 팽창(약 1.37배)을 감안한 길이 상한.
  if v_photo is not null then
    if v_photo !~ '^data:image/[a-zA-Z0-9.+-]+;base64,' then
      raise exception '사진은 이미지 파일만 첨부할 수 있습니다.' using errcode = '22023';
    end if;
    if length(v_photo) > 2800000 then
      raise exception '이미지는 2MB 이하만 첨부할 수 있습니다.' using errcode = '22023';
    end if;
  end if;

  -- 약력: {섹션키: [ {필드: 값}, ... ]} 형태만 허용하고 모르는 키는 거부한다.
  v_bg := coalesce(p_background, '{}'::jsonb);
  if jsonb_typeof(v_bg) <> 'object' then
    raise exception '약력 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if length(v_bg::text) > 100000 then
    raise exception '약력이 너무 깁니다.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(v_bg) loop
    if not (v_key = any (v_sections)) then
      raise exception '약력에 허용되지 않은 항목(%)이 있습니다.', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(v_bg -> v_key) <> 'array' then
      raise exception '약력 형식이 올바르지 않습니다.' using errcode = '22023';
    end if;
  end loop;

  -- 관심분야: 산업 태그명 문자열 배열만 허용. 빈 배열은 미지정(null)과 같게 다룬다.
  if p_interests is null or p_interests = 'null'::jsonb then
    v_interests := null;
  else
    if jsonb_typeof(p_interests) <> 'array' then
      raise exception '관심분야 형식이 올바르지 않습니다.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_interests) > v_max_interests then
      raise exception '관심분야는 최대 %개까지 선택할 수 있습니다.', v_max_interests using errcode = '22023';
    end if;
    for v_item in select jsonb_array_elements(p_interests) loop
      if jsonb_typeof(v_item) <> 'string' or length(v_item #>> '{}') > 60 then
        raise exception '관심분야 형식이 올바르지 않습니다.' using errcode = '22023';
      end if;
    end loop;
    v_interests := nullif(p_interests, '[]'::jsonb);
  end if;

  -- 자유 텍스트 상한(철학은 문단 여러 개, 한마디는 짧은 글 기준).
  if length(coalesce(v_philosophy, '')) > 4000 then
    raise exception '액셀러레이터 철학이 너무 깁니다.' using errcode = '22023';
  end if;
  if length(coalesce(v_one_liner, '')) > 2000 then
    raise exception '한마디가 너무 깁니다.' using errcode = '22023';
  end if;

  update public.users
     set profile = coalesce(profile, '{}'::jsonb)
                   || jsonb_build_object(
                        'photo',      v_photo,
                        'background', v_bg,
                        'philosophy', v_philosophy,
                        'interests',  v_interests,
                        'one_liner',  v_one_liner,
                        'note',       nullif(btrim(coalesce(p_note, '')), '')
                      )
   where id = v_uid;
end;
$$;

revoke all on function public.update_my_profile(text, text, jsonb, text, jsonb, text) from public;
grant execute on function public.update_my_profile(text, text, jsonb, text, jsonb, text) to authenticated;
