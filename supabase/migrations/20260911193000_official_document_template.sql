-- 하이웍스 공문 HTML을 일반 리치텍스트가 아니라 타입 있는 공문 필드로 복원한다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 양식 버전 jsonb와 공개 이미지 버킷만 추가한다. 업무 테이블·RLS·함수는 바꾸지 않는다.
--   · 공문 이미지는 회사 로고·직인 등 외부 발송 문서에 실리는 공개 자산이라 public 버킷이다.
--   · 업로드는 authenticated admin만 가능하고, 교체는 새 UUID 경로 INSERT로만 한다.
--     UPDATE·DELETE 정책은 열지 않아 기존 양식 버전이 가리키는 이미지를 보존한다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'approval-form-assets',
  'approval-form-assets',
  true,
  2000000,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists approval_form_asset_objects_insert on storage.objects;
create policy approval_form_asset_objects_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'approval-form-assets' and app.is_admin());

do $$
declare
  v_form_id uuid;
  v_version_id uuid;
  v_next_version integer;
begin
  select f.id
    into v_form_id
    from public.approval_forms f
   where f.deleted_at is null
     and f.security_grade <> '하이웍스 원본'
     and (f.abbrev = '공문' or f.name = '공문')
   order by case when f.abbrev = '공문' then 0 else 1 end
   limit 1;

  if v_form_id is null then
    raise notice '현재 사용 공문 양식이 없어 전용 버전 발행을 건너뜁니다.';
    return;
  end if;

  if exists (
    select 1
      from public.approval_forms f
      join public.approval_form_versions v on v.id = f.current_version_id
      cross join lateral jsonb_array_elements(v.fields) field
     where f.id = v_form_id
       and field->>'type' = 'OFFICIAL_DOCUMENT'
  ) then
    return;
  end if;

  select coalesce(max(v.version_no), 0) + 1
    into v_next_version
    from public.approval_form_versions v
   where v.form_id = v_form_id;

  insert into public.approval_form_versions (form_id, version_no, fields)
  values (
    v_form_id,
    v_next_version,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'official_document',
        'label', '공문',
        'type', 'OFFICIAL_DOCUMENT',
        'required', true,
        'officialDocument', jsonb_build_object(
          'companyName', '와이앤아처 주식회사',
          'address', '서울시 강남구 테헤란로7길 22 한국과학기술회관 2관 2층 202호',
          'telephone', '02-2690-1550',
          'fax', '02-6918-6560',
          'website', 'www.ynarcher.com'
        )
      )
    )
  )
  returning id into v_version_id;

  update public.approval_forms
     set current_version_id = v_version_id
   where id = v_form_id;
end;
$$;

comment on column public.approval_form_versions.fields is
  '필드 스키마(jsonb 배열). 각 원소: {key, label, type, required?, options?, primaryAmount?, columns?, levels?, defaultValue?, officialDocument?}. '
  'type ∈ TEXT/TEXTAREA/RICHTEXT/OFFICIAL_DOCUMENT/NUMBER/MONEY/DATE/SELECT/TABLE/BUDGET_TREE. '
  'OFFICIAL_DOCUMENT는 공문 고정 틀 설정(officialDocument)을 갖고 문서별 값은 {recipient, reference, sentOn, body}다. '
  'TABLE은 행 객체 배열, BUDGET_TREE는 층 있는 예산표다. primaryAmount가 문서 대표 금액의 원천이며 버전 행은 불변이다.';
