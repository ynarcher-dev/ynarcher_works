-- =====================================================================
-- [FUND] fund_list_totals — anon 실행 권한 회수
--
-- 20260803160000에서 `revoke all ... from public` + `grant ... to authenticated`로 닫았는데,
-- 배포 후 anon 키로 호출해 보니 200이 떨어졌다. anon은 public의 상속이 아니라 별도 역할이고
-- 이 스키마에는 함수 기본 권한(default privileges)이 anon에도 걸려 있어, public 회수가
-- anon의 직접 권한까지 걷지 못한다.
--
-- 실제 유출은 없었다 — SECURITY INVOKER라 funds RLS가 그대로 걸려 anon에게는 어떤 펀드도
-- 보이지 않고 합계가 전부 0으로 나온다. 그래도 열어 둘 이유가 없는 문이라 닫는다
-- (docs_dev/11_migration_security_gate.md: GRANT EXECUTE 대상은 필요한 역할로만 제한).
--
-- 보안 게이트: 권한 축소 전용. 신규 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
-- =====================================================================

revoke all on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid, integer
) from anon;
