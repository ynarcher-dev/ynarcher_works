-- =====================================================================
-- 회의록 외부 참석자가 '연동 대상'으로 저장되던 결함 — 역할을 아는 함수가
-- 아무도 부르지 않는 스키마에 있었다
--
-- 증상
--   편집 화면에서 networks 인물을 **외부 참석자**로 담아 저장하면, 다시 열었을 때 그 사람이
--   외부 참석자 줄이 아니라 **연동 대상** 줄에 서 있다. 화면에서 외부 참석자 칸은 비어 있다.
--
-- 원인: 같은 이름의 함수가 두 스키마에 있고, 고친 쪽은 죽은 쪽이었다
--   20260723230000이 `app.set_minute_links`를 **드롭하고** 같은 본문을 `public`에 다시 만들었다
--   (PostgREST는 public 스키마만 노출하므로 `supabase.rpc()`가 부르는 것은 public 쪽이다).
--   그런데 역할(role)을 도입한 20260903240000은 `create or replace function app.set_minute_links`로
--   **app 쪽을 되살려 고쳤다.** 그래서 role을 아는 함수는 아무도 부르지 않는 자리에 서 있고,
--   화면이 실제로 부르는 public 함수는 INSERT 문에 role 컬럼이 없는 옛 본문 그대로였다.
--   컬럼 기본값이 `'SUBJECT'`(20260903240000 §1)라 **외부 참석자로 보낸 행이 조용히 연동으로
--   저장됐다** — 오류가 나지 않으므로 저장은 성공하고, 다시 읽을 때 화면이 role로 두 줄을
--   가르면서 그제야 자리가 어긋난 것이 드러난다.
--
--   `create or replace`는 없는 함수를 만들기도 하므로, 드롭된 함수를 고치는 마이그레이션은
--   오류 없이 통과한다. **함수를 옮긴 뒤에 그 함수를 고칠 때는 어느 스키마의 것을 부르는지
--   부르는 쪽에서 확인하는 것까지가 한 벌이다** — 이 저장소가 표를 지울 때 함수 본문을 전수
--   조사하는 것과 같은 종류의 규칙이고, 여기서는 방향만 반대다(함수를 고칠 때 호출부를 본다).
--
-- 조치
--   (1) `public.set_minute_links`를 역할을 아는 본문으로 재정의한다.
--   (2) 도달 불가능한 `app.set_minute_links`를 다시 드롭한다 — 남겨 두면 다음 사람이 그
--       본문을 읽고 "역할은 이미 지원된다"고 판단한다. 이번 결함이 정확히 그렇게 났다.
--
-- 대상 종류 적합성은 이 함수가 다시 적지 않는다
--   20260903240000의 app 본문은 외부 참석자로 담을 수 있는 종류를 통합 전 10종
--   ('expert','van','exp',…)으로 하드코딩했는데, 20260904120000의 NETWORKS 통합으로 그 키들은
--   `'network'` 하나가 됐다. **같은 규칙이 두 곳에 살면 어긋나고 실제로 어긋나 있었다** —
--   그 본문을 그대로 옮겼다면 이번에는 외부 참석자가 저장 자체를 거부당했을 것이다.
--   판정의 자리는 표에 붙은 CHECK 하나(`meeting_minute_links_attendee_target_check`:
--   role이 EXTERNAL_ATTENDEE면 target_type은 network)이고, 역할 값 자체도
--   `meeting_minute_links_role_check`가 답한다. 함수는 값을 옮기기만 한다.
--
-- 이미 저장된 행은 옮기지 않는다
--   결함이 만든 행은 `target_type='network'`이면서 `role='SUBJECT'`인데, **그것이 정상 값이기도
--   하다**(회의가 다룬 대상으로 네트워크 인물을 거는 것은 편집 화면의 정상 경로다). 둘을 가를
--   근거가 원장에 없으므로 일괄 UPDATE는 멀쩡한 연동을 참석자로 바꿔 놓는다. 잘못 선 줄은
--   담당자가 편집 화면에서 옮긴다(칩을 빼서 반대편에 다시 담으면 된다).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(회의록) / networks(연동 대상). 데이터 등급: Internal.
--     이 경로로 흐르는 것은 인물의 이름·소속뿐이며 연락처·이메일 원본은 지나지 않는다.
--   · 접근 주체: 내부 사용자. 게스트는 meeting_minutes/meeting_minute_links를 못 읽는다.
--   · 신규 표·신규 정책·신규 함수 없음 — 기존 SECURITY DEFINER RPC 하나를 재정의한다.
--     `set search_path = app, public` 고정과 **첫 줄 호출자 권한 확인**(작성자 또는 admin),
--     대상별 재검증(`app.can_link_minute_target`)을 그대로 유지한다.
--   · 권한이 넓어지지 않는다: role은 같은 행의 성격 표시일 뿐 열람 범위를 바꾸지 않고,
--     쓸 수 있는 대상 집합도 종전과 같다(같은 판정 함수를 같은 자리에서 부른다).
--   · GRANT EXECUTE는 authenticated 한정, revoke from public 유지. anon 경로 없음.
--   · 감사 로그 대상 아님(개인정보 원본 조회·다운로드·Export·권한 변경 어디에도 해당하지 않는다).
--   · 조인 표는 write 정책이 없어(Default Deny) 이 RPC가 여전히 유일한 쓰기 경로다.
-- 근거: 20260723230000_minute_view_links_public_schema.sql(app→public 이동),
--       20260903240000_meeting_minute_link_roles.sql(role 도입 · 본 결함의 발생 지점),
--       20260904120000_networks_unified_ledger.sql(외부 참석자 대상 종류 CHECK)
-- =====================================================================

