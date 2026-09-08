-- =====================================================================
-- [M&A] 셀러 퀵 리뷰 — 절에 붙는 이미지(회사 소개 · 제품·서비스)
--
-- 근거: 20260907230000_ma_seller_quick_review.sql
--       docs_planning/3_6_1_ma_seller_quick_review.md
--       선례: 20260730160000_asset_photos.sql (비공개 버킷 + 단기 Signed URL)
--       보안 게이트: docs/docs_dev/11_migration_security_gate.md
--
-- 퀵 리뷰의 원본 문서에는 서비스 화면 캡처·사업 구조도가 함께 인쇄된다. 그 그림은 옆의
-- 문장이 대신 말해 줄 수 없는 값이라(제품이 어떻게 생겼는지, 돈이 어디로 흐르는지) 문서를
-- 옮겨 담는 이 화면도 함께 들고 있어야 한다.
--
-- 저장 형태는 **경로 배열이고 자리는 절 안**이다 — `ma_sellers.quick_review`의 `intro.images`,
-- `products.images`. 별도 컬럼이나 테이블을 만들지 않는 이유는 퀵 리뷰의 저장 단위가 절
-- 하나이기 때문이다(절이 곧 AI 작성의 체크 단위이자 통째 교체 단위다). 이미지를 밖으로 빼면
-- 절 하나를 저장하는 일이 '문서 한 장 쓰기'에서 '문서 + 이미지 목록 동기화'가 된다.
--
-- 자료 관리(`attachments`)와 합치지 않는 이유도 같다. 그쪽은 이 레코드에 **딸린 파일 목록**이라
-- 파일명·업로더·크기·다운로드 로그가 필요한 반면, 여기 이미지는 문서의 **본문 일부**다 —
-- 어느 절 어느 자리에 서는지가 값의 일부이고 순서가 곧 표시 순서다. 자산 사진이 자료와
-- 갈린 근거(20260730160000)와 같은 판단이다.
--
-- 삭제는 배열에서 경로를 빼는 것으로 끝내고 Storage 오브젝트는 지우지 않는다(물리 삭제 금지).
-- 남은 오브젝트는 아무도 참조하지 않으며, 비공개 버킷이라 경로를 아는 사람도 권한 없이는
-- 열 수 없다.
--
-- 소유 워크스페이스: mna / 데이터 등급: Restricted / Scope: global
-- 접근 주체: 내부 임직원 중 mna 읽기 권한자. **외부 게스트 전면 차단** — 게스트에게는 mna
--   워크스페이스 권한이 없으므로 `app.can_read_workspace('mna')`가 그대로 막는다.
-- 감사 로그: 미대상. 매각 대상 기업의 자료 원본이 나가는 경로는 자료 관리(`attachments` +
--   material-download Edge Function)가 소유하며 그쪽이 `access_logs`를 적재한다. 여기 이미지는
--   담당자가 문서를 옮겨 적으며 본문에 끼워 넣은 그림이고, 화면 표시용 단기 Signed URL로만
--   열린다.
-- 새 테이블·RPC·SECURITY DEFINER 함수 없음. DELETE 정책 없음.
-- =====================================================================

-- 1) Storage — 퀵 리뷰 이미지 버킷(비공개) ------------------------------------
-- 공개 버킷을 쓰지 않는다. 모집 포스터(program-posters)가 공개인 것은 그것이 바깥에 뿌리려고
-- 만든 그림이기 때문이고, 여기 담기는 것은 매각을 검토 중인 기업의 내부 자료다 — 주소만
-- 알면 로그인 없이 열리는 자리에 둘 수 없다.
insert into storage.buckets (id, name, public)
values ('ma-quick-review-images', 'ma-quick-review-images', false)
on conflict (id) do nothing;

-- 조회·업로드 권한은 셀러 원장(ma_sellers_select/_insert/_update)과 **같은 게이트**를 쓴다.
-- 원장은 못 보는데 그 안의 그림은 볼 수 있는(또는 그 반대) 상태를 만들지 않기 위해서다.
drop policy if exists ma_quick_review_image_objects_select on storage.objects;
create policy ma_quick_review_image_objects_select on storage.objects for select
  using (bucket_id = 'ma-quick-review-images' and app.can_read_workspace('mna'));

drop policy if exists ma_quick_review_image_objects_insert on storage.objects;
create policy ma_quick_review_image_objects_insert on storage.objects for insert
  with check (bucket_id = 'ma-quick-review-images' and app.can_write_workspace('mna'));

-- 업로드가 같은 키에 다시 쓰이는 경로(upsert)를 화면이 쓰지는 않지만, 정책을 비워 두면
-- 그 시도가 정책 없음으로 막히는지 규칙으로 막히는지 구분되지 않는다.
drop policy if exists ma_quick_review_image_objects_update on storage.objects;
create policy ma_quick_review_image_objects_update on storage.objects for update
  using (bucket_id = 'ma-quick-review-images' and app.can_write_workspace('mna'))
  with check (bucket_id = 'ma-quick-review-images' and app.can_write_workspace('mna'));

-- 2) 원장 주석 ---------------------------------------------------------------
-- 컬럼 자체는 이미 있다(jsonb). 어디에 무엇이 들어가는지만 주석으로 남긴다 — 이 사실이
-- 코드에만 있으면 원장을 직접 여는 사람은 경로 문자열의 출처를 알 수 없다.
comment on column public.ma_sellers.quick_review is
  '퀵 리뷰 문서(jsonb). 최상위 키 하나가 절 하나이며 그것이 곧 저장·AI 작성의 단위다. '
  '`intro.images`·`products.images`는 ma-quick-review-images 버킷의 오브젝트 키 배열이고 '
  '배열 순서가 표시 순서다(삭제는 배열에서 빼는 것으로 끝내고 오브젝트는 보존한다). '
  '성장률·이익률·Net debt·요약재무 같은 파생값은 담지 않는다 — 표의 값에서 매번 계산된다.';
