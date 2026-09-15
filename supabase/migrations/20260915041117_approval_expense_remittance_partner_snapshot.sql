-- =====================================================================
-- 표준 지출결의서(약칭 `지결`)의 **송금 요청** 표에 거래처 사본 칸을 세운다.
--
-- 무엇이 바뀌는가
--   열이 `거래처 · 송금액 · 송금 요청일` 셋에서 다음 일곱으로 늘어난다.
--     거래처명 · 구분 · 은행 · 계좌번호 · 예금주 · 송금액 · 송금 요청일
--   앞의 다섯 중 뒤 넷은 **사람이 적는 칸이 아니다** — 거래처를 고르는 순간 원장의 값이 그
--   줄에 적히고, 해제하면 함께 비워진다(`source`가 붙은 열).
--
-- 왜 원장을 매번 읽지 않고 적어 두는가 (2026-09-15에 뒤집힌 판단)
--   종전에는 요청 줄이 거래처 id 하나만 들고 은행·계좌·예금주는 원장이 매번 답했다. 그러면
--   원장을 고치는 날 이미 결재가 끝난 요청서의 계좌까지 함께 바뀐다. 송금 요청서는 "지금 무엇이
--   참인가"를 묻는 화면이 아니라 **결재를 받은 지시**이므로, 결재자가 승인한 계좌와 경영지원이
--   이체한 계좌가 같아야 한다. 그래서 고른 그때의 값을 문서에 적는다. 나중에 원장과 달라지는
--   것은 고장이 아니라 사실이다 — 그 문서는 그때의 계좌로 나갔다는 뜻이다.
--
--   계좌번호 **전체**가 문서 행(approval_documents.field_values)에 저장된다. 그 값이 거기 있는
--   이유는 송금 요청 한 가지이며, 문서의 열람 경계는 지금까지와 같이 결재 문서 RLS가 지킨다.
--   계좌 전체를 읽어 오는 경로는 20260915041112의 `trade_partner_payment_detail` 하나뿐이고,
--   목록·검색은 여전히 가려진 뷰(뒤 4자리)가 답한다.
--
-- 스키마 확장 방식
--   새 열 종류를 만들지 않는다. 파생 열은 종류가 `TEXT`이고 `source` 한 칸이 "값의 주인이 같은
--   표의 어느 참조 열인가"를 적는다(`{"from":"partner","field":"BANK"}`). 종류로 가르면 양식
--   관리의 열 종류 목록에 고를 수 없는 값이 서고, 담당자가 '은행'을 골랐을 때 그 열이 무엇을
--   따라올지 아무도 답하지 못한다. 짝은 양식이 지어 두는 것이다.
--   `partnerName`(field = NAME)은 화면에 열로 서지 않는다 — 그 값은 거래처 칸 자신이 든다.
--   그래도 저장하는 이유는 원장에서 상호가 바뀌어도 이미 준비된 요청서의 이름이 그날 그대로여야
--   하기 때문이다(프론트 `fields.visibleColumns`가 같은 규칙을 갖는다).
--
-- 버전 행은 불변이다
--   옛 버전의 `fields`를 고치지 않고 새 버전을 발행한 뒤 양식의 `current_version_id`만 옮긴다.
--   이미 상신된 문서는 자기 `form_version_id`가 가리키는 버전의 스키마로 렌더되므로, 그
--   문서들에서는 송금 요청 표가 지금까지와 똑같이 세 열로 보이고 값도 그대로 남는다
--   (데이터 삭제·변환 없음 — `field_values`는 손대지 않는다).
--
-- 범위와 안전장치
--   · 하이웍스 복원 양식(`security_grade = '하이웍스 원본'`)은 제외한다 — 그 양식은 원본 그대로
--     보존하는 것이 존재 이유다(양식 카탈로그 마이그레이션과 같은 문장).
--   · **기대한 직전 모양일 때만** 옮긴다. 송금 요청 표의 열이 `partner(PARTNER_REF) ·
--     amount(MONEY) · requestOn(DATE)` 셋 그대로일 때만 새 버전을 발행하며, ADMIN이 열을 더했거나
--     순서를 바꿨으면 아무 일도 하지 않는다(짜 둔 양식을 시드가 되돌리지 않는다).
--   · 현재 버전이 **최신 버전이 아니면** 옮기지 않는다. 그 사이 누군가 새 버전을 발행했다는 뜻이고,
--     그 위에 포인터를 덮으면 그 작업이 조용히 버려진다.
--   · 재실행 안전: 이미 사본 열이 있으면 아무 일도 하지 않는다(두 번 돌려도 버전이 늘지 않는다).
--   · 동시 실행 안전: 양식 행을 `for update`로 잠그고 그 아래에서 읽고 쓴다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md): 해당 없음.
--   · 소유: OFFICE 사용 / ADMIN 관리, 데이터 등급: Internal(스키마), 범위: global.
--   · 신규 테이블·뷰·정책·트리거·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
--   · GRANT/REVOKE 변경 없음, RLS 경계 불변, 기존 문서 데이터 변경·삭제 없음.
-- =====================================================================

do $$
declare
  v_form    uuid;
  v_ver_id  uuid;
  v_fields  jsonb;
  v_rem     jsonb;
  v_cols    jsonb;
  v_next    integer;
  v_new_ver uuid;
  v_new     jsonb;