create or replace function public.set_minute_links(p_minute_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  r record;
begin
  if not (app.is_admin() or app.is_minute_author(p_minute_id)) then
    raise exception '회의록 작성자만 연동 대상을 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  delete from public.meeting_minute_links where minute_id = p_minute_id;

  for r in
    -- 같은 대상이 두 역할로 실려 오면 참석자 쪽을 남긴다(unique 제약이 한 줄만 허용한다).
    select distinct on (target_type, target_id) target_type, target_id, role
      from (
        select (elem->>'target_type') as target_type,
               (elem->>'target_id')::uuid as target_id,
               -- 역할이 비어 오면 '회의가 다룬 대상'이다(옛 화면·옛 저장 경로와 같은 뜻).
               coalesce(nullif(elem->>'role', ''), 'SUBJECT') as role
          from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as elem
         where elem->>'target_type' is not null
           and elem->>'target_id' is not null
      ) src
     order by target_type, target_id, (role = 'EXTERNAL_ATTENDEE') desc
  loop
    if not app.can_link_minute_target(r.target_type, r.target_id) then
      raise exception '연동할 수 없는 대상입니다(권한 없음 또는 삭제됨): % %',
        r.target_type, r.target_id using errcode = '42501';
    end if;

    -- 역할 값과 '외부 참석자로 담을 수 있는 종류'는 표의 CHECK 둘이 답한다(위 주석 참조).
    insert into public.meeting_minute_links (minute_id, target_type, target_id, role)
    values (p_minute_id, r.target_type, r.target_id, r.role)
    on conflict (minute_id, target_type, target_id) do nothing;
  end loop;
end $$;

revoke all on function public.set_minute_links(uuid, jsonb) from public;
grant execute on function public.set_minute_links(uuid, jsonb) to authenticated;

comment on function public.set_minute_links(uuid, jsonb) is
  '회의록 연동 대상·외부 참석자 일괄 교체. 작성자/admin만, 대상별 app.can_link_minute_target 통과분만 반영. '
  'role(SUBJECT=회의가 다룬 대상, EXTERNAL_ATTENDEE=회의에 온 사외 인원)을 그대로 싣고, 역할별 대상 종류는 표의 CHECK가 강제한다.';

-- 도달 불가능한 app 스키마 버전을 다시 걷는다(20260723230000이 걷은 것을 20260903240000이
-- create or replace로 되살렸다). 남겨 두면 다음 사람이 죽은 본문을 근거로 삼는다.
drop function if exists app.set_minute_links(uuid, jsonb);
