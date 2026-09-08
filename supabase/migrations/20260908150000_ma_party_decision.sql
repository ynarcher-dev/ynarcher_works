-- =====================================================================
-- M&A 거래상대 원장(BUYER·SELLER) — 진행여부 결정 칸
--
-- 배경: 이 원장들은 딜보다 먼저 쌓인다(20260907120000·160000). 그래서 목록에는 "아직 볼
--   것인지 정하지 않은 건"과 "보기로 한 건"과 "안 보기로 한 건"이 한데 서 있었고, 그 판단은
--   어디에도 저장되지 않아 매번 상세내용을 열어 메모를 읽어야 알 수 있었다.
--
-- **칸이 되는 기준은 종전과 같다** — 목록을 좁히거나 정렬하는 값만 칸이 되고 나머지 서술은
--   본문(overview_html)이 받는다. 진행여부는 정확히 전자다: 이 값 하나로 목록을 좁혀 보는
--   것이 이 칸을 만든 이유이며, "왜 그렇게 정했는가"는 여전히 본문과 변동 이력의 사유가 답한다
--   (수정은 update_entity를 경유하므로 결정을 바꾼 사유가 이력의 note로 남는다).
--
-- **두 원장에 함께 넣는다.** 사는 쪽에도 파는 쪽에도 "이 건을 진행할 것인가"라는 같은 판단이
--   서고, 화면은 이미 한 벌을 공유한다(features/mna/parties) — 한쪽에만 두면 그 화면이
--   설정 분기를 하나 더 갖게 되고, 그 분기는 '이 원장에는 왜 없는가'를 답하지 못한다.
--
-- **미결정은 값이 아니라 NULL이다.** 처음 등록하는 순간에는 아직 정한 것이 없고, '미결정'을
--   저장값으로 만들면 '아직 안 정함'과 '정하지 않기로 함'이 같은 글자가 된다(NETWORKS 구분의
--   '미지정'이 값이 된 것과는 사정이 다르다 — 거기서는 고르지 않기로 한 상태가 답이었다).
--   화면은 그 NULL을 '미결정'으로 세우고 필터도 그 축을 하나 갖는다.
--
-- **enum이 아니라 text + CHECK다.** 값 셋은 운영 중에 늘거나 줄 수 있고, enum 값은 지우면
--   의존 객체를 전부 재작성시킨다(module_type enum에서 이미 겪은 일이다). 사업 상태를
--   두 원장의 CHECK 제약이 함께 강제하는 것과 같은 처리다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: mna / 데이터 등급: Internal(우리 쪽 판단이며 개인정보가 아니다).
--   - 접근 주체: 내부 사용자만. 게스트는 mna 권한이 없어 원장 SELECT에서 그대로 막힌다.
--   - Scope: workspace 단위. 기존 정책(ma_*_select/insert/update)이 그대로 판정하며 이 칸을
--     위한 정책·헬퍼·RPC를 새로 만들지 않는다(칸 하나가 늘었을 뿐 접근 축이 바뀌지 않았다).
--   - 새 테이블·새 SECURITY DEFINER 함수·새 GRANT 없음. RLS는 이미 활성이다.
--   - 감사: 값 변경은 update_entity 경유라 entity_contributions에 사유와 함께 남는다.
--   - 운영 영향: 기존 행은 NULL(미결정)로 남는다 — 지난 행에 오늘의 판단을 심지 않는다.
--   - 운영 모듈(program_module_id)에 딸린 원장이 아니므로 app.module_external_record() 분류 대상 아님.
-- 근거: docs/docs_planning/3_6_workspace_ma.md
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['ma_buyers', 'ma_sellers'] loop
    execute format('alter table public.%I add column if not exists decision text', t);

    -- 값은 셋뿐이다. NULL은 '아직 정하지 않음'이라 제약이 허용한다.
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_decision_chk');
    execute format(
      'alter table public.%I add constraint %I check (decision is null or decision in (''PROCEED'', ''NOT_PROCEED'', ''HOLD''))',
      t, t || '_decision_chk'
    );

    execute format(
      'comment on column public.%I.decision is %L',
      t,
      '진행여부 결정 — PROCEED(진행)·NOT_PROCEED(미진행)·HOLD(보류). NULL은 아직 정하지 않음(화면 표기 ''미결정'')이며 저장값으로 만들지 않는다. 결정을 바꾼 사유는 이 칸이 아니라 변동 이력의 note가 답한다(update_entity 경유).'
    );
  end loop;
end $$;

-- 인덱스를 만들지 않는다.
--
-- 이 축은 목록의 좁힘 조건이고 정렬은 여전히 updated_at desc라, 도움이 되려면
-- (decision, updated_at desc) 복합이어야 한다. 그런데 두 원장은 한 화면에서 30건씩 읽는
-- 규모이고 값이 셋뿐이라 선택도가 낮아, 플래너는 이 인덱스를 두어도 대개 기존
-- idx_ma_*_updated_at을 그대로 쓴다. 쓰이지 않는 인덱스는 쓰기마다 비용만 남긴다 —
-- 건수가 쌓여 실제로 느려지는 날 그때의 쿼리 모양을 보고 만든다.
