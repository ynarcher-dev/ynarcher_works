-- =====================================================================
-- 자료 관리가 파일과 링크를 함께 담는다 (2026-09-06)
--
-- 왜 필요한가:
--   참고 자료가 늘 파일로 오지는 않는다. 구글 문서·공시 페이지·보도자료는 주소로 오는데
--   자료 관리에는 넣을 자리가 없어, 링크는 지금 **세 군데로 흩어져** 산다 —
--   사업 모듈의 URL첨부(program_links), 기업 상세의 미디어 카드(startups.media), 그리고
--   어디에도 못 넣어 사라진 것들. 담당자가 "이 기업 자료 어디 있지"를 한 곳에서 답하지 못한다.
--
-- 왜 새 표를 만들지 않는가:
--   파일첨부 모듈이 같은 갈림길을 이미 지났다. 그때 신규 원장을 만들지 않고 같은 attachments
--   행을 쓰되 program_module_id로 귀속만 표시했고, 근거는 **복제하면 두 목록이 어긋났을 때
--   어느 쪽이 진짜인지 판정할 근거가 없다**는 것이었다. 링크를 별도 표로 두면 목록·건수·검색·
--   정렬·페이저를 스무 개 화면에서 두 원장 합치기로 바꿔야 하고, 그 스무 곳이 각각 어긋날 수
--   있는 자리가 된다. 한 표에 담으면 그 일이 애초에 생기지 않는다.
--
-- 무엇을 가르는가 — `kind` 한 칸:
--   FILE 이면 스토리지에 실물이 있고(storage_path), LINK 이면 바깥 주소를 가리킨다(url).
--   **둘을 동시에 갖거나 둘 다 없는 행은 없다** — CHECK 가 강제한다. 이 불변식이 있어야
--   다운로드 경로가 "행이 있으면 실물도 있다"를 계속 전제할 수 있다(그 전제가 깨지면
--   material-download 가 없는 파일에 서명을 시도한다).
--
-- file_name 을 NOT NULL 로 남기는 이유:
--   이 컬럼은 스무 곳에서 직접 읽힌다(목록 검색·확장자 열·미리보기 제목·접근성 라벨).
--   nullable 로 풀면 그 스무 곳이 전부 빈 값 처리를 새로 해야 하고, 한 곳만 빠뜨려도
--   "undefined 다운로드" 같은 라벨이 남는다. 대신 **뜻을 넓힌다** — 이 자리는 "무엇을 받게
--   되는가"를 답하는 자리이고, 링크에서 그것은 **호스트**(docs.google.com)다. 짧아서 목록에
--   그대로 서고 검색에도 걸린다. 전체 주소는 url 이 갖는다(같은 값을 두 곳에 적지 않는다).
--
-- 표시명·설명은 이미 있는 칸을 쓴다:
--   label = 표시명(링크는 OG 제목으로 자동 채움), description = 한 줄 설명(OG 설명).
--   링크 전용 컬럼을 새로 만들지 않는 이유는 화면이 이미 그 둘을 그리고 있기 때문이다.
--
-- 범위 — 이번에 옮기지 않는 것:
--   * `program_links`(URL첨부 모듈): 여기로 흡수하는 것이 파일첨부와 대칭이지만, 게스트 공개
--     정책과 모듈 삭제 카탈로그가 그 표에 걸려 있어 별도 작업으로 뗀다(2026-09-06 사용자 결정).
--   * `startups.media`(미디어 카드): 성격이 다르다 — 자료는 내부 참고이고 미디어는 대외 노출
--     실적이라 실적 밴드에 선다. 흡수하지 않는다(2026-09-06 사용자 결정).
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: 다형(target_type이 답한다 — attachments 정책 그대로)
--   - 데이터 등급: Internal ~ Restricted (기존 자료와 동일. 링크는 바깥 주소일 뿐 새 등급이 아니다)
--   - 접근 주체: 기존과 동일 — 내부 사용자 + 공개 모듈 게스트. 정책은 손대지 않는다
--   - Scope 기준: 변경 없음(target_type/target_id 기준 그대로)
--   - 감사 로그: **링크는 반출이 아니다.** 파일 다운로드는 실물이 나가는 일이라 access_logs가
--     필수지만, 링크는 브라우저가 바깥 주소를 여는 것뿐이라 우리가 내보내는 것이 없다.
--     material-download 는 LINK 행을 거절한다(서명할 실물이 없다)
--   - 운영 영향: 기존 행은 전부 kind='FILE'로 채워지고 CHECK를 그대로 통과한다.
--     NOT NULL 해제는 넓히는 방향이라 기존 쓰기 경로가 깨지지 않는다
--   - 신규 테이블 없음 / 신규 정책 없음 / DELETE 정책 없음 / SECURITY DEFINER 없음
-- =====================================================================

-- ── (1) 종류와 주소 ───────────────────────────────────────────────────
alter table public.attachments
  add column if not exists kind text not null default 'FILE',
  add column if not exists url  text;

comment on column public.attachments.kind is
  '자료 종류: FILE(스토리지 실물) | LINK(바깥 주소). 둘을 가르는 유일한 칸이며 CHECK가 모양을 강제한다.';
comment on column public.attachments.url is
  'LINK 행의 전체 주소(http/https). FILE 행에서는 항상 null이다. 호스트는 file_name이 따로 갖는다(목록·검색용).';

-- ── (2) 실물이 없는 행을 허용한다 ─────────────────────────────────────
-- 링크에는 스토리지 경로가 없다. 대신 아래 CHECK가 "FILE이면 반드시 있다"를 계속 보장하므로
-- 다운로드 경로의 전제는 그대로다.
alter table public.attachments alter column storage_path drop not null;

-- ── (3) 모양 강제 — 반쪽짜리 행을 만들지 못하게 한다 ──────────────────
-- 이 제약이 이번 변경의 안전장치다. 없으면 storage_path도 url도 없는 행이 조용히 들어와
-- 목록에는 뜨는데 열 수는 없는 자료가 된다.
alter table public.attachments drop constraint if exists attachments_kind_shape;
alter table public.attachments
  add constraint attachments_kind_shape check (
    (kind = 'FILE' and storage_path is not null and url is null)
    or
    (kind = 'LINK' and storage_path is null and url is not null and url ~* '^https?://')
  );

comment on constraint attachments_kind_shape on public.attachments is
  'FILE은 스토리지 경로만, LINK는 주소만 갖는다. 둘 다 갖거나 둘 다 없는 행을 막는다 — 그런 행은 목록에는 뜨는데 열 수 없는 자료가 된다.';

-- 목록이 종류를 자주 가르므로(링크만·파일만) 대상별 인덱스에 종류를 얹는다.
create index if not exists idx_attachments_target_kind
  on public.attachments (target_type, target_id, kind)
  where deleted_at is null;