begin
  -- 새 열 한 벌. 순서가 곧 화면의 순서다 — 누구에게 보내는가(거래처명·구분)를 먼저 읽고,
  -- 어디로 보내는가(은행·계좌번호·예금주)가 뒤따르며, 얼마를 언제(송금액·송금 요청일)가 끝이다.
  v_cols := jsonb_build_array(
    jsonb_build_object('key', 'partner', 'label', '거래처명', 'type', 'PARTNER_REF'),
    -- 화면에 열로 서지 않는 이름 사본. 거래처 칸이 이 값을 든다.
    jsonb_build_object('key', 'partnerName', 'label', '거래처명', 'type', 'TEXT',
                       'source', jsonb_build_object('from', 'partner', 'field', 'NAME')),
    jsonb_build_object('key', 'partnerType', 'label', '구분', 'type', 'TEXT',
                       'source', jsonb_build_object('from', 'partner', 'field', 'PARTNER_TYPE')),
    -- 저장되는 값은 금융기관 코드 3자리다. 이름표는 화면이 붙인다 — 은행 이름은 바뀌지만
    -- (KEB하나은행 → 하나은행) 코드는 바뀌지 않는다.
    jsonb_build_object('key', 'bankCode', 'label', '은행', 'type', 'TEXT',
                       'source', jsonb_build_object('from', 'partner', 'field', 'BANK')),
    jsonb_build_object('key', 'accountNo', 'label', '계좌번호', 'type', 'TEXT',
                       'source', jsonb_build_object('from', 'partner', 'field', 'ACCOUNT_NO')),
    jsonb_build_object('key', 'accountHolder', 'label', '예금주', 'type', 'TEXT',
                       'source', jsonb_build_object('from', 'partner', 'field', 'ACCOUNT_HOLDER')),
    -- 두 열은 key를 그대로 둔다. 바꾸면 임시저장해 둔 문서의 금액·날짜가 갈 곳을 잃는다.
    jsonb_build_object('key', 'amount', 'label', '송금액', 'type', 'MONEY'),
    jsonb_build_object('key', 'requestOn', 'label', '송금 요청일', 'type', 'DATE')
  );

  for v_form in
    select f.id
      from public.approval_forms f
     where f.abbrev = '지결'
       and f.deleted_at is null
       and f.security_grade is distinct from '하이웍스 원본'
     -- 읽고 쓰는 사이에 다른 세션이 같은 양식의 버전을 올리지 못하게 잠근다.
     for update
  loop
    v_ver_id := null; v_fields := null; v_rem := null;

    select f.current_version_id, v.fields
      into v_ver_id, v_fields
      from public.approval_forms f
      left join public.approval_form_versions v on v.id = f.current_version_id
     where f.id = v_form;

    -- 현재 버전이 없거나(시드 전) 최신 버전이 아니면 손대지 않는다.
    if v_ver_id is null then
      continue;
    end if;
    if v_ver_id is distinct from (
         select v.id
           from public.approval_form_versions v
          where v.form_id = v_form
          order by v.version_no desc
          limit 1
       )
    then
      continue;
    end if;
    if jsonb_typeof(v_fields) <> 'array' then
      continue;
    end if;

    select e.value
      into v_rem
      from jsonb_array_elements(v_fields) e
     where e.value->>'key' = 'remittances'
       and e.value->>'type' = 'TABLE'
     limit 1;

    -- 송금 요청 표가 없는 양식(다른 환경·옛 시드)은 이 마이그레이션의 대상이 아니다.
    if v_rem is null then
      continue;
    end if;

    -- 기대한 직전 모양인가 — 세 열이 키와 종류까지 그대로여야 한다. 이미 사본 열이 있으면
    -- 열 수부터 어긋나므로 이 한 검사가 재실행 방지도 함께 한다.
    if jsonb_array_length(coalesce(v_rem->'columns', '[]'::jsonb)) <> 3
       or v_rem->'columns'->0->>'key'  is distinct from 'partner'
       or v_rem->'columns'->0->>'type' is distinct from 'PARTNER_REF'
       or v_rem->'columns'->1->>'key'  is distinct from 'amount'
       or v_rem->'columns'->1->>'type' is distinct from 'MONEY'
       or v_rem->'columns'->2->>'key'  is distinct from 'requestOn'
       or v_rem->'columns'->2->>'type' is distinct from 'DATE'
    then
      continue;
    end if;

    -- 바뀌는 것은 그 표의 열뿐이다. 필드의 이름·필수 여부·도움말과 다른 필드는 그대로 간다.
    select coalesce(jsonb_agg(
             case when e.value->>'key' = 'remittances'
                  then jsonb_set(e.value, '{columns}', v_cols)
                  else e.value end
             order by e.ord), '[]'::jsonb)
      into v_new
      from jsonb_array_elements(v_fields) with ordinality e(value, ord);

    select coalesce(max(version_no), 0) + 1
      into v_next
      from public.approval_form_versions
     where form_id = v_form;

    insert into public.approval_form_versions (form_id, version_no, fields)
    values (v_form, v_next, v_new)
    returning id into v_new_ver;

    -- 바뀌는 것은 "앞으로 쓸 버전"뿐이다. 이미 상신된 문서의 form_version_id는 그대로다.
    update public.approval_forms
       set current_version_id = v_new_ver
     where id = v_form;
  end loop;
end
$$;
