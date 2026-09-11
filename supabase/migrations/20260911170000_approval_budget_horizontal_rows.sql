-- 품의서 예산표 UI 정리
--
-- 새 예산표는 분류 단계를 열로 펼치며 문서 금액은 예산 합계에서 파생한다. 최초 품의서
-- 시드에 있던 별도 `품의 금액` 입력은 같은 숫자를 두 곳에 적게 하므로 현재 양식에서 뺀다.
-- 과거 문서는 자신이 기안된 버전을 계속 가리켜 원문과 당시 금액 입력을 그대로 보존한다.

do $$
declare
  v_form   uuid;
  v_fields jsonb;
  v_next   integer;
  v_ver    uuid;
begin
  select f.id, v.fields
    into v_form, v_fields
    from public.approval_forms f
    join public.approval_form_versions v on v.id = f.current_version_id
   where f.abbrev = '품의'
     and f.deleted_at is null;

  if v_form is null
     or not exists (
       select 1
         from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) e
        where e.value->>'type' = 'BUDGET_TREE'
     )
     or not exists (
       select 1
         from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) e
        where e.value->>'key' = 'amount'
          and e.value->>'label' = '품의 금액'
          and e.value->>'type' in ('MONEY', 'NUMBER')
     )
  then
    return;
  end if;

  select coalesce(max(version_no), 0) + 1
    into v_next
    from public.approval_form_versions
   where form_id = v_form;

  select coalesce(jsonb_agg(
           case
             -- 초기 기본명만 새 용어로 고친다. ADMIN이 정한 다른 단계명은 건드리지 않는다.
             when e.value->>'type' = 'BUDGET_TREE'
              and e.value->'levels' = '["대분류", "중분류", "세부항목"]'::jsonb
             then jsonb_set(e.value, '{levels}', '["대분류", "중분류", "소분류"]'::jsonb)
             else e.value
           end
           order by e.ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements(v_fields) with ordinality e(value, ord)
   where not (
     e.value->>'key' = 'amount'
     and e.value->>'label' = '품의 금액'
     and e.value->>'type' in ('MONEY', 'NUMBER')
   );

  insert into public.approval_form_versions (form_id, version_no, fields)
  values (v_form, v_next, v_fields)
  returning id into v_ver;

  update public.approval_forms
     set current_version_id = v_ver
   where id = v_form;
end;
$$;
