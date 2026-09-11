-- =====================================================================
-- 원장 식별 규칙에 어긋나는 기존 행 정리 — 참조를 정본으로 옮기고 중복 행을 물리 삭제한다
--
-- 왜 지금 지우는가
--   다음 파일(20260911221000)이 사업자등록번호 유일 인덱스와 식별 트리거를 세운다. 유일
--   인덱스는 기존 중복이 남아 있으면 만들어지지 않으므로, 규칙보다 정리가 먼저다.
--
-- 왜 병합(merge_entity)이 아니라 삭제인가 (2026-09-11 사용자 지정)
--   병합은 중복 행을 `merged_into_id`로 남긴다 — 되돌릴 수 있지만 유일 인덱스가 살아있는
--   행만 보므로 병합만으로도 인덱스는 선다. 그래도 지우는 이유는 **이 행들이 업무 기록이
--   아니라 같은 파일로 같은 기업을 두 번(세 번) 등록한 그릇**이기 때문이다. 일곱 행 전부
--   같은 담당자가 같은 첨부 한 벌로 다시 등록했고, 명부·계정·투자·회의록 어디에도 걸려
--   있지 않다(2026-09-11 실측: program_participants·guest_identities·investments·
--   startup_managers·meeting_minute_links·entity_feedback 전부 0건). 물리 삭제 금지 원칙의
--   예외 기준("지워지는 것이 업무 기록이 아니라 담당자가 만든 그릇인가")에 그대로 걸린다.
--
-- 무엇을 옮기는가 — merge_entity와 같은 카탈로그를 같은 순서로 쓴다
--   · 다형 참조(app.merge_ref_tables): 자료·피드백·회의록 링크·명단 줄·게스트 매핑
--   · 하드 FK(app.merge_fk_columns): pg_constraint가 답한다(손 목록 금지)
--   손으로 표를 세지 않는 이유는 병합 재배선(20260909210000)과 같다 — 손 목록은 원장이
--   하나 늘어난 날 조용히 빠진다.
--
-- 무엇을 남기는가
--   · 첨부는 전부 정본으로 옮긴다(스토리지 실물이 딸려 있어 행을 지우면 아무도 못 찾는
--     파일이 남는다). 같은 파일이 두 번 올라간 것은 그대로 두 줄로 남으며, 어느 것을 지울지는
--     담당자가 화면에서 정한다 — 마이그레이션이 파일 이름만 보고 '같은 파일'이라 단정하면
--     내용이 다른 개정본을 지운다.
--   · 삭제하는 행의 스냅샷은 audit_logs.before_data에 통째로 남긴다(되돌릴 근거).
--   · 접근 로그(access_logs)는 그때의 사실이라 손대지 않는다.
--
-- 무엇을 함께 지우는가 — admin_hard_delete_entity(20260911050629)와 같은 목록
--   entity_contributions·entity_codes·notifications 중 지워지는 행을 가리키는 것.
--   존재하지 않는 행의 이력은 어느 화면도 열 수 없다.
--
-- 정본은 **먼저 만들어진 행**이다 — 뒤에 만든 행은 같은 파일로 다시 등록한 사본이고,
-- 앞 행에는 그 사이의 수정 이력(edited)이 붙어 있다. 사본에만 있는 값(연락처 등)은
-- 정본의 빈 칸에만 채운다(있는 값을 덮지 않는다).
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: startup / networks / mna (행마다 다르다)
--   · 데이터 등급: Personal (연락처 포함) — 스냅샷은 ADMIN만 읽는 audit_logs에 남는다
--   · 접근 주체: 마이그레이션(운영자). 새 정책·RPC 없음
--   · 감사 로그: 행마다 audit_logs 'LEDGER_HARD_DELETE' 1건
--   · 운영 영향: 삭제 대상 id로 열려 있던 북마크는 404가 된다(정본 id로 다시 찾는다)
--
-- 근거: 3_3_8_ledger_identity_dedup.md §7, 20260909210000(재배선 카탈로그),
--       20260911050629(하드 딜리트 동반 삭제 목록)
-- =====================================================================

