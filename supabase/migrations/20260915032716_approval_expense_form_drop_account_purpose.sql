-- =====================================================================
-- 표준 지출결의서(약칭 `지결`)에서 최상위 `계정과목`·`사용목적` 칸을 내린다.
--
-- 두 칸은 하이웍스 양식을 그대로 옮겨 오며 따라온 것이다. 지금은 무엇에 쓰는 돈인지를
-- **지출 내역 표의 예산 줄**이 답하고(근거 품의의 어느 항목에서 나가는가), 왜 쓰는지는 본문이
-- 답한다. 같은 물음에 답하는 칸이 셋이면 셋이 서로 다른 말을 적은 문서가 결재를 통과하고,
-- 나중에 집계할 때 어느 값이 참인지 판정할 근거가 없다.
--
-- **버전 행은 불변이다.** 옛 버전의 `fields`를 고치지 않고 새 버전을 발행한 뒤 양식의
-- `current_version_id`만 옮긴다. 이미 상신된 문서는 자기 `form_version_id`가 가리키는 버전의
-- 스키마로 렌더되므로, 그 문서들에서는 두 칸이 지금까지와 똑같이 보이고 값도 그대로 남는다
-- (데이터 삭제 없음 — `field_values`는 손대지 않는다).
--
-- 범위
--   · 최상위 필드만 본다. 표(TABLE) 안의 같은 이름 열(`columns[].key`)은 건드리지 않는다.
--   · 하이웍스 복원 양식(`security_grade = '하이웍스 원본'`)은 제외한다 — 그 양식은 원본
--     그대로 보존하는 것이 존재 이유다(양식 카탈로그 마이그레이션과 같은 문장).
--   · 법인카드 지출결의서(`법카`)의 `계정과목`은 그대로 둔다. 이번 결정의 대상은 표준
--     지출결의서 한 건이며, 다른 양식을 함께 끌어오지 않는다.
--
-- 재실행 안전: 양식이 없거나 두 칸이 이미 빠져 있으면 **아무 일도 하지 않는다**(새 버전을
-- 발행하지 않는다). 두 번 돌려도 버전 번호가 늘지 않는다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md): 해당 없음.
--   · 소유: OFFICE 사용 / ADMIN 관리, 데이터 등급: Internal, 범위: global.
--   · 신규 테이블·뷰·정책·트리거·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
--   · GRANT/REVOKE 변경 없음, RLS 경계 불변, 개인정보·감사 대상 행위 없음.
--   · 기존 문서 데이터 변경·삭제 없음(양식 버전 한 행이 추가되고 포인터 한 칸이 바뀐다).
-- =====================================================================

do $$
declare
  v_form   uuid;
  v_fields jsonb;
  v_kept   jsonb;
  v_next   integer;
  v_ver    uuid;
begin
  -- 살아 있는 표준 지출결의서 한 건. 약칭은 살아 있는 양식끼리 유일하다
  -- (uq_approval_forms_abbrev) — 이름은 ADMIN이 고칠 수 있어 기준으로 쓰지 않는다.
  select f.id, v.fields
    into v_form, v_fields
    from public.approval_forms f
    join public.approval_form_versions v on v.id = f.current_version_id
   where f.abbrev = '지결'
     and f.deleted_at is null
     and f.security_grade <> '하이웍스 원본';

  -- 양식이 없거나(다른 환경) 현재 버전이 아직 없으면 할 일이 없다.
  if v_form is null then
    return;
  end if;

  -- 이미 빠져 있으면 새 버전을 발행하지 않는다. 같은 내용의 버전을 쌓으면 이력이
  -- "무엇이 바뀌었나"에 답하지 못하게 된다.
  if not exists (
    select 1
      from jsonb_array_elements(
             case when jsonb_typeof(v_fields) = 'array' then v_fields else '[]'::jsonb end
           ) e
     where e.value->>'key' in ('account', 'purpose')
  ) then
    return;
  end if;

  -- 남길 필드 — 순서는 양식이 정한 그대로다. `->>'key'`는 최상위 키만 읽으므로
  -- 표 안의 같은 이름 열은 이 판정에 걸리지 않는다.
  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
    into v_kept
    from jsonb_array_elements(
           case when jsonb_typeof(v_fields) = 'array' then v_fields else '[]'::jsonb end
         ) with ordinality e(value, ord)
   where e.value->>'key' is distinct from 'account'
     and e.value->>'key' is distinct from 'purpose';

  select coalesce(max(version_no), 0) + 1
    into v_next
    from public.approval_form_versions
   where form_id = v_form;

  insert into public.approval_form_versions (form_id, version_no, fields)
  values (v_form, v_next, v_kept)
  returning id into v_ver;

  -- 바뀌는 것은 "앞으로 쓸 버전"뿐이다. 이미 상신된 문서의 form_version_id는 그대로다.
  update public.approval_forms
     set current_version_id = v_ver
   where id = v_form;
end
$$;
