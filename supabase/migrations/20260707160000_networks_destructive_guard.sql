-- =====================================================================
-- [대용량 업로드 Phase 2 슬라이스4-1] 파괴적 작업 RLS 가드(트리거)
-- - 공동 관리 모델: 필드 수정은 공용(networks write)이되, 되돌리기 어려운 작업
--   (비활성화=deleted_at 설정, 병합=merged_into_id 설정)은 기여자 또는 admin만 허용한다.
--   → 남이 쌓은 기여를 제3자가 통째로 날리는 것을 서버에서 차단(UI 숨김은 보안 아님).
-- - 기여 기록이 없는 레코드(레거시/작성자 미상)는 잠금 방지를 위해 공용 폴백
--   (app.is_entity_contributor 내부 처리).
-- - 미분류(others)는 분류 전 임시 저장소(공용 triage)이므로 가드에서 제외한다.
-- - 구분 변경 이동은 소스도 soft-delete하는데, 앱(useMoveEntity)이 이동 시 소스에 기여를
--   먼저 기록하므로 이동자는 기여자가 되어 통과한다(순수 비활성화는 미기록 → 차단).
-- 근거: 20260707150000_networks_contributions.sql(is_entity_contributor)
-- =====================================================================

create or replace function app.guard_network_destructive()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  -- 비활성화(deleted_at 신규 설정) 또는 병합(merged_into_id 신규 설정) 시에만 기여자 검사.
  if (OLD.deleted_at is null and NEW.deleted_at is not null)
     or (OLD.merged_into_id is null and NEW.merged_into_id is not null) then
    if not app.is_entity_contributor(TG_TABLE_NAME, OLD.id) then
      raise exception '이 작업(비활성화/병합)은 기여자 또는 관리자만 가능합니다.'
        using errcode = '42501';
    end if;
  end if;
  return NEW;
end $$;

-- 8종 실카테고리 테이블에만 적용(others 제외).
do $$
declare t text;
begin
  foreach t in array array['experts','van','investors','corporates','institutions','universities','vendors','etc']
  loop
    execute format('drop trigger if exists trg_%1$s_destructive_guard on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_destructive_guard before update on public.%1$s '
      || 'for each row execute function app.guard_network_destructive();', t);
  end loop;
end $$;
