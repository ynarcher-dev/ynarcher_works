-- =====================================================================
-- 공유 범위 세 번째 값 `PUBLIC_LINK` — enum 값만 추가한다 (1/2)
--
-- 왜 파일을 나누나
--   PostgreSQL은 `alter type ... add value`로 더한 enum 값을 **같은 트랜잭션 안에서 쓰지
--   못한다**(unsafe use of new value of enum type). 백필·CHECK가 이 값을 쓰므로 한 파일에
--   담으면 반드시 실패한다. 마이그레이션은 파일 단위로 커밋되므로 값 추가만 떼어 앞세운다.
--   선례: 20260803230000_module_type_split_enum.sql(POST/LINK/FILE) → 20260803230100.
--
-- 왜 폐기한 PUBLIC을 되살리지 않고 새 값을 만드나
--   (1) 옛 PUBLIC 행은 2026-09-02에 GUEST_ONLY로 백필되어 **그 이름이 가리키던 것과 새로
--       가리킬 것이 다르다**. 같은 이름에 두 뜻이 붙으면 이력을 읽을 때 판정할 근거가 없다.
--   (2) '전체공개'는 어떻게 공개되는지를 감춘다. 열리는 문은 주소를 아는 사람만 들어오는
--       문이며, 이름이 그 사실을 말해야 담당자가 "검색에 뜨나?"를 묻지 않는다.
--
-- 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §7.1(b)
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 ws=ac/mna/project, 등급 Internal, Scope: program → module. 접근 주체 변화 없음.
--   · enum 값 추가뿐이다 — 이 값을 저장할 수 있게 하는 CHECK는 다음 파일이 넓히므로,
--     이 파일만 적용된 상태에서는 저장 가능한 값이 한 건도 늘지 않는다.
--   · 신규 테이블·정책·RPC·SECURITY DEFINER 함수·Storage 없음. 물리 삭제 없음.
-- 근거: 20260902120000_module_visibility_two_values.sql
-- =====================================================================

alter type public.module_visibility add value if not exists 'PUBLIC_LINK';

comment on type public.module_visibility is
  '모듈 공유 범위. 유효값은 세 가지이며 서로 배타다 —
   PUBLIC_LINK(주소를 아는 누구나, 로그인 불필요) / GUEST_ONLY(내부+초대된 참여기업·전문가) /
   INTERNAL_ONLY(내부 운영자만). PUBLIC은 2026-09-02 폐기되어 CHECK가 저장을 막는다
   (enum 값 삭제는 의존 객체를 모두 재작성해야 하므로 남겨 둘 뿐이다).';
