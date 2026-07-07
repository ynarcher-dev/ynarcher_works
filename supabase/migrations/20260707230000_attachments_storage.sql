-- =====================================================================
-- [Phase 6] 자료 관리(첨부) 스토리지 배선
-- - 상세페이지 우측 '자료 관리' 패널의 파일 업로드/다운로드 실연동.
-- - 저장 위치: 비공개 Storage 버킷 `attachments`(직접 접근 금지, Signed URL 경유).
-- - 메타데이터: 기존 public.attachments 다형 테이블(target_type/target_id) 재사용.
--   RLS는 20260705120500_rls_enable_policies.sql에서 이미 배선됨(내부 사용자 select,
--   본인 업로드 insert, 본인/admin update). 여기서는 uploaded_by 자동 스탬프만 추가한다.
-- - 소프트 삭제 원칙: 메타 행은 deleted_at으로 숨기고 Storage 오브젝트는 보존한다.
-- 근거: 20260705120300_support_tables.sql(attachments 정의),
--       docs/docs_dev/7_database_design_guidelines.md §2.3(다형 공통 테이블)
-- =====================================================================

-- 비공개 버킷 생성(멱등) -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- uploaded_by 서버 스탬프: 클라이언트가 보내지 않아도 현재 사용자로 채운다.
-- (insert 정책 `uploaded_by = app.current_app_user_id()` 통과를 서버가 보장)
create or replace function app.stamp_attachment_uploader()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if new.uploaded_by is null then
    new.uploaded_by := app.current_app_user_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attachments_stamp_uploader on public.attachments;
create trigger trg_attachments_stamp_uploader
  before insert on public.attachments
  for each row execute function app.stamp_attachment_uploader();

-- Storage 오브젝트 RLS(attachments 버킷 한정) -------------------------------
-- 내부 사용자만 접근. 외부 게스트(스타트업/전문가/임시)는 직접 접근 불가(전용 흐름 경유).
create or replace function app.can_use_attachment_storage()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or (app.current_app_user_id() is not null
          and app.current_app_role() not in
              ('external_startup', 'external_expert', 'temporary_guest'));
$$;

drop policy if exists attachments_objects_select on storage.objects;
create policy attachments_objects_select on storage.objects for select
  using (bucket_id = 'attachments' and app.can_use_attachment_storage());

drop policy if exists attachments_objects_insert on storage.objects;
create policy attachments_objects_insert on storage.objects for insert
  with check (bucket_id = 'attachments' and app.can_use_attachment_storage());

drop policy if exists attachments_objects_update on storage.objects;
create policy attachments_objects_update on storage.objects for update
  using (bucket_id = 'attachments' and app.can_use_attachment_storage())
  with check (bucket_id = 'attachments' and app.can_use_attachment_storage());
