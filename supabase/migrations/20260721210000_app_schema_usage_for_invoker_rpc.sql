-- =====================================================================
-- INVOKER RPC가 app 헬퍼를 호출할 수 있도록 app 스키마 USAGE 부여
--
-- 증상
--   update_entity / deactivate_entity / reassign_entity / merge_entity /
--   upload_* 호출이 전부 42501 → HTTP 403. 함수도 있고 EXECUTE 권한도 있는데 막혔다.
--
-- 원인
--   이 RPC들은 의도적으로 SECURITY INVOKER다(각 원장 RLS가 그대로 판정하도록).
--   따라서 본문에서 부르는 app.has_contribution_trigger()·app.insert_entity_row()도
--   호출자 권한으로 해석되는데, authenticated에게는 app 스키마 USAGE가 없었다.
--   함수 단위 EXECUTE는 20260721160000에서 부여했지만, 스키마 USAGE가 없으면 이름 해석
--   단계에서 먼저 막힌다 — 그래서 '권한은 줬는데 권한이 없다'로 보였다.
--
--   RLS 정책 안의 app.is_admin() 등이 지금까지 멀쩡했던 것은 성질이 다르기 때문이다.
--   정책 표현식의 함수는 이미 OID로 굳어 있어 스키마 이름 해석을 거치지 않는다.
--   즉 이 결함은 '평문으로 app.x()를 부르는' INVOKER RPC에만 나타난다.
--
-- 왜 USAGE 부여가 안전한가
--   PostgREST에 노출된 스키마는 public뿐이라, USAGE를 줘도 클라이언트가 app 함수를
--   REST로 부를 수 있게 되지는 않는다. 늘어나는 것은 SQL로 직접 붙는 주체의 접근인데
--   그쪽(service_role·postgres)은 이미 상위 권한이다. 개별 함수의 EXECUTE는 종전 그대로다.
--
--   대안이었던 '헬퍼를 public으로 옮기기'는 오히려 나쁘다 — app.insert_entity_row가
--   PostgREST RPC로 노출되어 임의 원장 INSERT 진입점이 하나 더 생긴다.
--   'RPC를 DEFINER로 바꾸기'는 각 원장 RLS를 함수 안에 복제하게 되므로 규약 위반이다.
--
-- 소유 워크스페이스: 공통 · 데이터 등급: Internal · 접근 주체: 내부 사용자(임직원)
-- Scope: 스키마 USAGE만(객체 권한 변경 없음)
-- 근거: docs/docs_dev/11_migration_security_gate.md, 20260721160000(INVOKER RPC 규약)
-- =====================================================================

grant usage on schema app to authenticated;

comment on schema app is
  '내부 헬퍼 스키마. PostgREST에 노출되지 않는다(REST 진입점은 public 뿐). authenticated에는 USAGE만 있고 실행 가능 여부는 함수별 EXECUTE가 판정한다.';
