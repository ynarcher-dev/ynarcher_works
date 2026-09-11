-- 예산표의 자유기입 열은 단순 메모보다 금액의 산출 근거를 적는 자리가 먼저다.
--
-- 문서가 가리키는 과거 양식 버전은 당시 표기를 그대로 보존한다. 현재 양식만 새 버전으로
-- 복제해 `note` 저장 키와 이미 적힌 문서 값은 건드리지 않고 열 라벨만 바꾼다.

do $$
declare
  r         record;
  v_fields  jsonb;
  v_next    integer;
  v_version uuid;
begin
  for r in
    select f.id as form_id, v.fields
      from public.approval_forms f
      join public.approval_form_versions v on v.id = f.current_version_id
     where f.deleted_at is null
       and exists (
         select 1
           from jsonb_array_elements(coalesce(v.fields, '[]'::jsonb)) field(value)
           cross join lateral jsonb_array_elements(
             coalesce(field.value->'columns', '[]'::jsonb)
           ) column_value(value)
          where field.value->>'type' = 'BUDGET_TREE'
            and column_value.value->>'key' = 'note'
            and column_value.value->>'label' = '비고'
       )
  loop
    select coalesce(jsonb_agg(
             case
               when field.value->>'type' = 'BUDGET_TREE' then
                 jsonb_set(
                   field.value,
                   '{columns}',
                   (
                     select coalesce(jsonb_agg(
                              case
                                when column_value.value->>'key' = 'note'
                                 and column_value.value->>'label' = '비고'
                                then jsonb_set(
                                       column_value.value,
                                       '{label}',
                                       to_jsonb('산출내역/비고'::text)
                                     )
                                else column_value.value
                              end
                              order by column_value.ord
                            ), '[]'::jsonb)
                       from jsonb_array_elements(
                         coalesce(field.value->'columns', '[]'::jsonb)
                       ) with ordinality column_value(value, ord)
                   )
                 )
               else field.value
             end
             order by field.ord
           ), '[]'::jsonb)
      into v_fields
      from jsonb_array_elements(coalesce(r.fields, '[]'::jsonb))
           with ordinality field(value, ord);

    select coalesce(max(version_no), 0) + 1
      into v_next
      from public.approval_form_versions
     where form_id = r.form_id;

    insert into public.approval_form_versions (form_id, version_no, fields)
    values (r.form_id, v_next, v_fields)
    returning id into v_version;

    update public.approval_forms
       set current_version_id = v_version
     where id = r.form_id;
  end loop;
end;
$$;
