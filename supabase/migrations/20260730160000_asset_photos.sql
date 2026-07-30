-- =====================================================================
-- [Phase 12] 자산 원장 — 사진 첨부(자산당 최대 5장)
--
-- 근거: 20260730100000_assets_ledger.sql / 20260730120000_assets_billing_serial.sql
--       docs_planning/3_7_2_management_assets.md
--       보안 게이트: docs/docs_dev/11_migration_security_gate.md
--
-- 자산은 글로 적은 사양만으로는 같은 물건인지 알기 어렵다(같은 모델의 노트북 열 대, 흠집이
-- 난 자리, 명판에 붙은 관리 번호). 사진은 그 확인을 대신하므로 원장이 함께 들고 있어야 한다.
--
-- 저장 형태는 경로 배열(text[]) 하나다. 별도 테이블을 만들지 않는 이유는 사진에 붙는 속성이
-- 없기 때문이다 — 순서 외에 적을 것이 없는 값에 테이블을 주면 조인만 늘고 규칙은 그대로다.
-- 배열의 순서가 곧 표시 순서다. 반대로 자료(attachments)는 파일명·업로더·크기·다운로드
-- 로그가 필요해 테이블이 맞는다. 둘은 성격이 다르므로 합치지 않는다.
--
-- 삭제는 배열에서 경로를 빼는 것으로 끝내고 Storage 오브젝트는 지우지 않는다(물리 삭제 금지).
--
-- 소유 워크스페이스: management / 데이터 등급: Internal / Scope: global
-- 접근 주체: 내부 임직원 중 management 읽기 권한자(외부 게스트 전면 차단).
-- 감사 로그: 미대상 — 사내 비품 사진이며 개인정보 원본·대량 Export 경로가 아니다.
--   (개인정보가 담기는 자료 다운로드는 attachments + material-download Edge Function이 소유한다.)
-- 새 테이블·RPC·SECURITY DEFINER 함수 없음. DELETE 정책 없음.
-- =====================================================================

-- 1) 컬럼 --------------------------------------------------------------------
alter table public.assets
  add column if not exists photo_paths text[] not null default '{}'::text[];

comment on column public.assets.photo_paths is
  'asset-photos 버킷의 오브젝트 키 배열(최대 5장, 배열 순서 = 표시 순서). 삭제는 배열에서 빼는 것으로 끝내고 오브젝트는 보존한다.';

-- 2) 제약 --------------------------------------------------------------------
-- 상한은 화면(첨부 버튼 비활성화)에도 있지만 최종 판정은 여기다 — 화면을 거치지 않는 경로
-- (임포터·직접 호출)로 여섯 장째가 들어오면 상한이 있다는 말이 무의미해진다.
alter table public.assets drop constraint if exists assets_photo_paths_max;
alter table public.assets add constraint assets_photo_paths_max
  check (coalesce(array_length(photo_paths, 1), 0) <= 5);

-- null·빈 문자열은 경로가 아니다. 들어오면 화면에서 깨진 이미지 칸으로만 남으므로 막는다.
alter table public.assets drop constraint if exists assets_photo_paths_clean;
alter table public.assets add constraint assets_photo_paths_clean
  check (
    array_position(photo_paths, null::text) is null
    and array_position(photo_paths, '') is null
  );

-- 3) Storage — 자산 사진 버킷(비공개) ----------------------------------------
-- 회의실 사진(meeting-room-photos)은 공개 버킷이지만 그것은 사내 안내용 이미지라는 판단이었다.
-- 자산 사진에는 시리얼 명판·차량 번호판처럼 식별에 쓰이는 것이 함께 찍히므로 기본값(비공개)을
-- 따르고, 표시에는 단기 Signed URL을 쓴다(보안 게이트 §3 "버킷은 기본 비공개").
insert into storage.buckets (id, name, public)
values ('asset-photos', 'asset-photos', false)
on conflict (id) do nothing;

-- 조회·업로드 권한은 자산 원장(assets_mgmt_select/_insert/_update)과 같은 게이트를 쓴다.
-- 원장은 못 보는데 사진은 볼 수 있는(또는 그 반대) 상태를 만들지 않기 위해서다.
drop policy if exists asset_photo_objects_select on storage.objects;
create policy asset_photo_objects_select on storage.objects for select
  using (bucket_id = 'asset-photos' and app.can_read_workspace('management'));

drop policy if exists asset_photo_objects_insert on storage.objects;
create policy asset_photo_objects_insert on storage.objects for insert
  with check (bucket_id = 'asset-photos' and app.can_write_workspace('management'));

drop policy if exists asset_photo_objects_update on storage.objects;
create policy asset_photo_objects_update on storage.objects for update
  using (bucket_id = 'asset-photos' and app.can_write_workspace('management'))
  with check (bucket_id = 'asset-photos' and app.can_write_workspace('management'));