do $cleanup$
declare
  -- 정본(keep)과 삭제(drop). 2026-09-11 실측으로 확정한 일곱 쌍(스타트업 4·셀러 2·네트워크 1).
  pairs constant jsonb := '[
    {"ledger":"startups",   "keep":"f408267d-ffce-4c4e-9c1a-7bd55cf4c459", "drop":"1954ed0c-eea8-4004-868e-02c20fd5e6ce", "why":"사업자등록번호 479-88-02430 중복(알투씨컴퍼니)"},
    {"ledger":"startups",   "keep":"f408267d-ffce-4c4e-9c1a-7bd55cf4c459", "drop":"4440d94e-d584-445b-bb30-932f7dbaaa84", "why":"사업자등록번호 479-88-02430 중복(알투씨컴퍼니2 — 이름만 다른 시험 등록)"},
    {"ledger":"startups",   "keep":"083c459a-4aec-4f30-8deb-ef3dd34d0488", "drop":"c1e2a2c2-792e-4edd-8fdc-c7ce23a5f638", "why":"사업자등록번호 없이 이름·대표자가 같은 기업(트루골프)"},
    {"ledger":"startups",   "keep":"083c459a-4aec-4f30-8deb-ef3dd34d0488", "drop":"e4f747a0-da63-45d6-a1f7-83010e790fa3", "why":"사업자등록번호 742-87-02461 중복(트루골프)"},
    {"ledger":"ma_sellers", "keep":"c80698b4-2c24-4138-a9a1-41e3e82c4260", "drop":"f46a7b32-289d-4f41-a110-c1143b1719dc", "why":"같은 스타트업(트루골프)에 연결된 셀러 2건"},
    {"ledger":"ma_sellers", "keep":"78fa7175-4aa6-4791-9faa-fc5c40347748", "drop":"2b47ad49-2cc9-484b-9e9d-0739790ef278", "why":"같은 스타트업(알투씨컴퍼니 — 정리 후 한 행)에 연결된 셀러 2건"},
    {"ledger":"networks",   "keep":"e16e536a-cf9d-4e64-b63f-30a30e73e937", "drop":"8ff3f9d1-29ba-4693-a5e5-b2e449764738", "why":"이름·이메일·연락처가 같은 사람(더미 데이터)"}
  ]'::jsonb;
  -- 정본의 빈 칸에만 채울 수 있는 열. 식별·상태·이력 열은 제외한다.
  skip_cols constant text[] := array[
    'id', 'created_at', 'created_by', 'updated_at', 'deleted_at', 'merged_into_id',
    'management_status', 'management_status_etc', 'pool_status', 'region_scope', 'is_provisional'
  ];
  p          jsonb;
  r          record;
  v_ledger   text;
  v_keep     uuid;
  v_drop     uuid;
  v_ws       text;
  v_type     text;
  v_snap     jsonb;
  v_keepsnap jsonb;
  v_hit      integer;
  v_rows     integer;
  v_col      text;
