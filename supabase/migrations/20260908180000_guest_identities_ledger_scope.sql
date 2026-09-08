-- =====================================================================
-- [외부 포털 확장 2/N] 인격 매핑을 그 원장을 읽을 수 있는 사람에게만 연다
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §7
--
-- 배경:
--   guest_identities의 SELECT 정책은 **내부 사용자 전원**이고, 그 근거가
--   20260905120000 파일 주석에 이렇게 적혀 있다:
--
--     이 표가 답하는 것은 "이 원장 행에 계정이 있는가"뿐이고
--     **그 사실은 명부 화면이 이미 보여 준다**
--
--   그 근거는 master_table이 startups·networks 둘뿐이라 성립한다. 둘 다 전사
--   공용 SSOT라 누구나 읽고, 그래서 "이 회사에 계정이 있다"는 새로운 사실이
--   아니었다.
--
--   **ma_sellers가 그 CHECK에 들어오는 순간 근거가 사라진다.** 회사 이름은
--   원장 RLS에 막혀 null로 오지만 master_table='ma_sellers'와 계정 이름·이메일은
--   그대로 나온다(users의 SELECT는 내부 전원에게 열려 있다 — 참가자 명부가 게스트
--   이름을 붙이려면 그래야 한다). 이메일 도메인만으로 **어느 회사가 매각 검토
--   중인지 드러난다.**
--
--   화면만 고치면 안 된다. 정책이 열려 있으면 PostgREST로 표를 직접 읽을 수 있고,
--   *UI에서 숨기는 것은 보안이 아니다*(개발 수칙).
--
-- **M&A 창구를 여는 마이그레이션보다 반드시 먼저 나가야 한다.** 순서가 뒤집히면
-- 그 사이에 만들어진 M&A 인격이 전 직원에게 보인 채로 존재한다.
--
-- 새로 막히는 것이 있는가 — 없다:
--   AC 명부(participantHooks)는 계정 유무를 묻기 전에 이미 startups·networks를
--   **직접 조회해** 회사명·대표·연락처를 붙인다. 그 원장을 못 읽는 사용자에게는
--   이미 그 칸들이 비어 있었으므로, 같은 기준으로 인격을 가리는 것은 두 조회의
--   답을 일치시키는 일이지 새로운 차단이 아니다.
--
-- guest_accounts_list는 고치지 않는다:
--   그 함수는 security invoker다. personas CTE가 guest_identities를 그냥 조회하므로
--   정책이 좁아지면 **함수의 시야도 함께 좁아진다** — 판정을 함수 본문에 복제하지
--   않는 것이 요점이다(복제본은 정책이 바뀌는 날 옛 규칙으로 답한다).
--   다만 그 목록은 여전히 게스트 계정 **전부**를 세우고 인격 칸만 빈다. 목록 자체를
--   원장 축으로 좁히는 것은 3_9_2 §6.2의 몫이며 별도 마이그레이션이다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest (판정은 대상 원장의 워크스페이스로 위임)
--   - 데이터 등급: Internal → **Restricted**로 올라간다. 이 표는 이제 "누가 우리와
--     어떤 종류의 관계를 맺고 있는가"를 답하며, M&A에서는 그 사실 자체가 기밀이다.
--   - 접근 주체: 내부 사용자 중 **그 원장을 읽을 수 있는 사람**. 게스트는 종전대로 전면 차단.
--   - Scope 기준: 워크스페이스 읽기 하나. 레코드 판정을 붙이지 않는 이유는 이 표가
--     답하는 것이 원장 행의 존재이지 그 내용이 아니고, 내용은 원장 자기 정책이 막기 때문이다.
--   - 감사 로그: 없음(조회 표이며 열람 자체는 감사 대상이 아니다 — 반출은 원장 쪽에서 걸린다).
--   - 운영 영향: SELECT만 좁아진다. 쓰기 경로는 종전대로 정책 없이 RPC 하나뿐이고,
--     그 RPC는 SECURITY DEFINER라 이 정책에 걸리지 않는다(발급은 계속 내부 전원).
--     **발급은 되는데 결과가 안 보이는 조합이 생긴다** — M&A 원장을 못 읽는 사람이
--     M&A 대상에 발급하는 경우인데, 애초에 그 대상을 고를 화면이 없으므로 실재하지 않는다.
--   - SECURITY DEFINER 신설: app.can_read_master_table(text) 1건.
--     DEFINER인 이유는 안에서 부르는 can_read_workspace가 이미 DEFINER이고
--     workspace_permissions를 읽어야 하기 때문이다. 인자를 그대로 매핑에만 쓰고
--     원장을 조회하지 않으므로 이 함수로 열리는 데이터는 없다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 다형 원장 키 → 읽기 권한
--
--     매핑 자체는 app.entity_key_workspace가 이미 갖고 있다(startups→startup,
--     ma_sellers·ma_buyers→mna, 그 밖→networks). 같은 사실을 두 곳에 적지 않는다.
--
--     **그런데 그 함수의 기본값은 'networks'다.** 매핑 함수에서는 옳은 기본값이지만
--     (다형 키 대부분이 네트워크 원장이다) **정책에서는 정반대다** — 모르는 값이
--     들어오면 NETWORKS를 읽을 수 있는 사람 전원에게 열린다. 그래서 여기서
--     **허용 목록을 앞에 세우고 모르는 값은 거짓으로 떨어뜨린다.**
--
--     원장을 새로 더하는 사람은 이 목록에 넣어야 한다. 빠뜨리면 조용히 열리는 것이
--     아니라 조용히 **닫힌다** — 보안 경계의 기본값은 그쪽이어야 한다.
-- ---------------------------------------------------------------------
create or replace function app.can_read_master_table(p_master_table text)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case
    when p_master_table in ('startups', 'networks', 'ma_sellers', 'ma_buyers')
      then app.can_read_workspace(app.entity_key_workspace(p_master_table))
    else false
  end;
$fn$;

revoke all on function app.can_read_master_table(text) from public;
grant execute on function app.can_read_master_table(text) to authenticated;

comment on function app.can_read_master_table(text) is
  '이 다형 원장 키의 행을 읽을 수 있는가. 매핑은 app.entity_key_workspace가 갖고 여기서는 허용 목록으로 **모르는 값을 거짓으로 떨어뜨린다** — 그 함수의 기본값(networks)은 매핑에서는 옳지만 정책에서는 조용히 여는 쪽이다. 원장을 더하면 이 목록에 넣을 것(빠뜨리면 닫힌다). 근거: 3_9_2 §7';

-- ---------------------------------------------------------------------
-- (2) 인격 매핑 SELECT — 그 원장을 읽을 수 있는 사람만
--
--     게스트 차단(not app.is_guest())은 그대로 둔다. 게스트에게는 이 표가 어떤
--     이유로도 열릴 일이 없다 — 자기 인격은 세션이 답한다.
-- ---------------------------------------------------------------------
drop policy if exists guest_identities_select on public.guest_identities;
create policy guest_identities_select on public.guest_identities for select
  using (
    app.current_app_user_id() is not null
    and not app.is_guest()
    and app.can_read_master_table(master_table)
  );

comment on column public.guest_identities.master_id is
  '원장 행 id. 이 행이 보이는가는 master_table이 정한다(app.can_read_master_table) — "이 회사에 계정이 있다"는 사실 자체가 M&A에서는 기밀이다. 근거: 3_9_2 §7';
