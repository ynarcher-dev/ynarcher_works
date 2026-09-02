-- =====================================================================
-- 모듈 담당자를 사업 담당자 풀에 붙여 둔다 (AC·M&A·PROJECT 공용)
--
-- 무엇이 났나
--   모듈 담당자는 그 사업의 담당자 풀에 있는 사람만 될 수 있다(20260716160000의 트리거와
--   set_program_module이 함께 강제한다). 그런데 그 규칙은 **넣을 때만** 걸려 있었다.
--   사업 담당자 편성(set_program_staffing)은 풀을 전량 교체하므로 편성에서 빠진 사람의
--   모듈 담당 행은 그대로 남는다. 남은 순간부터 그 모듈은 **아무것도 저장할 수 없다** —
--   날짜 한 칸만 고쳐도 화면이 담당자 배열을 함께 보내고, 서버는 풀에 없는 사람을 보고
--   42501로 막는다. 실제로 운영에서 모듈 세팅 저장이 403으로 막혔고, 원인은 편성에서
--   빠진 담당자가 모듈에 남아 있던 것이었다.
--
--   한쪽에서만 지키는 것은 불변식이 아니다. 넣을 때 막았으면 뺄 때도 따라가야 한다.
--
-- 왜 '남겨 두고 검사만 느슨하게'가 아닌가
--   신규 추가분만 검사하면 규칙이 통과는 되지만, 그 사업의 담당자가 아닌 사람이 모듈
--   담당자로 서 있는 상태가 영구히 남는다. 목록이 사실을 말하지 않게 되고, 그 목록을 보고
--   일을 맡기는 사람이 생긴다. 배정을 지우는 쪽이 손실처럼 보이지만, 사업에서 손을 뗀
--   사람의 모듈 담당은 이미 뜻이 없는 행이다.
--
-- 왜 트리거인가 (RPC 세 벌에 각각 적지 않는다)
--   풀을 바꾸는 경로가 워크스페이스마다 하나씩 있고(set_program_staffing·set_ma_·set_project_),
--   앞으로 늘 그러리라는 보장이 없다. 불변식의 주인은 원장이어야 한다 — 기여 로그를 화면이
--   아니라 트리거가 남기는 것과 같은 이유다.
--
-- 왜 **지연(deferrable initially deferred)** 제약 트리거인가
--   편성 저장은 `delete 전량 → insert 전량`이다. 보통의 AFTER DELETE 트리거는 delete 직후에
--   돌아 **모든 담당자가 잠깐 사라진 순간**을 보고, 편성을 저장할 때마다 모듈 담당자를 전부
--   지워 버린다. 지연 트리거는 커밋 시점에 돌아 다시 들어온 사람을 함께 보므로, 정말로 빠진
--   사람만 남는다. 이 파일에서 가장 중요한 한 줄이다.
--
-- 트리거는 SECURITY INVOKER다
--   program_module_assignees에는 DELETE 정책이 있고(20260903100000), 그 조건은 '그 워크스페이스
--   쓰기 + 그 사업 접근'이다. 편성을 바꿀 수 있는 사람은 그 조건을 이미 만족하므로 DEFINER로
--   올릴 이유가 없다. 올리면 정책을 함수 안에 복제하게 되고 그 복제본이 곧 권한 구멍이 된다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 ws=ac/mna/project(행마다 모듈의 entity_key가 답한다). 등급 Internal.
--   · 접근 주체 변화 없음. 새 정책·GRANT·SECURITY DEFINER 없음(트리거 함수는 INVOKER).
--   · 물리 삭제: 있음. program_module_assignees는 순수 배정 junction이라 하드 DELETE가
--     정상 운영 행위다(20260716160000이 이미 그렇게 정의했고, set_program_module도 저장할
--     때마다 전량 교체한다). 업무 기록이 아니라 '누가 맡는가'의 현재 상태다.
--   · 되돌리기: 지워진 배정은 모듈 세팅에서 다시 지정하면 된다. 지워졌다는 사실은 모듈
--     카드의 '담당 미지정'이 말한다(같은 커밋의 화면 변경).
-- 근거: 20260715180000(set_program_staffing), 20260716160000(모듈 담당자 풀 제약),
--       20260903100000(원장 통합·배정 정책), 20260903101000(set_program_module)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 풀에서 빠진 사람의 모듈 담당을 거둔다
--     tg_argv[0]=entity_key(모듈 소속 판정), tg_argv[1]=풀 원장 이름.
-- ---------------------------------------------------------------------
create or replace function app.prune_module_assignees()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_key  text := tg_argv[0];
  v_pool text := tg_argv[1];
  v_still boolean;
begin
  -- 전량 교체 도중이었다면 커밋 시점엔 같은 사람이 다시 들어와 있다. 그때는 아무 일도
  -- 없었던 것이다 — 담당자 한 명의 기간 구간이 여러 줄일 수 있으므로 '한 줄이라도 남아
  -- 있는가'로 묻는다.
  execute format(
    'select exists (select 1 from public.%I where program_id = $1 and user_id = $2)', v_pool)
    into v_still using old.program_id, old.user_id;
  if v_still then return null; end if;

  delete from public.program_module_assignees a
   using public.program_modules m
   where a.program_module_id = m.id
     and m.entity_key = v_key
     and m.program_id = old.program_id
     and a.user_id = old.user_id;

  return null;
end;
$$;

comment on function app.prune_module_assignees() is
  '사업 담당자 풀에서 빠진 사람의 모듈 담당 배정을 거둔다. 지연 제약 트리거로만 호출되며(전량 교체 패턴 때문에 커밋 시점에 판정해야 한다), 커밋 시점에 풀에 남아 있으면 아무것도 하지 않는다.';

-- ---------------------------------------------------------------------
-- (2) 세 풀 원장에 지연 제약 트리거를 건다
-- ---------------------------------------------------------------------
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('program_managers',         'program'),
      ('ma_program_managers',      'ma_program'),
      ('project_program_managers', 'project_program')
    ) as t(pool, entity_key)
  loop
    if to_regclass('public.' || spec.pool) is null then continue; end if;
    execute format('drop trigger if exists trg_%s_prune_module_assignees on public.%I',
                   spec.pool, spec.pool);
    execute format(
      'create constraint trigger trg_%s_prune_module_assignees
         after delete on public.%I
         deferrable initially deferred
         for each row execute function app.prune_module_assignees(%L, %L)',
      spec.pool, spec.pool, spec.entity_key, spec.pool);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (3) 이미 생긴 고아 배정 정리
--     트리거는 앞으로를 지키고, 이 블록은 지금까지 쌓인 것을 한 번 거둔다. 둘 다 필요하다 —
--     트리거만 걸면 지금 막혀 있는 모듈은 계속 막혀 있다.
-- ---------------------------------------------------------------------
do $$
declare
  spec record;
  v_n   int;
begin
  for spec in
    select * from (values
      ('program_managers',         'program'),
      ('ma_program_managers',      'ma_program'),
      ('project_program_managers', 'project_program')
    ) as t(pool, entity_key)
  loop
    if to_regclass('public.' || spec.pool) is null then continue; end if;
    execute format($q$
      delete from public.program_module_assignees a
       using public.program_modules m
       where a.program_module_id = m.id
         and m.entity_key = %L
         and not exists (
           select 1 from public.%I pool
            where pool.program_id = m.program_id
              and pool.user_id = a.user_id)
    $q$, spec.entity_key, spec.pool);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise notice '% 기준 고아 모듈 담당 %건 정리', spec.entity_key, v_n;
    end if;
  end loop;
end $$;
