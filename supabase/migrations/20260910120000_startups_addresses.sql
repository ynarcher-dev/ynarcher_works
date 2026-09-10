-- =====================================================================
-- 스타트업 주소를 **한 칸에서 목록으로**: public.startups.addresses(jsonb)
--
-- 종전에는 상세주소가 자유 텍스트 한 칸(`address_detail`)이라 본사 하나만 담겼고, 지사·
-- 연구소가 있는 기업은 그 사실을 적을 자리가 없어 한 칸에 이어 붙이거나 아예 적지 않았다.
-- 담당자가 실제로 구분해 두고 싶은 것은 '어느 자리의 주소인가'이므로 축을 하나 세운다.
--   · addresses : [{ kind: '본사'|'지사'|'연구소', detail: text }]
--
-- **표를 따로 만들지 않는다.** 기업 한 곳의 주소는 몇 줄이고 다른 표가 이 줄을 가리키지
-- 않는다(FK도 정책도 붙을 일이 없다). 같은 성격의 목록(주주·팀원·지식재산)이 전부 이
-- 원장의 jsonb에 사는데 주소만 표로 빼면 저장 경로가 둘이 되고, 통째 교체 저장 규약도
-- 이 줄에서만 깨진다.
--
-- **`kind`는 코드가 아니라 화면에 서는 말 그대로 담는다.** 세 값이 코드에 박히는 고정
-- 선택지이고(IP_KIND_OPTIONS·EMPLOYMENT_OPTIONS와 같은 성격), 라벨 표를 하나 더 두면
-- jsonb를 눈으로 읽을 때마다 그 표를 함께 열어야 한다.
--
-- **값 이동이지 복사가 아니다.** `address_detail`의 값은 본사 한 줄로 옮기고 옛 칸은
-- 비운다 — 두 곳에 남기면 어긋난 날 어느 쪽이 사실인지 판정할 근거가 없다(2026-09-06
-- competitiveEdge 이동과 같은 처리). 컬럼 자체는 드롭하지 않는다: 값이 이미 옮겨져 있고,
-- 드롭은 되돌릴 수 없는데 얻는 것이 없다.
--
-- 값을 옮기는 UPDATE 동안 startups의 사용자 트리거를 끈다. 켜 두면 (1) 기여 로그가 행마다
-- 'edited'를 쌓는데 마이그레이션에는 행위자가 없어 누가 고쳤는지 답하지 못하는 기록이
-- 남고, (2) updated_at 갱신 트리거가 전 행의 수정일을 오늘로 밀어 상세 화면이 "오늘
-- 누군가 고쳤다"고 거짓을 말한다. 스키마 이동은 업무 행위가 아니다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   - 소유 워크스페이스: startup / 데이터 등급: Internal(기업 단위 정보, 개인정보 아님)
--   - 접근 주체: 내부 사용자. 게스트에게 열리는 경로 없음.
--   - Scope 기준: global(전사 공용 원장)
--   - RLS: startups는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--          (20260705120500_rls_enable_policies.sql). **신규 컬럼은 기존 정책을 그대로
--          상속**하므로 추가 정책이 없다.
--   - 신규 테이블/뷰/정책/RPC/트리거/SECURITY DEFINER/Storage 정책: 없음. DELETE 정책 없음.
--   - 감사 로그: 대상 행위 없음(조회·다운로드·권한 변경이 아니다).
--   - 운영 영향: 프론트가 `address_detail`을 읽던 자리 넷(상세 헤더 카드·통합 수정 폼·
--     AI 작성하기 병합/스냅샷·대용량 업로드 열)을 같은 커밋에서 `addresses`로 옮긴다.
--     Edge Function은 `addressDetail`(문자열 한 칸)을 계속 내놓고, 그것을 본사 한 줄로
--     접는 일은 화면 쪽 병합이 한다 — 서버 스키마는 바뀌지 않는다.
-- 근거: 20260906140000_startups_capability_profiles.sql(같은 방식의 값 이동 선례),
--       20260715100100_startups_location.sql(이 칸을 만든 마이그레이션)
-- =====================================================================

alter table public.startups
  add column if not exists addresses jsonb not null default '[]'::jsonb;

comment on column public.startups.addresses is
  '주소 목록 jsonb: [{ kind: 본사|지사|연구소, detail }]. 구 address_detail(본사 한 칸)을 대체한다. 시·도는 location 태그가 답하므로 여기에는 그 아래(시·군·구부터)만 적는다.';

-- ── 값 이동: address_detail → addresses[0](본사) ──────────────────────
alter table public.startups disable trigger user;

update public.startups
   set addresses = jsonb_build_array(
         jsonb_build_object('kind', '본사', 'detail', btrim(address_detail))
       )
 where coalesce(btrim(address_detail), '') <> ''
   and addresses = '[]'::jsonb;

-- 옮긴 값은 옛 칸에서 걷는다(같은 사실을 두 곳에 두지 않는다).
update public.startups
   set address_detail = null
 where address_detail is not null;

alter table public.startups enable trigger user;

comment on column public.startups.address_detail is
  '(2026-09-10 폐지) 본사 상세주소 한 칸. 값은 addresses로 이관했고 화면은 더 이상 읽지도 쓰지도 않는다. 컬럼만 남겨 둔다.';
