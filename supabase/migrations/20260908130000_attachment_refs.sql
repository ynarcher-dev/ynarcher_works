-- =====================================================================
-- 자료 참조 — "이 레코드는 어느 대상의 자료를 함께 보는가" (2026-09-08)
--
-- 배경: M&A SELLER는 STARTUP 원장 한 행을 가리킬 수 있고(ma_sellers.startup_id),
--   퀵 리뷰를 쓰는 담당자가 읽어야 할 자료 대부분은 이미 **그 기업 쪽에** 올라가 있다
--   (IR덱·등기부·정관). 지금은 같은 파일을 셀러에도 한 번 더 올리는 것 말고 길이 없다.
--
-- **'파일 위치' 칸을 새로 만들지 않는다.** attachments는 이미 (target_type, target_id)로
--   "어느 원장의 어느 행에 올린 자료인가"를 답하고 있다. 그것이 곧 위치이며, 위치를 적는
--   칸을 따로 두면 같은 사실이 두 곳에 살고 어긋난 날 어느 쪽이 진짜인지 판정할 근거가 없다.
--   그래서 이번에 세우는 것은 위치가 아니라 **참조**다 — 자기 자료 외에 어느 대상의 자료를
--   함께 세우는가.
--
-- **방향은 함수 하나가 전부 정한다.** 참조를 첨부 행마다 표시하지 않는 이유가 이것이다 —
--   행에 적으면 방향이 데이터가 되어 한 건씩 어긋날 수 있고, 새 방향을 열 때 기존 행을
--   전부 다시 써야 한다. 아래 함수의 분기가 곧 방향표이며 단방향·양방향·전이가 한 자리에서
--   읽힌다.
--
--     보는 자리        함께 보는 자료
--     ---------------  ----------------------------------------
--     STARTUP          없음
--     M&A SELLER       연결된 STARTUP
--     (예정) M&A 딜    연결된 SELLER 와 그 SELLER의 STARTUP
--
--   STARTUP이 셀러 자료를 보지 않는 것은 분기가 없어서다. 한쪽만 적으면 단방향이고, 양쪽에
--   적으면 양방향이다 — 규칙이 코드의 있고 없음으로 드러나므로 "왜 저쪽에는 안 보이나"를
--   함수를 읽어 답할 수 있다.
--
-- **참조는 읽기 전용이다.** 이 함수는 조회만 답한다. 참조된 자료를 고치거나 지우는 일은
--   그 자료가 원래 사는 화면에서만 하며, 화면은 참조 목록에 삭제·수정 버튼을 두지 않는다.
--   파일을 복제하지 않으므로 원본이 바뀌면 참조 쪽도 그날로 같이 바뀐다(복제였다면 두 목록이
--   어긋났을 때 어느 쪽이 진짜인지 답할 근거가 없다 — 2026-09-06 파일·링크 한 표 결정과
--   같은 판단이다).
--
-- **권한은 한 뼘도 넓히지 않는다.** 두 함수 모두 SECURITY INVOKER다. 참조 대상을 고르는
--   질의가 원장 표(ma_sellers·startups)를 직접 조인하므로 **각 원장의 SELECT 정책이 그대로
--   판정한다** — 판정식을 복제하지 않는다(복제본은 정책이 바뀌는 날 옛 규칙으로 답하고,
--   어긋난 것을 알려 주는 것이 없다). 그 기업을 볼 수 없는 사람에게는 참조 목록이 조용히
--   비고, 다운로드는 종전대로 material-download가 access_logs를 남긴 뒤에만 열린다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: 없음(조회 함수 둘). 판정은 각 원장(mna·startup)이 그대로 한다.
--   - 데이터 등급: 참조되는 자료의 등급을 그대로 물려받는다(새 등급을 만들지 않는다).
--   - 접근 주체: authenticated. 게스트도 호출할 수 있으나 ma_sellers·startups의 SELECT에
--     막혀 언제나 빈 결과다(게스트는 mna·startup 권한을 갖지 않는다).
--   - 새 테이블·컬럼·정책·Storage 정책 없음. RLS 변경 없음. DELETE 경로 없음.
--   - SECURITY DEFINER 아님 — 그래서 함수 내부 권한 검사를 두지 않는다(RLS가 곧 검사다).
--   - search_path 고정, GRANT는 authenticated로만. public·anon 회수.
--   - 감사 로그: 이 함수는 목록만 답하고 파일을 내보내지 않는다. 반출(다운로드·AI 전송)은
--     종전 경로(material-download · attachment_ai_read)가 그대로 적재한다.
--   - 운영 영향: 기존 조회·정책·프론트 쿼리에 변경 없음(순수 추가).
-- 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §6
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 방향표 — 이 대상이 자료를 함께 보는 다른 대상들
-- ---------------------------------------------------------------------
create or replace function app.attachment_ref_sources(p_target_type text, p_target_id uuid)
returns table (ref_type text, ref_id uuid)
language sql
stable
security invoker
set search_path = app, public
as $fn$
  -- M&A SELLER → 연결된 STARTUP 한 행.
  -- 조인이 곧 권한 판정이다 — 그 기업을 못 읽는 사람에게는 이 줄이 나오지 않는다.
  select 'startup'::text, s.id
    from public.ma_sellers ms
    join public.startups s
      on s.id = ms.startup_id
     and s.deleted_at is null
   where p_target_type = 'ma_seller'
     and ms.id = p_target_id
     and ms.deleted_at is null;
