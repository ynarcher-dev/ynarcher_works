-- =====================================================================
-- M&A SELLER 퀵 리뷰 (public.ma_sellers.quick_review) + AI 작성 쓰기 게이트 (2026-09-07)
--
-- 배경: 셀러 한 곳을 소개하는 문서(퀵 리뷰)는 지금까지 파워포인트·워드로 따로 만들어졌다.
--   원장에는 그 문서를 담을 자리가 없어, 같은 기업의 사실이 파일마다 갈렸고 어느 것이 최신인지
--   답할 근거가 없었다. STARTUP의 'AI 작성하기'와 같은 계약으로 원장에 담는다 —
--   **AI는 초안을 만들 뿐 저장은 언제나 사람이 한다.**
--
-- 왜 컬럼 하나(jsonb)인가:
--   퀵 리뷰는 일곱 절이고 각 절이 이 원장 밖에서 쓰이지 않는다. 절마다 칸을 파면
--   `ma_sellers`가 서른 칸 넘게 늘어나면서 목록·폼·정책이 전부 그 칸들을 알아야 하고,
--   절을 하나 더하는 날 마이그레이션이 또 필요하다. **목록을 좁히거나 정렬하는 값만 칸이
--   된다**는 이 원장의 기준(20260907160000)에 퀵 리뷰의 어느 절도 해당하지 않는다.
--
--   절을 표로 빼지 않는 이유도 같다 — 연도별 손익 다섯 줄은 이 셀러의 문서 안에서만 뜻이 있고
--   (다른 셀러와 세로로 견주는 자리가 없다), 표로 빼면 저장이 '문서 한 장'이 아니라 '행 다섯
--   건 동기화'가 되어 지운 연도를 지우는 일까지 화면이 떠안는다.
--
-- **AI 작성의 체크 단위가 곧 이 jsonb의 최상위 키다.** 저장이 카드 하나에 키 하나(통째 교체)라
--   체크되지 않은 절은 그 키를 건드리지 않으면 그만이다. STARTUP이 '카드 하나에 컬럼 하나'로
--   같은 규칙을 세운 것과 같고, 그래서 병합 규칙도 그쪽 것을 그대로 쓴다.
--
-- **파생값은 담지 않는다.** 성장률·이익률·Net debt는 표에 있는 값으로 계산되는 것이라 적어
--   두면 원본을 고쳤을 때 그 칸만 옛 값으로 남는다(startups의 대표 지분율·특허 건수를 칸으로
--   만들지 않은 것과 같은 판단). '주요내용'의 요약재무도 마찬가지로 담지 않는다 — 재무 절의
--   가장 최근 회계연도를 화면이 되읽는다. 같은 숫자를 두 절에 적으면 한쪽만 고쳐 어긋난다.
--
-- **금액 단위는 백만원 하나다.** 문서가 '억'으로 읽히는 자리(요약재무)도 저장은 백만원이고
--   화면이 단위를 머리글에 한 번 적는다 — 단위가 절마다 갈리면 같은 컬럼의 숫자가 어디서
--   적혔는지에 따라 다른 뜻을 갖는다(이 원장이 available_funds를 원 단위 하나로 저장하고
--   목록에서만 백만원으로 보이는 것과 같은 규칙).
--
-- 바이어에는 두지 않는다(2026-09-07 사용자 지정): 퀵 리뷰는 '파는 회사를 소개하는 문서'라
--   사는 쪽에서는 주주구성·Valuation·투자 포인트가 대부분 빈다. 필요해지는 날 같은 컬럼을
--   ma_buyers에도 더하고 화면 설정(MaPartyConfig)의 스위치만 켠다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: mna / 데이터 등급: Internal(퀵 리뷰 본문에 개인정보 칸을 두지 않는다.
--     담당자·이메일은 종전대로 별도 칸이고 마스킹 정책 'mna.sellers'가 그대로 적용된다).
--   - 접근 주체: 내부 사용자만. 게스트는 mna 권한이 없어 can_read/write_workspace('mna')에서
--     그대로 막힌다. 새 컬럼은 기존 ma_sellers 정책의 적용을 그대로 받는다.
--   - Scope: workspace 단위(딜에 매이지 않는 원장이라 program 스코프를 쓰지 않는다).
--   - 새 테이블 없음 / 새 RLS 정책 없음 / DELETE 정책 없음(soft delete 그대로).
--   - 새 RPC 둘(can_write_ma_seller / can_create_ma_seller)은 **판정 결과 boolean만** 돌려주는
--     읽기 전용 창구다. 새 권한을 주지 않는다 — 이미 알 수 있는 사실(수정 버튼이 뜨는가)을
--     한 번에 답할 뿐이고, 거짓으로 답해 봐야 실제 저장은 여전히 RLS가 막는다.
--   - SECURITY DEFINER 함수는 search_path 고정 + authenticated 한정 grant.
--   - 감사 로그: 이 두 RPC는 판정만 하므로 대상 아님. 실제 자료 반출은 Edge Function이
--     파일마다 access_logs에 남기며, 적재 실패 시 모델을 부르지 않는다(3_3_5 §8.2와 같은 규약).
--   - 운영 모듈(program_module_id)에 딸린 원장이 아니므로 app.module_external_record() 분류 대상 아님.
-- 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
-- =====================================================================

