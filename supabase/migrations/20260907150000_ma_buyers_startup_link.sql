-- =====================================================================
-- M&A BUYER ↔ STARTUP 원장 매핑 한 칸 — ma_buyers.startup_id
--
-- 기업명은 그대로 자유 입력으로 둔다. 바이어의 상당수는 우리 스타트업 원장에 없는 기업이고
--   (인수하는 쪽은 대개 우리가 발굴·투자한 기업이 아니다), 원장에 있어야만 등록할 수 있게
--   하면 명함 한 장 들고 앉은 자리에서 바이어를 넣지 못한다. 그래서 매핑은 **선택**이고,
--   이름 칸을 대체하지 않고 옆에 붙는다.
--
-- 이름을 복사해 두고 id도 함께 두는 것이 중복 같아 보이지만 그렇지 않다 — 둘은 다른 것을
--   답한다. `name`은 **이 바이어를 부르는 이름**(계약서 표기·약칭이 원장과 다를 수 있다)이고
--   `startup_id`는 **그 기업이 우리 원장의 어느 행인가**다. 매핑을 걸어도 이름을 손으로 고칠
--   수 있게 두는 것도 같은 이유다.
--
-- FK를 건다(다형 키가 아니다). 가리키는 원장이 하나로 정해져 있어 다형일 이유가 없고, FK가
--   있으면 없는 기업을 가리키는 행이 애초에 들어오지 못한다. `on delete set null`을 쓰지
--   않는 이유는 STARTUP이 소프트 삭제 원장이라 행이 사라지지 않기 때문이다 — 비활성화된
--   기업을 가리키는 매핑은 화면이 '연결된 기업 없음'이 아니라 그 기업을 흐리게 보여 준다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: mna / 데이터 등급: Internal / 접근 주체: 내부 사용자만.
--   - 컬럼 추가만이며 RLS·정책·트리거 변경 없음. 접근 경계는 기존 ma_buyers 정책 그대로다.
--   - **읽기 경계가 넓어지지 않는다**: 이 칸은 id만 갖고, 그 기업의 이름·상세를 실제로
--     보여줄 수 있는지는 startups의 SELECT 정책이 그대로 판정한다(조인 결과가 비면 화면은
--     링크 없는 텍스트로 물러난다). 바이어를 볼 수 있다는 것이 스타트업을 볼 수 있다는
--     뜻이 되어서는 안 되므로, 여기서 그 판정을 대신하지 않는다.
--   - 새 RPC·SECURITY DEFINER·Storage 정책 없음. 감사 로그 대상 행위 없음.
-- =====================================================================

alter table public.ma_buyers
  add column if not exists startup_id uuid references public.startups(id);

create index if not exists idx_ma_buyers_startup_id
  on public.ma_buyers (startup_id)
  where deleted_at is null and startup_id is not null;

comment on column public.ma_buyers.startup_id is
  'STARTUP 원장 매핑(선택). 기업명은 여전히 자유 입력이며 이 칸은 "그 기업이 우리 원장의 어느 행인가"만 답한다. 열람 가능 여부는 startups의 SELECT 정책이 판정한다.';
