-- 거래처 원장에는 반복해서 쓰는 식별·계좌 정보만 둔다. 사업자등록증(개인은 신분증)과
-- 통장사본은 지급 건마다 새로 받아 확인하며, 원장이나 장기 Storage에 보관하지 않는다.
--
-- Storage 파일을 SQL로 지우면 실제 오브젝트가 고아로 남으므로, 파일이 하나라도 있으면
-- 마이그레이션을 중단한다. 운영 반영 전 조회 결과는 0건이었다. 이후 파일이 생겼다면 먼저
-- Storage API로 비운 뒤 다시 적용해야 한다.
do $$
begin
  if exists (
    select 1
      from storage.objects
     where bucket_id = 'partner-docs'
  ) then
    raise exception
      'partner-docs 버킷에 파일이 남아 있습니다. Storage API로 비운 뒤 다시 적용하세요.';
  end if;
end;
$$;

-- 이전 클라이언트가 남아 있어도 새 증빙을 올리거나 열 수 없도록 접근 경로를 먼저 닫는다.
drop policy if exists partner_doc_objects_select on storage.objects;
drop policy if exists partner_doc_objects_insert on storage.objects;
drop policy if exists partner_doc_objects_update on storage.objects;

alter table public.trade_partners
  drop constraint if exists trade_partners_license_pair_chk,
  drop constraint if exists trade_partners_bankbook_pair_chk,
  drop column if exists license_path,
  drop column if exists license_name,
  drop column if exists bankbook_path,
  drop column if exists bankbook_name;

comment on table public.trade_partners is
  'MANAGEMENT 거래처 원장(코드·상호·구분·등록번호·계좌). 지급 상대의 단일 원천이며 NETWORKS vendors(외주 네트워크 마스터)와는 다른 축이다.';

-- 빈 partner-docs 버킷 메타데이터는 SQL로 지우지 않는다. Supabase는 Storage 메타데이터를
-- SQL로 삭제하면 실제 오브젝트가 고아가 될 수 있어 Storage API 사용을 요구한다. 위 정책을
-- 모두 걷었으므로 이 버킷에는 클라이언트 접근 경로가 없고 새 파일도 저장할 수 없다.