begin
  for p in select * from jsonb_array_elements(pairs) loop
    v_ledger := p ->> 'ledger';
    v_keep   := (p ->> 'keep')::uuid;
    v_drop   := (p ->> 'drop')::uuid;
    v_ws     := case v_ledger when 'startups' then 'startup' when 'networks' then 'networks' else 'mna' end;
    v_type   := case v_ledger when 'startups' then 'startup' when 'networks' then 'network'
                              when 'ma_sellers' then 'ma_seller' when 'ma_buyers' then 'ma_buyer' end;

    execute format(
      'select to_jsonb(x) from public.%I x where x.id = $1 and x.deleted_at is null and x.merged_into_id is null',
      v_ledger) into v_keepsnap using v_keep;
    execute format(
      'select to_jsonb(x) from public.%I x where x.id = $1',
      v_ledger) into v_snap using v_drop;

    if v_keepsnap is null then
      raise exception '정본 행이 살아 있지 않습니다: % %', v_ledger, v_keep;
    end if;
    if v_snap is null then
      raise notice '이미 없는 행이라 건너뜁니다: % %', v_ledger, v_drop;
      continue;
    end if;

    -- ── (a) 다형 참조를 정본으로 옮긴다 (merge_entity (d)와 같은 규칙) ──
    for r in select * from app.merge_ref_tables(v_ledger) loop
      if r.on_conflict = 'soft' then
        execute format(
          'update public.%I d set deleted_at = now()
            where d.%I = $1 and d.%I = $2 and d.deleted_at is null
              and exists (select 1 from public.%I p
                           where p.%I = $1 and p.%I = $3 and p.deleted_at is null and %s)',
          r.rel_name, r.type_col, r.id_col, r.rel_name, r.type_col, r.id_col,
          app.merge_conflict_join(r.conflict_cols)
        ) using r.type_value, v_drop, v_keep;
      elsif r.on_conflict = 'delete' then
        execute format(
          'delete from public.%I d
            where d.%I = $1 and d.%I = $2
              and exists (select 1 from public.%I p
                           where p.%I = $1 and p.%I = $3 and %s)',
          r.rel_name, r.type_col, r.id_col, r.rel_name, r.type_col, r.id_col,
          app.merge_conflict_join(r.conflict_cols)
        ) using r.type_value, v_drop, v_keep;
      elsif r.on_conflict = 'block' then
        -- 겹치면 멈춘다 — 명부 줄·계정 매핑은 지우는 일에 제 경로가 있다(실측 0건).
        execute format(
          'select count(*)::int from public.%I d
            where d.%I = $1 and d.%I = $2
              and exists (select 1 from public.%I p
                           where p.%I = $1 and p.%I = $3 and %s)',
          r.rel_name, r.type_col, r.id_col, r.rel_name, r.type_col, r.id_col,
          app.merge_conflict_join(r.conflict_cols)
        ) into v_hit using r.type_value, v_drop, v_keep;
        if v_hit > 0 then
          raise exception '정본과 겹치는 %가 있어 지울 수 없습니다: % %', r.rel_name, v_ledger, v_drop;
        end if;
      end if;
      execute format(
        'update public.%I set %I = $3 where %I = $1 and %I = $2',
        r.rel_name, r.id_col, r.type_col, r.id_col
      ) using r.type_value, v_drop, v_keep;
    end loop;

    -- ── (b) 하드 FK를 정본으로 옮긴다 (자기 참조 포함) ──
    for r in select * from app.merge_fk_columns(v_ledger) loop
      execute format('update public.%I set %I = $2 where %I = $1', r.rel_name, r.fk_col, r.fk_col)
        using v_drop, v_keep;
    end loop;

    -- ── (c) 사본에만 있는 값을 정본의 빈 칸에 채운다 ──
    -- 스키마 이동은 업무 행위가 아니다 — 기여 로그·수정일 트리거를 잠시 끈다(2026-09-06 교훈).
    execute format('alter table public.%I disable trigger user', v_ledger);
    for v_col in
      select c.column_name
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = v_ledger
         and c.column_name <> all (skip_cols)
    loop
      if v_snap -> v_col is not null and jsonb_typeof(v_snap -> v_col) <> 'null'
         and (v_keepsnap -> v_col is null or jsonb_typeof(v_keepsnap -> v_col) = 'null') then
        execute format(
          'update public.%I k set %I = d.%I from public.%I d where k.id = $1 and d.id = $2',
          v_ledger, v_col, v_col, v_ledger
        ) using v_keep, v_drop;
      end if;
    end loop;
    execute format('alter table public.%I enable trigger user', v_ledger);

    -- ── (d) 사라지는 행의 부속 기록 (admin_hard_delete_entity와 같은 목록) ──
    delete from public.notifications        where target_type = v_type and target_id = v_drop;
    delete from public.entity_codes         where entity_table = v_ledger and entity_id = v_drop;
    delete from public.entity_contributions where entity_table = v_ledger and entity_id = v_drop;
    if v_ledger = 'startups' then
      delete from public.startup_managers where startup_id = v_drop;
    end if;

    -- ── (e) 감사 기록: 무엇을 왜 지웠고 어디로 합쳤는가 ──
    insert into public.audit_logs (actor_user_id, action, changed_workspace, before_data, after_data, reason)
    values (
      null, 'LEDGER_HARD_DELETE', v_ws,
      jsonb_build_object('entity_key', v_ledger, 'entity_id', v_drop, 'row', v_snap),
      jsonb_build_object('merged_into', v_keep),
      '원장 식별 규칙 정리(3_3_8): ' || (p ->> 'why')
    );

    -- ── (f) 삭제 ──
    execute format('delete from public.%I where id = $1', v_ledger) using v_drop;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception '삭제 실패: % %', v_ledger, v_drop;
    end if;
    raise notice '지웠습니다: % % → 정본 %', v_ledger, v_drop, v_keep;
  end loop;
end $cleanup$;
