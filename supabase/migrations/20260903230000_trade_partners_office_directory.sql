-- =====================================================================
-- [OFFICE] 거래처 조회면 — 내부 임직원이 읽는 가려진 한 벌
--
-- 기획: docs/docs_planning/3_7_4_management_partners.md §12 / 3_1_workspace_hub.md §1.10
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=management(원장) / 조회면 소비 ws=office
--   등급: 원장은 Restricted+Personal, 이 조회면은 Internal(가려진 값만 나간다)
--   접근 주체: 내부 임직원(외부 게스트 전면 차단) / Scope=global
--   신규 뷰 1종. 새 테이블·RPC·버킷·DELETE 정책 없음. 원장 RLS는 그대로 management다.
--   감사 로그: 미대상 — 파일도 원본 계좌번호도 이 조회면으로 나가지 않는다.
--
-- 왜 뷰인가:
--   OFFICE에서 필요한 것은 "이 거래처가 등록되어 있는가"이지 "어느 계좌로 보내는가"가 아니다.
--   그래서 원장의 SELECT 정책을 넓히지 않는다 — 넓히면 화면에서 가려도 행 자체는 나가므로,
--   PostgREST를 직접 부르는 사람에게는 계좌번호가 그대로 열린다. **화면에서 숨기는 것은 보안이
--   아니다**(docs_dev 개발 수칙). 가리는 일을 서버에서 하려면 나가는 컬럼 자체가 달라야 한다.
--
--   그래서 이 뷰는 호출자 권한이 아니라 소유자 권한으로 돌고(security_invoker = false),
--   누가 읽을 수 있는지는 본문의 `app.is_internal_user()` 한 줄이 판정한다. 뷰에는 RLS를 걸 수
--   없으므로 그 판정이 곧 정책이며, 여기서 나가는 컬럼 목록이 곧 노출 범위다.
--
-- 가리는 기준(사용자 확정 2026-09-03):
--   * 계좌번호 — 뒤 4자리만. 이체는 경영지원이 하고, 그 밖의 사람에게 필요한 것은 "계좌가
--     등록되어 있다"는 사실과 통장을 대조할 마지막 네 자리뿐이다.
--   * 개인 거래처의 생년월일 — 연도만. 개인정보이며 업무상 필요한 것은 동명이인을 가르는 정도다.
--   * 법인 사업자등록번호 — 그대로 둔다. 세금계산서에 찍히는 공개 정보다.
--   * 증빙 서류 — 컬럼 자체를 넣지 않는다. 목록에 없는 값은 새지 않는다.
-- =====================================================================

drop view if exists public.trade_partners_directory;

create view public.trade_partners_directory
with (security_invoker = false) as
select
  p.id,
  p.code,
  p.name,
  p.partner_type,
  -- 법인은 원본, 개인은 연도 4자리만. 화면은 자릿수를 보고 표기를 정한다(`1990-**-**`).
  case
    when p.partner_type = 'CORPORATE' then p.registration_no
    else left(p.registration_no, 4)
  end as registration_no,
  p.bank_code,
  -- 하이픈 위치가 은행마다 달라 숫자만 남긴 뒤 뒤 4자리를 뗀다. 계좌가 없으면 null이다.
  right(regexp_replace(p.account_no, '\D', '', 'g'), 4) as account_no_last4,
  p.account_holder,
  p.is_active,
  p.updated_at
from public.trade_partners p
where p.deleted_at is null
  and app.is_internal_user();

comment on view public.trade_partners_directory is
  'OFFICE 거래처 조회면. 원장(trade_partners)은 management 전용이고 이 뷰가 내부 임직원에게 가려진 한 벌을 낸다(계좌번호 뒤 4자리, 개인 생년월일은 연도만, 증빙 서류 없음). security_invoker=false이므로 접근 판정은 본문의 app.is_internal_user()가 한다. 근거: 20260903230000';

-- 익명(anon)에게는 주지 않는다. 로그인한 사용자 중 내부 임직원인지는 뷰 본문이 다시 가린다.
revoke all on public.trade_partners_directory from public;
grant select on public.trade_partners_directory to authenticated;
