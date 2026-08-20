-- =====================================================================
-- [OFFICE] 회의실 지점을 지사 원장으로 되돌린다 — meeting_places → branches
-- 설계: 회의실 예약 탭 = 지사(public.branches). 자산 반출대장과 같은 축을 쓴다.
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=office / 등급=Internal / 접근=내부 임직원(외부 게스트 제외)
--   - 새 테이블·새 RPC·새 Storage 정책·SECURITY DEFINER 함수 없음(FK 재연결 + 데이터 이관)
--   - meeting_rooms의 RLS(조회=app.is_internal_user, 쓰기=app.is_admin)는 그대로 유지된다
--   - 물리 삭제 없음: meeting_places 테이블은 남기되 더 이상 읽지 않는다(폐기 표시)
--   - 감사 로그: 사내 회의실 위치 목록(개인정보·다운로드·권한변경 아님)이라 미대상
-- 배경: 20260729190000_meeting_places.sql이 "지사를 추가하면 빈 탭이 생기고, 지사를
--       비활성화하면 그 자리의 예약이 사라진다"는 이유로 목록을 둘로 나눴다. 그 결과
--       같은 사무실이 두 원장에 각각 생겨 지사 정보·자산 반출대장과 회의실 예약이
--       서로 다른 지점 목록을 보게 됐다. 분리의 원인이던 두 문제는 원장이 아니라 화면이
--       푼다 — 예약 탭은 "활성 회의실이 한 대라도 있는 지사"만 그리므로 빈 탭이 생기지
--       않고, 비활성 지사의 회의실·예약 행은 그대로 보존된다(soft, 복구는 재활성화 한 번).
-- 근거: 20260728120000_meeting_rooms.sql(원 설계), 20260728150000_branches.sql(지사 원장)
-- =====================================================================

-- 1. 소속 컬럼 이름 되돌리기(place_id → branch_id) -----------------------
-- 값(uuid)은 건드리지 않는다. 실제 재연결은 아래 2~4에서 한다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'meeting_rooms' and column_name = 'place_id'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'meeting_rooms' and column_name = 'branch_id'
  ) then
    alter table public.meeting_rooms rename column place_id to branch_id;
  end if;

  if to_regclass('public.idx_meeting_rooms_place') is not null
     and to_regclass('public.idx_meeting_rooms_branch') is null then
    alter index public.idx_meeting_rooms_place rename to idx_meeting_rooms_branch;
  end if;
end $$;

-- 2. 지점 FK 해제 -------------------------------------------------------
-- 아래 3에서 branch_id 값을 지사 id로 바꾸므로 지점 FK를 먼저 떼어낸다.
alter table public.meeting_rooms
  drop constraint if exists meeting_rooms_place_id_fkey;
alter table public.meeting_rooms
  drop constraint if exists meeting_rooms_branch_id_fkey;

-- 3. 같은 이름의 지사가 이미 있으면 그쪽으로 옮긴다 -----------------------
-- 20260729190000은 지사 id를 그대로 복제해 지점을 만들었으므로 대부분은 id가 같아 이 단계가
-- 필요 없다. 분리 이후 ADMIN이 손으로 만든 지점(= 새 id)만 이름으로 지사를 찾아 붙인다.
-- 이름이 같은 지사가 여러 건이면 활성 → 정렬순으로 한 건만 고른다.
do $$
begin
  if to_regclass('public.meeting_places') is null then
    return;
  end if;

  update public.meeting_rooms r
     set branch_id = m.branch_id
    from (
      select p.id as place_id, pick.id as branch_id
        from public.meeting_places p
        cross join lateral (
          select b.id
            from public.branches b
           where b.deleted_at is null
             and lower(btrim(b.name)) = lower(btrim(p.name))
           order by b.is_active desc, b.sort_order, b.created_at
           limit 1
        ) pick
       where p.id <> pick.id
    ) m
   where r.branch_id = m.place_id;
end $$;

-- 4. 남은 지점은 같은 id의 지사로 승격 -----------------------------------
-- 3에서도 짝을 못 찾은 지점(이름이 다른 신설 지점)은 회의실이 걸려 있을 때만 지사로 만든다.
-- id를 그대로 재사용하므로 meeting_rooms.branch_id는 한 건도 옮기지 않아도 유효해진다.
-- 주소·전화·상주인력은 비운 채 만들고 MANAGEMENT '지사 관리'에서 채운다.
do $$
begin
  if to_regclass('public.meeting_places') is null then
    return;
  end if;

  insert into public.branches (id, name, sort_order, is_active, created_by, created_at, deleted_at)
  select p.id, p.name, p.sort_order, p.is_active, p.created_by, p.created_at, p.deleted_at
    from public.meeting_places p
   where exists (select 1 from public.meeting_rooms r where r.branch_id = p.id)
     and not exists (select 1 from public.branches b where b.id = p.id)
  on conflict (id) do nothing;
end $$;

-- 5. 지사 FK 재연결 ------------------------------------------------------
alter table public.meeting_rooms
  add constraint meeting_rooms_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

create index if not exists idx_meeting_rooms_branch
  on public.meeting_rooms (branch_id, sort_order, name);
drop index if exists public.idx_meeting_rooms_place;

-- 6. 지점 원장 폐기 표시 --------------------------------------------------
-- 물리 삭제하지 않는다(운영 규칙: soft). 읽는 코드가 없어졌음을 코멘트로 못박아 둔다.
comment on table public.meeting_places is
  '[폐기 2026-08-20] 회의실 지점 원장. 회의실 소속은 지사 원장(public.branches)으로 되돌렸다 '
  '— 20260820150000_meeting_rooms_rejoin_branches.sql. 조회·쓰기 코드 없음(이력 보존용).';

comment on column public.meeting_rooms.branch_id is
  '소속 지사(public.branches). 지사 정보·자산 반출대장과 같은 원장을 쓴다 — 세팅=MANAGEMENT 지사 관리, '
  '회의실 자체(운영시간·슬롯)는 ADMIN 회의실 관리가 소유한다.';

comment on table public.branches is
  '전사 지사 원장(지사명·주소·전화번호·상주인력). 세팅=MANAGEMENT 지사 관리, '
  '조회=OFFICE 지사 정보·자산 반출대장·회의실 예약 탭. 쓰기=admin 전용';
