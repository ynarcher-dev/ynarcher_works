-- =====================================================================
-- [MANAGEMENT/OFFICE] 반출 예약을 도입하지 않기로 확정 — 그 흐름의 기계를 재운다
--
-- 기획: docs_planning/3_7_2_management_assets.md · 3_1_2_office_asset_checkout.md
--
-- 2026-08-25에 반출대장 '화면'을 걷으면서 원장과 트리거는 남겼다. 근거는 "반출 관리를 앱으로
-- 되돌릴 필요가 생기면 화면만 다시 세우면 된다"였다. **2026-09-06에 반출 예약 기능을 도입하지
-- 않기로 확정했으므로 그 근거가 없어졌다.** 남겨 둘 이유가 사라진 기계는 남겨 두면 안 된다 —
-- 하루 전만 해도 requires_approval 컬럼을 지우지 못한 유일한 이유가 이 트리거였다.
--
-- **지우는 것과 재우는 것을 가르는 기준은 하나 — 업무 기록인가, 그 기록을 만들던 기계인가.**
--
--  * 기계(트리거 4종·함수 5종·assets.requires_approval)는 **지운다.** 부를 화면이 없고, 남으면
--    다음 스키마 변경마다 이것들을 피해 가야 한다. requires_approval은 켜진 행이 0건이다.
--  * 기록(asset_checkouts 14행)은 **지우지 않는다.** 실제로 물건이 나갔다 돌아온 사실이고
--    물리 삭제 금지 원칙의 대상이다. 표를 `_retired_asset_checkouts`로 개명해 운영에서 내리고
--    (NETWORKS 구 원장 11종과 같은 방식) 앱 롤(anon·authenticated)의 권한을 회수한다.
--    회수하는 이유는 읽는 화면이 없어서다 — 아무도 쓰지 않는 표에 전 직원 DML 권한이 열려 있는
--    것은 그 자체로 노출면이다. 기록을 볼 일은 SQL로 본다.
--
-- **notification_type enum의 checkout_* 3값은 지우지 않는다.** 이미 발송된 알림 6행이 그 값을
-- 쓰고 있고(그때의 사실이다), enum 값을 지우면 의존 객체를 재작성해야 한다. 화면의 라벨도
-- 그대로 둔다 — 지난 알림을 여는 사람에게 빈 문장을 보일 이유가 없다.
--
-- **`public.start_due_checkouts()`도 함께 지운다.** public 스키마 함수는 기본 EXECUTE가
-- PUBLIC이라 SECURITY DEFINER인 이 함수가 인증 사용자 누구에게나 열려 있었다. 부르는 곳은
-- 없고(스케줄러도 없다 — cron 확장 미설치) 실행되면 이제 없는 흐름의 상태를 바꾼다.
--
-- 소유 워크스페이스: management(자산 원장) / 데이터 등급: Internal
-- 접근 주체: 개명 후 앱 롤 접근 없음(service_role·postgres만)
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- 보안 게이트: 새 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음. 이 마이그레이션은
--   권한을 넓히지 않고 **좁히기만** 한다(함수 5종 제거, 앱 롤 DML 회수). 개명된 표의 RLS는
--   enable 상태 그대로 유지하고 정책도 남긴다 — 권한을 회수한 위에 정책까지 지우면, 나중에
--   권한을 되돌리는 순간 정책 없는 표가 되어 Default Deny가 아니라 전면 개방이 된다.
-- 멱등: drop ... if exists / to_regclass 가드 — 재실행해도 같은 결과다.
-- =====================================================================

-- 1) 반출 흐름 트리거 ---------------------------------------------------------
drop trigger if exists trg_asset_checkouts_notify on public.asset_checkouts;
drop trigger if exists trg_asset_checkouts_stamp on public.asset_checkouts;
drop trigger if exists trg_asset_checkouts_transition on public.asset_checkouts;
drop trigger if exists trg_asset_checkouts_zstock on public.asset_checkouts;

-- 2) 그 트리거들이 부르던 함수 -------------------------------------------------
-- 표를 걷을 때 함수가 따라 걷히지 않는다는 것은 2026-09-03에 배운 것이다(42P01이 PostgREST에서
-- 404로 나와 'RPC가 없다'로 보였다). 여기서는 반대로, 표를 남기고 함수를 먼저 지운다.
drop function if exists app.fanout_checkout_notifications();
drop function if exists app.stamp_validate_asset_checkout();
drop function if exists app.validate_asset_checkout_transition();
drop function if exists app.check_asset_stock();
drop function if exists public.start_due_checkouts();

-- 3) 유령 컬럼 ----------------------------------------------------------------
-- 2026-09-06 오전에 화면에서 걷었고(폼·표·일괄 설정·CSV·뷰), 이제 마지막 참조자였던
-- app.stamp_validate_asset_checkout()이 사라져 원장에서도 지울 수 있다. 켜진 행은 0건이다.
alter table public.assets drop column if exists requires_approval;

-- 4) 기록은 남기고 운영에서 내린다 ---------------------------------------------
do $$
begin
  if to_regclass('public.asset_checkouts') is not null then
    alter table public.asset_checkouts rename to _retired_asset_checkouts;
  end if;
end
$$;

revoke all on public._retired_asset_checkouts from anon, authenticated;

comment on table public._retired_asset_checkouts is
  '[퇴역 2026-09-06] 구 public.asset_checkouts — 2026-07-30~08-25에 운영한 반출 예약·승인·반납 기록 14행. 반출 예약 기능을 도입하지 않기로 확정하여 흐름 트리거·함수를 걷고 표는 기록 보존을 위해 개명만 했다(물리 삭제 금지). 앱 롤의 권한은 회수했고 RLS 정책은 남아 있다 — 권한을 되돌릴 일이 생기면 정책이 먼저 서 있어야 한다.';

comment on column public.assets.is_portable is
  'OFFICE 자산 현황(public.portable_assets)에 이 물건을 공개할지. 이름은 반출대장 시절의 것이며(2026-08-25 화면 폐지, 2026-09-06 기능 도입 취소) 이 값이 정하는 것은 임직원 전원에게 보일지 하나다. MANAGEMENT 자산 관리 폼의 ''OFFICE 자산 현황에 공개'' 스위치가 유일한 쓰기 경로다. 컬럼 개칭은 무중단 절차(새 컬럼 추가 → 양쪽 쓰기 → 프론트 전환 → 옛 컬럼 제거)가 필요해 후속으로 둔다 — 한 번에 바꾸면 DB 적용과 프론트 배포 사이에 자산 목록이 죽는 틈이 생긴다.';
