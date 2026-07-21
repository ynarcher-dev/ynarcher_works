-- =====================================================================
-- [Phase 7] 임직원 본인 프로필: 사진·구조 약력까지 확장
-- 목적: 임직원 프로필(사진/약력/노트)을 NETWORKS와 동일한 규약으로 통일한다.
--   · 사진   : profile.photo      = 2MB 이하 이미지 data URL (Storage 아님)
--   · 약력   : profile.background = 섹션(학력/경력/자격증/수상)별 항목 배열 jsonb
--   · 노트   : profile.note       = 자유 텍스트(기존 유지, NETWORKS의 intro와 동일 역할)
-- 기존 update_my_profile(bio, note)은 자유 텍스트 약력만 다뤄 사진·구조 약력을 담을 수 없었다.
-- 본인 직접 UPDATE는 20260708130000에서 이미 차단되어 있으므로, 마이페이지의 유일한 쓰기
-- 경로인 이 RPC의 키 화이트리스트를 넓히는 것이 유일한 방법이다.
--
-- 구 signature(text, text)는 제거하고 (p_note, p_photo, p_background) 하나만 남긴다.
-- 세 값 모두 "전달값으로 덮어쓴다" — null/빈 값은 곧 해당 항목 삭제를 뜻한다(부분 갱신 아님).
-- 레거시 자유 텍스트 profile.bio는 건드리지 않는다(상세 화면에서 폴백 표시 전용).
--
-- 보안 게이트 체크리스트(11_migration_security_gate.md):
--  · 소유 워크스페이스: management(임직원 마스터) / 데이터 등급: Personal
--  · 접근 주체: 내부 임직원 본인(self) / Scope: self — where id = app.current_app_user_id()
--  · 신규 테이블/Storage 정책 없음. RLS 정책 변경 없음(users_update는 20260708130000 그대로)
--  · SECURITY DEFINER: search_path 고정(app, public), 대상 행을 호출자 본인으로 한정,
--    키 화이트리스트(photo/background/note)만 병합 — 역할·부서 등 권한 필드 접근 불가
--  · 입력 검증: photo는 data:image/ 접두사 + 길이 상한, background는 알려진 섹션 키의 배열만 허용
--  · GRANT EXECUTE 대상 authenticated 로 제한(public revoke)
--  · 개인정보 원본 조회/Export/권한변경 아님(본인 자기소개) → 별도 감사로그 없음
-- 근거: 20260708130000_employee_self_profile.sql, 20260707120000_networks_unify_profile_schema.sql
-- =====================================================================

-- 구 signature 제거(신 signature와 이름이 같아 오버로드 모호성을 남기지 않는다) -------
drop function if exists public.update_my_profile(text, text);

-- 본인 프로필(사진·약력·노트) 갱신 RPC ---------------------------------------------
-- 나머지 profile 키(company/position/bio 등)와 스칼라 컬럼(user_type/department_id 등)은 불변.
create or replace function public.update_my_profile(
  p_note       text    default null,
  p_photo      text    default null,
  p_background jsonb   default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid   uuid := app.current_app_user_id();
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  v_bg    jsonb;
  v_key   text;
  -- 약력 섹션 키: careerConfig.ts의 CAREER_SECTIONS와 동일 집합.
  v_sections constant text[] := array['education', 'career', 'certifications', 'awards'];
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

  update public.users
     set profile = coalesce(profile, '{}'::jsonb)
                   || jsonb_build_object(
                        'photo',      v_photo,
                        'background', v_bg,
                        'note',       nullif(btrim(coalesce(p_note, '')), '')
                      )
   where id = v_uid;
end;
$$;

revoke all on function public.update_my_profile(text, text, jsonb) from public;
grant execute on function public.update_my_profile(text, text, jsonb) to authenticated;