alter table public.ma_sellers
  add column if not exists quick_review jsonb;

-- 값의 모양을 최소한으로 잠근다 — 최상위가 객체인지만 본다.
-- 절 안쪽까지 CHECK로 잠그지 않는 이유는 그 규격이 화면·Edge Function과 함께 자라기 때문이다.
-- 제약이 규격을 앞지르면 절을 하나 늘릴 때마다 마이그레이션이 먼저 나가야 하고, 그 사이
-- 화면은 저장 자체가 막힌다. 값의 옳고 그름은 저장 전에 사람이 보고, AI 초안은 서버의
-- 정규화가 규격 밖 값을 걷어 낸다.
alter table public.ma_sellers
  drop constraint if exists ma_sellers_quick_review_object_chk;
alter table public.ma_sellers
  add constraint ma_sellers_quick_review_object_chk
  check (quick_review is null or jsonb_typeof(quick_review) = 'object');

comment on column public.ma_sellers.quick_review is
  '퀵 리뷰 문서(절 7종: summary·basics·intro·products·financials·valuation·highlights). 최상위 키 하나가 AI 작성의 체크 단위이자 저장 단위(통째 교체)다. 성장률·이익률·Net debt·요약재무는 담지 않는다 — 표에 있는 값에서 계산되는 파생값이라 적어 두면 원본을 고쳤을 때 그 칸만 옛 값으로 남는다. 금액 단위는 백만원 하나이며 화면이 머리글에 한 번 적는다.';

-- ---------------------------------------------------------------------
-- AI 작성 쓰기 게이트 — 정책이 답하던 물음에 이름을 준다.
--
-- 'AI 작성하기'는 그 셀러의 첨부 자료를 외부 AI(Gemini)로 보낸다. 결과는 초안일 뿐 DB를
-- 건드리지 않지만 **자료가 밖으로 나가는 행위**이고 화면의 '수정'과 같은 무게의 쓰기 의도라,
-- 서버가 호출자의 쓰기 자격을 다시 물어야 한다(UI 숨김은 보안이 아니다).
--
-- 판정식을 TypeScript로 옮겨 적지 않는다 — 그 복제본이 곧 권한 구멍이다(정책이 바뀌는 날
-- 함수는 옛 규칙으로 답하고, 어긋난 것을 알려 주는 것이 없다). 그래서 정책이 쓰는 식을
-- 그대로 되묻는 창구를 낸다. STARTUP이 can_write_startup으로 같은 길을 낸 것과 같다
-- (20260906150000·20260906160000).
--
-- **다만 여기서는 정책을 고쳐 끼우지 않는다.** ma_sellers_update의 USING은
-- `app.can_write_workspace('mna')` 한 줄이라 꺼낼 식이 없다 — 함수로 감싸면 같은 호출이 한
-- 겹 깊어질 뿐이고, 정책이 무엇으로 판정하는지가 오히려 한 단계 멀어진다. 아래 두 함수는
-- 그 한 줄을 **행의 실재와 함께** 답하는 얇은 창구다.
-- ---------------------------------------------------------------------

-- 없는 id는 false다 — 있지도 않은 셀러에 쓰기 자격이 설 수는 없다. soft delete된 행도
-- 마찬가지다(목록에서 사라진 행을 근거로 자료를 밖으로 내보내지 않는다).
create or replace function public.can_write_ma_seller(p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $$
  select exists (
    select 1
      from public.ma_sellers s
     where s.id = p_id
       and s.deleted_at is null
       and app.can_write_workspace('mna')
  );
$$;

comment on function public.can_write_ma_seller(uuid) is
  '호출자가 이 셀러의 값을 고칠 수 있는지(boolean). ma_sellers_update USING과 같은 판정에 행의 실재를 더한 것이다. 퀵 리뷰 AI 작성 Edge Function이 호출자 토큰으로 불러 403을 가른다. 새 권한을 주지 않으며 실제 저장은 여전히 RLS가 막는다.';

revoke all on function public.can_write_ma_seller(uuid) from public;
grant execute on function public.can_write_ma_seller(uuid) to authenticated;

-- 등록 모드(가리킬 행이 아직 없다). ma_sellers_insert WITH CHECK와 같은 판정이다.
create or replace function public.can_create_ma_seller()
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $$
  select app.can_write_workspace('mna');
$$;

comment on function public.can_create_ma_seller() is
  '호출자가 셀러를 등록할 수 있는지(boolean). ma_sellers_insert WITH CHECK와 한 벌이다. 등록 폼에서 아직 원장에 없는 자료로 퀵 리뷰 초안을 만들 때 Edge Function이 이것으로 자격을 가른다.';

revoke all on function public.can_create_ma_seller() from public;
grant execute on function public.can_create_ma_seller() to authenticated;
