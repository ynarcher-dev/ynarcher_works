-- =====================================================================
-- [AC] 모집 랜딩 포스터 공개 스토리지 버킷
-- 근거 기획: docs/docs_planning/3_4_3_ac_recruitment.md (공개 랜딩 포스터)
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=ac / 등급=Public(공개 모집 랜딩에 노출되는 마케팅 이미지) / 접근=누구나 읽기
--   - 포스터는 공개 신청 랜딩(/apply/:token)에 노출되는 공개 이미지 → public 버킷(공개 URL 읽기).
--   - 개인정보/제출서류는 이 버킷을 쓰지 않는다(그건 비공개 첨부 흐름, 후속 커밋).
--   - 쓰기(업로드/교체)는 내부 사용자만: 외부 스타트업/전문가/임시 게스트는 차단
--     (기존 app.can_use_attachment_storage() 재사용 — 내부 비게스트 한정).
--   - DELETE 정책 미선언(soft 운영: 오브젝트 보존, 메타는 landing.poster_path 교체로 대체).
-- =====================================================================

-- 공개 버킷 생성(멱등). public=true → 공개 URL로 익명 읽기 허용(마케팅 포스터).
insert into storage.buckets (id, name, public)
values ('program-posters', 'program-posters', true)
on conflict (id) do nothing;

-- 업로드/교체는 내부 사용자만(외부 게스트 차단). 읽기는 public 버킷이라 공개 URL로 처리.
drop policy if exists poster_objects_insert on storage.objects;
create policy poster_objects_insert on storage.objects for insert
  with check (bucket_id = 'program-posters' and app.can_use_attachment_storage());

drop policy if exists poster_objects_update on storage.objects;
create policy poster_objects_update on storage.objects for update
  using (bucket_id = 'program-posters' and app.can_use_attachment_storage())
  with check (bucket_id = 'program-posters' and app.can_use_attachment_storage());
