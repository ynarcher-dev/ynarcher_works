-- =====================================================================
-- 자료 참조 — 아직 저장되지 않은 연결도 참조로 받는다 (2026-09-08)
--
-- 배경: 20260908130000의 방향 함수는 **저장된 행에서** 연결을 찾는다(`ma_sellers.startup_id`).
--   그래서 셀러 등록 화면에서 스타트업을 연결해도 참조가 하나도 오지 않았다 — 아직 그 행이
--   없기 때문이다. 그런데 등록 화면이야말로 참조가 가장 필요한 자리다: 스타트업 원장에서
--   기업을 끌어와 셀러를 만들고 그 자리에서 퀵 리뷰 초안까지 만드는 것이 정상 순서다.
--
-- **후보를 인자로 받는다.** `p_link_id`가 오면 그것을 연결로 보고, 없으면 종전대로 저장된
--   행에서 찾는다(`coalesce`). 함수가 둘로 갈리지 않는 것이 요점이다 — 방향은 여전히 이
--   함수의 분기 하나가 정하고, 갈라 두면 "저장 전"과 "저장 후"의 규칙이 서로 모르게 자란다.
--
-- **노출면은 넓어지지 않는다.** 후보를 호출자가 지정하게 되지만 그 후보는 여전히
--   `public.startups` 조인을 통과해야 하고 이 함수는 INVOKER라 그 원장의 SELECT 정책이
--   판정한다. 즉 요청자가 **이미 열 수 있는** 스타트업의 자료만 나오며, 그것은 스타트업
--   화면에서 이미 할 수 있는 일이다. 방향 규칙(`p_target_type = 'ma_seller'`일 때만 스타트업)도
--   그대로라, 아무 원장이나 남의 자료를 끌어오는 길은 열리지 않는다.
--
-- **인자를 늘리는 대신 기본값을 준다.** `create or replace`로 인자를 늘리면 교체가 아니라 새
--   오버로드가 되고, 기본값이 있으면 옛 2인자 호출이 두 함수 모두에 걸려 42725로 죽는다
--   (`works-db-connection` 메모의 함정). 그래서 옛 시그니처를 **먼저 drop** 하고 기본값을 가진
--   한 벌만 남긴다 — 이미 배포된 프론트의 2인자 호출은 기본값을 타고 그대로 동작하므로,
--   DB를 먼저 올리고 프론트를 뒤에 내보내는 순서가 깨지지 않는다.
--
-- ⚠️ drop 후 재생성하면 **권한과 주석이 조용히 초기값으로 돌아간다**(Supabase 기본 privileges +
--   PostgreSQL의 PUBLIC EXECUTE). diff에는 아무것도 나타나지 않으므로 revoke·grant·comment를
--   되돌리는 것까지가 한 벌이다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 새 테이블·컬럼·정책·Storage 정책 없음. RLS 변경 없음. DELETE 경로 없음.
--   - SECURITY INVOKER 유지 — 판정은 각 원장(mna·startup)의 SELECT 정책이 그대로 한다.
--   - search_path 고정, GRANT는 authenticated로만(public·anon·service_role 회수 유지).
--   - 감사 로그: 목록만 답하고 파일을 내보내지 않는다. 반출은 종전 경로가 적재한다.
--   - 운영 영향: 옛 2인자 호출이 기본값으로 그대로 동작한다(프론트 배포 순서 무관).
-- 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §6
-- =====================================================================

drop function if exists public.attachment_refs(text, uuid);
drop function if exists app.attachment_ref_sources(text, uuid);

-- ---------------------------------------------------------------------
-- (1) 방향표 — 저장된 연결이든, 폼에서 방금 고른 연결이든 같은 분기가 답한다
-- ---------------------------------------------------------------------
create or replace function app.attachment_ref_sources(
  p_target_type text,
  p_target_id   uuid default null,
  p_link_id     uuid default null
)
returns table (ref_type text, ref_id uuid)
language sql
stable
security invoker
set search_path = app, public
as $fn$
  -- M&A SELLER → 연결된 STARTUP 한 행.
  -- 조인이 곧 권한 판정이다 — 그 기업을 못 읽는 사람에게는 이 줄이 나오지 않는다.
  select 'startup'::text, s.id
    from public.startups s
   where p_target_type = 'ma_seller'
     and s.deleted_at is null
     and s.id = coalesce(
           -- 폼이 방금 고른 연결이 있으면 그것이 답이다(등록 화면에는 저장된 행이 없다).
           p_link_id,
           (select ms.startup_id
              from public.ma_sellers ms
             where ms.id = p_target_id
               and ms.deleted_at is null)
         );
$fn$;

revoke all on function app.attachment_ref_sources(text, uuid, uuid) from public, anon;
grant execute on function app.attachment_ref_sources(text, uuid, uuid) to authenticated;

comment on function app.attachment_ref_sources(text, uuid, uuid) is
  '이 대상이 자료를 함께 보는 다른 대상들(다형 키). 참조의 방향은 오직 이 함수의 분기가 정한다 — 첨부 행에 적지 않는 이유는 방향이 데이터가 되면 한 건씩 어긋날 수 있고 새 방향을 열 때 기존 행을 전부 고쳐야 하기 때문이다. p_link_id는 아직 저장되지 않은 연결(등록 화면)을 위한 후보이며, 후보의 열람 자격은 여전히 조인하는 원장의 RLS가 판정한다. INVOKER.';

-- ---------------------------------------------------------------------
-- (2) 참조 자료 목록
-- ---------------------------------------------------------------------
create or replace function public.attachment_refs(
  p_target_type text,
  p_target_id   uuid default null,
  p_link_id     uuid default null
)
returns setof public.attachments
language sql
stable
security invoker
set search_path = app, public
as $fn$
  select a.*
    from app.attachment_ref_sources(p_target_type, p_target_id, p_link_id) r
    join public.attachments a
      on a.target_type = r.ref_type
     and a.target_id = r.ref_id
   where a.deleted_at is null
   order by a.created_at desc;
$fn$;

-- service_role도 함께 걷는다. 이 함수는 INVOKER라 service_role로 부르면 **RLS를 통째로 건너뛴
-- 채** 참조 대상 원장을 조인하게 된다 — 그 길을 열어 두면 서버 코드 한 줄이 실수로 그 경로를
-- 타는 날 노출면이 조용히 넓어진다. Edge Function도 이 조회만은 호출자 토큰으로 한다(refs.ts).
revoke all on function public.attachment_refs(text, uuid, uuid) from public, anon, service_role;
grant execute on function public.attachment_refs(text, uuid, uuid) to authenticated;

comment on function public.attachment_refs(text, uuid, uuid) is
  '이 대상이 함께 보는 다른 대상의 자료(읽기 전용). 방향은 app.attachment_ref_sources()가, 열람 자격은 그 함수가 조인하는 각 원장의 RLS와 attachments의 SELECT 정책이 판정한다. p_link_id는 아직 저장되지 않은 연결(등록 화면)의 후보다. 파일을 복제하지 않으므로 원본이 바뀌면 여기도 그날로 함께 바뀐다.';
