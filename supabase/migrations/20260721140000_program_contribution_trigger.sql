-- =====================================================================
-- 기여 로그를 DB 트리거로 이관 (1단계) — 사업 원장 3종
--
-- 배경
--   지금까지 변동 이력(entity_contributions)은 화면이 손으로 남겨 왔다. 그 결과 세 가지가
--   구조적으로 어긋나 있다.
--     (1) 누락 — 기록 호출을 붙인 경로만 남는다. 사업 원장에서도 비활성화(useDeactivateProgram)는
--         호출이 없어 소프트 삭제가 이력에 전혀 남지 않았다.
--     (2) 비원자성 — 원장 쓰기와 로그 쓰기가 별개 요청이라, 앞은 성공하고 뒤는 실패할 수 있다.
--         게다가 호출부가 `.catch(() => {})`로 오류를 삼켜 실패가 드러나지도 않는다.
--     (3) 사후 검증 불가 — 로그가 없다는 사실이 '변경이 없었다'인지 '기록이 실패했다'인지 구분되지 않는다.
--
--   원장 자체에 트리거를 붙이면 셋이 한 번에 풀린다. 원장이 바뀌는 모든 경로가 같은 트랜잭션 안에서
--   기록되므로 누락도 중복도 생기지 않는다.
--
-- 적용 범위 — 사업 원장 3종(programs / ma_programs / project_programs)부터 시작한다
--   이 세 원장은 대량 업로드 경로가 없어 클라이언트가 source='upload'·batch_id를 남길 일이
--   없으므로, 트리거와 클라이언트 기록이 겹칠 여지가 없다. NETWORKS·STARTUP은 업로드 경로가
--   배치 메타를 클라이언트에서 남기고 있어 반드시 중복되므로, 업로드를 RPC로 감싼 뒤 합류시킨다
--   (후속 단계). MANAGEMENT·FUND·OFFICE·ADMIN은 애초에 기여 기록 경로가 없다.
--
-- 기록 규칙
--   INSERT                        → 'created'
--   deleted_at null → not null    → 'deactivated'  (종전에는 아예 기록되지 않던 행위)
--   그 외 실제 값 변경            → 'edited'       (updated_at만 달라진 행은 제외)
--   값이 하나도 안 바뀐 UPDATE는 기록하지 않는다 — 폼 재저장이 이력을 오염시키지 않도록.
--
-- 소유 워크스페이스: ac / mna / project · 데이터 등급: Internal
-- 접근 주체: 내부 사용자(임직원) · Scope: 워크스페이스 + 단건 사업
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260707150000_networks_contributions.sql(로그 원장·스탬프 트리거),
--       20260721130000_program_entity_key_split.sql(다형 키 분리)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 기록 함수 — 다형 키를 트리거 인자로 받아 원장 3종이 한 함수를 공유한다
--
-- SECURITY DEFINER인 이유
--   이 삽입은 사용자의 요청이 아니라 원장 변경의 부산물이다. 원장 쓰기가 이미 자기 RLS를
--   통과한 뒤이므로 로그에 별도의 권한 판정을 다시 물릴 이유가 없고, 오히려 로그 정책이
--   막아 이력만 비는 상태(=감사 공백)가 더 위험하다. 그래서 기록 자체는 무조건 성립시킨다.
--   행위자는 여전히 위조할 수 없다 — user_id는 이 함수가 아니라 기존 BEFORE 트리거
--   app.stamp_contribution_actor()가 현재 세션 사용자로 무조건 덮어쓴다(20260721120000).
--   함수 내부에서 별도 권한 검사를 하지 않는 것도 같은 이유다. 이 함수는 외부에 노출되지
--   않으며(GRANT EXECUTE 없음) 오직 원장 트리거로만 기동한다.
-- ---------------------------------------------------------------------
create or replace function app.log_program_contribution()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_entity_key text := TG_ARGV[0];
begin
  if TG_OP = 'INSERT' then
    insert into public.entity_contributions (entity_table, entity_id, action, source)
    values (v_entity_key, NEW.id, 'created', 'manual');
    return NEW;
  end if;

  -- 소프트 삭제 전환. 사유는 원장에 컬럼이 없어 note 없이 행위만 남긴다.
  -- (사유가 필요해지면 원장 직접 UPDATE 대신 RPC 경유로 바꿔야 한다 — 트리거는 사유를 알 수 없다.)
  if OLD.deleted_at is null and NEW.deleted_at is not null then
    insert into public.entity_contributions (entity_table, entity_id, action, source)
    values (v_entity_key, NEW.id, 'deactivated', 'manual');
    return NEW;
  end if;

  -- updated_at은 BEFORE UPDATE 트리거가 매번 갱신하므로 비교에서 뺀다.
  -- 이걸 빼지 않으면 '아무것도 바뀌지 않은 저장'도 전부 편집으로 기록된다.
  if (to_jsonb(OLD) - 'updated_at') is distinct from (to_jsonb(NEW) - 'updated_at') then
    insert into public.entity_contributions (entity_table, entity_id, action, source)
    values (v_entity_key, NEW.id, 'edited', 'manual');
  end if;

  return NEW;
end $$;

comment on function app.log_program_contribution() is
  '사업 원장(programs/ma_programs/project_programs) AFTER INSERT/UPDATE: 변동 이력 자동 기록. 다형 키는 트리거 인자(TG_ARGV[0])로 주입.';

-- ---------------------------------------------------------------------
-- 원장별 트리거 — 인자로 각자의 다형 키를 넘긴다
--   AC='program' / M&A='ma_program' / PROJECT='project_program'
--   (20260721130000에서 분리한 값. 프론트 ProgramWorkspaceConfig.entityKey와 동일해야 한다.)
-- ---------------------------------------------------------------------
drop trigger if exists trg_programs_contribution on public.programs;
create trigger trg_programs_contribution
  after insert or update on public.programs
  for each row execute function app.log_program_contribution('program');

drop trigger if exists trg_ma_programs_contribution on public.ma_programs;
create trigger trg_ma_programs_contribution
  after insert or update on public.ma_programs
  for each row execute function app.log_program_contribution('ma_program');

drop trigger if exists trg_project_programs_contribution on public.project_programs;
create trigger trg_project_programs_contribution
  after insert or update on public.project_programs
  for each row execute function app.log_program_contribution('project_program');
