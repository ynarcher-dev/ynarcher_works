-- =====================================================================
-- 병합 재배선 카탈로그에 **M&A 두 원장의 회의록 링크**를 더한다 — 20260909210000 수습
--
-- 무엇을 놓쳤나
--   앞 마이그레이션은 `meeting_minute_links`의 대상 키를 스타트업·네트워크 둘로만 적었다.
--   근거로 삼은 것은 최초 CHECK 제약(20260825150000)이었는데, 그 뒤 **M&A 두 원장이 이미
--   대상으로 들어와 있었다**(20260907130000이 `ma_buyer`, 20260907160000이 `ma_seller`).
--
--   그래서 셀러·바이어를 병합하면 그 원장의 회의록 링크만 사라진 행을 계속 가리켰다.
--   화면에서는 회의록에 걸린 이름을 눌러도 열 수 없는 상태가 된다.
--
-- 이 실수가 말해 주는 것
--   **다형 참조 카탈로그는 손으로 적는 목록이라 반드시 이런 식으로 뒤처진다.** 참조 대상이
--   늘어난 마이그레이션(20260907130000)은 이 카탈로그를 몰랐고, 알 방법도 없었다. FK가 아닌
--   참조를 새로 열 때 카탈로그를 함께 여는 일은 사람이 기억하는 수밖에 없으므로, 그 사실을
--   `app.merge_ref_tables`의 주석과 이 파일이 함께 남긴다.
--
--   앞 마이그레이션의 정의를 고치지 않고 새 파일로 내는 이유는 그것이 이미 적용됐기
--   때문이다 — 적용된 파일을 고치면 그 정의는 다시 실행되지 않아, **파일은 맞는데 DB는 틀린**
--   상태가 조용히 남는다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: mna
--   · 데이터 등급: Internal (돌려주는 것은 표 이름과 키 이름뿐이다)
--   · 접근 주체: 내부 사용자만(authenticated). 실제 이동은 merge_entity가 하고 INVOKER다
--   · Scope 기준: global
--   · 감사 로그: 대상 아님(카탈로그 조회 함수 하나를 다시 정의한다)
--   · 운영 영향: M&A 병합이 회의록 링크를 함께 옮기게 된다. 종전 병합으로 이미 끊긴 링크는
--     되돌리지 않는다 — 병합이 일어난 적이 없어 대상이 없다(원장이 어제 열렸다)
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블·정책·RPC 없음 / SECURITY DEFINER 없음
--   · `set search_path = app, public` 유지 / 멱등(create or replace)
--
-- 근거: 20260909210000(재배선), 20260907130000·20260907160000(M&A 회의록 링크 개방)
-- =====================================================================

create or replace function app.merge_ref_tables(p_ledger text)
returns table (
  rel_name      text,
  type_col      text,
  id_col        text,
  type_value    text,
  conflict_cols text[],
  on_conflict   text
)
language sql
stable
set search_path = app, public
as $$
  select v.rel_name, v.type_col, v.id_col, v.type_value, v.conflict_cols, v.on_conflict
    from (values
      -- 자료. 이 원장의 소유물 중 가장 잃으면 안 되는 것이다(스토리지 실물이 딸려 있다).
      -- 유일 제약이 없다 — 같은 회사에 자료 여럿이 정상이므로 겹침이 성립하지 않는다.
      ('attachments', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        null::text[], 'move'),
      -- 코멘트·피드백. 같은 이유로 겹침이 성립하지 않는다(두 사람이 각각 쓴 글이다).
      ('entity_feedback', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        null::text[], 'move'),
      -- 회의록 상호참조 — **네 원장이 모두 대상이다**(이 파일이 고치는 자리).
      -- `unique (minute_id, target_type, target_id)`가 있고 소프트 삭제가 없어 'delete'다:
      -- 정본에 같은 회의록이 이미 걸려 있으면 중복 링크는 아무 사실도 더하지 않는다.
      ('meeting_minute_links', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        array['minute_id'], 'delete'),
      -- 참가자 명단. 한 사업에 같은 원장 행은 한 줄이고 소프트 삭제 원장이라, 겹치면 중복 쪽
      -- 줄을 접는다(다시 담을 수 있다).
      ('program_participant_entries', 'master_table', 'master_id', p_ledger,
        array['entity_key', 'program_id'], 'soft'),
      -- GUEST 명부. 빼는 일에 제 경로(따라쓰기 확인 + 감사 로그)가 있어 병합이 대신하지 않는다.
      ('program_participants', 'master_table', 'master_id', p_ledger,
        array['entity_key', 'program_id'], 'block'),
      -- 게스트 계정 매핑. 한 원장 행에 사람마다 한 줄이며(3_9_2), 두 행에 같은 사람이 걸려
      -- 있으면 어느 계정이 살아남는가는 사람이 정할 일이다(ADMIN 축).
      ('guest_identities', 'master_table', 'master_id', p_ledger,
        array['user_id'], 'block')
    ) as v(rel_name, type_col, id_col, type_value, conflict_cols, on_conflict)
   where v.type_value is not null
     -- 원장이 늘어도 표가 실제로 있을 때만 훑는다(마이그레이션 순서 무관).
     and to_regclass('public.' || v.rel_name) is not null;
$$;

comment on function app.merge_ref_tables(text) is
  '중복 병합에서 정본으로 옮길 다형 참조 표 목록. FK가 아니라 문자열 키라 pg_constraint가 모르므로 선언한다 — **다형 참조를 새로 열면 여기를 함께 열어야 하고, 빠뜨리면 병합 후 그 참조만 사라진 행을 가리킨다**(20260909210000이 M&A 회의록 링크를 빠뜨려 이 파일이 수습했다). 겹침 판정 키(conflict_cols)를 함께 들며, 그 키가 없으면 겹침이 성립하지 않는다. on_conflict가 block인 표는 겹치면 병합을 거절한다 — 지우는 일에 제 경로가 있는 원장들이다.';

grant execute on function app.merge_ref_tables(text) to authenticated;
