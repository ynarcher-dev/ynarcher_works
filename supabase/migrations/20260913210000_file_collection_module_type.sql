-- =====================================================================
-- [파일받기 모듈 1/2] 모듈 종류를 하나 더한다
-- 정본: docs/docs_planning/3_4_16_file_collection.md
--
-- PROJECT·M&A 공용 '파일받기(FILE_COLLECTION)' 모듈. WORKS가 임의 깊이의 폴더·문항 트리를
-- 짜고 게스트별로 배포하면, 게스트는 자기 문항에만 파일을 올리고 제출한다. 같은 기업의
-- 게스트끼리도 서로의 파일·댓글·진행률을 보지 못한다(WORKS:Guest = 1:N).
--
-- 파일을 둘로 가르는 이유: `alter type ... add value`로 더한 값은 **같은 트랜잭션 안에서
-- 쓸 수 없다**(55P04). 선례 20260908230000_quick_review_module_type.sql과 같은 형태로,
-- 여기에는 값을 더하는 일과 그 값을 **문자열로만** 쓰는 카탈로그 행 하나만 둔다
-- (module_templates.key는 enum이 아니라 text다). 값을 실제로 쓰는 스키마·정책·RPC는 2/2가 갖는다.
--
-- 카탈로그 결정
--   · workspaces: project, mna. FUND는 이번 범위에서 제외한다(사용자 확정).
--   · visibility: GUEST_ONLY — 게스트가 제출하는 모듈이므로 밖으로 서야 한다.
--     `PUBLIC`(전체공개)으로 바꾸더라도 이 기능의 파일·응답은 공개 엔드포인트로 나가지
--     않는다. 2/2의 정책이 app.is_guest() + **본인 배정**을 함께 요구하고, anon에는 어떤
--     권한도 주지 않으며, 파일 실물은 비공개 버킷 + 전용 Edge 경로로만 나간다.
--   · category: OPERATION — 기본 3종(BASE)이 아니라 그 워크스페이스의 일을 하는 운영 모듈이다.
--   · is_active: true — ADMIN이 카탈로그에서 토글한다(사용자 확정: ADMIN 템플릿 토글 등록).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: project / mna
--   - 데이터 등급: 해당 없음(enum 값 하나 · 카탈로그 행 하나 — 업무 데이터가 아니다)
--   - 접근 주체: 카탈로그 읽기는 종전대로 내부 사용자, 쓰기는 ADMIN(정책 무변경)
--   - 신규 테이블/정책/RPC/SECURITY DEFINER 없음. 감사 로그 대상 없음.
--   - 운영 영향: 화면이 이 종류를 알기 전까지는 '워크플로우 추가' 목록에 라벨 없이 서지
--     않도록, 프론트와 같은 커밋에서 배포한다.
-- =====================================================================

alter type public.module_type add value if not exists 'FILE_COLLECTION';

-- 시드는 초기값이지 정답이 아니다 — ADMIN이 고친 값을 재실행이 되돌려서는 안 된다.
insert into public.module_templates (key, category, sort_order, is_active, workspaces, visibility)
values ('FILE_COLLECTION', 'OPERATION', 11, true, array['project', 'mna']::text[], 'GUEST_ONLY')
on conflict (key) do nothing;
