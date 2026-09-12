-- M&A 딜 중단 상태 + 오피스 누적 데이터 집계
--
-- 보안 게이트
--   · 소유 워크스페이스: mna / my-office
--   · 데이터 등급: Restricted(M&A 딜·거래상대). 등급 변화 없음
--   · 접근 주체: M&A 읽기 권한이 있는 내부 사용자. 기존 RLS를 그대로 적용한다.
--   · Scope 기준: ma_sellers·ma_buyers 전사 원장 중 활성(삭제·병합 제외) 행
--   · 감사 로그: enum 추가와 읽기 전용 집계 함수뿐이며 원장 쓰기 경로는 바꾸지 않는다.
--   · 운영 영향: program_status에 SUSPENDED를 추가한다. 기존 행 변환·정책 변경은 없다.

-- CANCELLED(착수 자체를 취소)와 SUSPENDED(진행하던 딜을 중단)는 서로 다른 사실이다.
-- 공용 enum에 값은 추가하되 화면 선택지는 M&A config에서만 연다.
alter type public.program_status add value if not exists 'SUSPENDED' after 'FINISHED';

comment on constraint ma_programs_no_proposal_status_check on public.ma_programs is
  'M&A는 제안 단계를 운용하지 않는다. 운영 상태 준비/진행/완료/중단/취소를 저장하며, 프론트 ProgramWorkspaceConfig.hasSuspendedStatus=true와 같은 규칙이다.';

-- SELLER·BUYER 타일은 생성자이거나 한 번이라도 변동 이력을 남긴 활성 행을 "내 누적"으로 센다.
-- SECURITY INVOKER를 명시해 두 원장과 entity_contributions의 기존 RLS가 호출자에게 그대로 걸린다.
create or replace function public.ma_party_ledger_counts(p_table text)
returns table(mine bigint, total bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
begin
  if p_table not in ('ma_sellers', 'ma_buyers') then
    raise exception '지원하지 않는 M&A 원장입니다.' using errcode = '22023';
  end if;

  return query execute format(
    $sql$
      select
        count(*) filter (
          where p.created_by = app.current_app_user_id()
             or exists (
               select 1
                 from public.entity_contributions c
                where c.entity_table = %L
                  and c.entity_id = p.id
                  and c.user_id = app.current_app_user_id()
             )
        )::bigint as mine,
        count(*)::bigint as total
      from public.%I p
      where p.deleted_at is null
        and p.merged_into_id is null
    $sql$,
    p_table,
    p_table
  );
end;
$fn$;

revoke all on function public.ma_party_ledger_counts(text) from public;
grant execute on function public.ma_party_ledger_counts(text) to authenticated;

comment on function public.ma_party_ledger_counts(text) is
  'M&A SELLER·BUYER 활성 원장의 내 누적(생성자 또는 기여자)과 전사 누적을 함께 센다. 허용 원장은 두 표로 고정하며 SECURITY INVOKER로 기존 RLS를 따른다.';