$fn$;

revoke all on function app.attachment_ref_sources(text, uuid) from public, anon;
grant execute on function app.attachment_ref_sources(text, uuid) to authenticated;

comment on function app.attachment_ref_sources(text, uuid) is
  '이 대상이 자료를 함께 보는 다른 대상들(다형 키). 참조의 방향은 오직 이 함수의 분기가 정한다 — 첨부 행에 적지 않는 이유는 방향이 데이터가 되면 한 건씩 어긋날 수 있고 새 방향을 열 때 기존 행을 전부 고쳐야 하기 때문이다. INVOKER이므로 각 원장의 SELECT 정책이 판정을 그대로 한다.';

-- ---------------------------------------------------------------------
-- (2) 참조 자료 목록
--
-- 돌려주는 것은 평범한 attachments 행이다. 별도의 '위치' 컬럼을 붙이지 않는 것은 행이
-- 이미 자기 target_type으로 어디에 사는지 말하기 때문이다 — 라벨(‘스타트업DB’)은 화면이
-- 소유한다(코드가 분기와 아이콘을 함께 갖는 값이라 원장으로 내리지 않는다).
-- ---------------------------------------------------------------------
create or replace function public.attachment_refs(p_target_type text, p_target_id uuid)
returns setof public.attachments
language sql
stable
security invoker
set search_path = app, public
as $fn$
  select a.*
    from app.attachment_ref_sources(p_target_type, p_target_id) r
    join public.attachments a
      on a.target_type = r.ref_type
     and a.target_id = r.ref_id
   where a.deleted_at is null
   order by a.created_at desc;
$fn$;

-- service_role도 함께 걷는다. 이 함수는 INVOKER라 service_role로 부르면 **RLS를 통째로 건너뛴
-- 채** 참조 대상 원장을 조인하게 된다 — 그 길을 열어 두면 서버 코드 한 줄이 실수로 그 경로를
-- 타는 날 노출면이 조용히 넓어진다. Edge Function도 이 조회만은 호출자 토큰으로 한다(refs.ts).
revoke all on function public.attachment_refs(text, uuid) from public, anon, service_role;
grant execute on function public.attachment_refs(text, uuid) to authenticated;

comment on function public.attachment_refs(text, uuid) is
  '이 대상이 함께 보는 다른 대상의 자료(읽기 전용). 방향은 app.attachment_ref_sources()가, 열람 자격은 그 함수가 조인하는 각 원장의 RLS와 attachments의 SELECT 정책이 판정한다. 파일을 복제하지 않으므로 원본이 바뀌면 여기도 그날로 함께 바뀐다.';
