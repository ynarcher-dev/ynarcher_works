-- =====================================================================
-- 링크 공유 스위치를 사업 담당자에게 되돌린다 — ADMIN이 정하는 것은 '상한'이다
--
-- 무엇이 잘못돼 있었나
--   20260902140000에서 링크 원장의 INSERT·UPDATE 정책을 app.is_admin()으로 잠갔다.
--   그러나 두 층의 역할은 그게 아니다:
--     · ADMIN  — "이 **종류**가 밖에 나갈 수 있는가"(module_templates.allow_public_link, 정책)
--     · 담당자 — "이 **건**을 지금 열 것인가"(모듈별 스위치, 운영)
--   ADMIN이 세팅해 둔 것을 담당자가 그대로 쓰는 구조인데, 운영 층까지 잠그면 담당자가
--   자기 사업의 메뉴 하나를 여는 데에도 매번 ADMIN을 불러야 한다. 사업이 여러 건 굴러가면
--   그 자체가 병목이고, 정작 막고 싶었던 것(아무 종류나 밖으로 나가는 것)은 상한이 이미 막는다.
--
--   상한은 지금 전 템플릿 false로 배포돼 있으므로, 스위치를 담당자에게 돌려줘도 **ADMIN이
--   켠 템플릿에서만** 열린다. 잠금은 사라지지 않고 옳은 층으로 옮겨 갈 뿐이다.
--
-- 되돌리는 것은 인가 조건 하나뿐이다. 상한 검사(app.module_public_linkable)는 그대로 남으며,
-- 그 함수는 20260902140000에서 이미 원장(module_templates)을 읽도록 바뀌어 있다.
--
-- 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §6.1,
--            docs/docs_planning/3_2_1_admin_module_registry.md §6.4
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 ws=ac/mna/project(행마다 entity_key가 답한다). 등급 Internal. Scope: program → module.
--   · **접근 주체가 넓어지는 변경이다** — ADMIN 전용에서 그 사업의 쓰기 권한자로. 다만
--     넓어지는 대상은 이미 그 모듈을 수정할 수 있는 사람들이며(모듈이 보이는가로 위임),
--     실제 공개 여부는 여전히 ADMIN이 쥔 템플릿 상한이 최종 결정한다. 상한이 닫혀 있으면
--     담당자가 스위치를 올려도 정책이 거부하고, 이미 열린 링크도 공개 게이트가 닫는다.
--   · 신규 테이블·함수·트리거 없음. 정책 2종 재정의뿐이다. DELETE 정책은 여전히 없다.
--   · SELECT 정책은 손대지 않는다(종전에도 담당자가 읽을 수 있었다).
--   · 감사 로그 대상 아님(링크 메타 변경은 개인정보 조회·다운로드·권한 변경이 아니다).
--   · 물리 삭제 없음.
-- 근거: 20260902130000_module_public_links.sql(원래 정책 형태), 20260902140000 §6
-- =====================================================================

drop policy if exists pmpl_insert on public.program_module_public_links;
create policy pmpl_insert on public.program_module_public_links for insert
  with check (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and exists (
      select 1 from app.ws_module_row(entity_key, program_module_id) r
       where app.module_public_linkable(r.module_type)
    )
  );

drop policy if exists pmpl_update on public.program_module_public_links;
create policy pmpl_update on public.program_module_public_links for update
  using (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and exists (select 1 from app.ws_module_row(entity_key, program_module_id))
  )
  with check (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and exists (
      select 1 from app.ws_module_row(entity_key, program_module_id) r
       where app.module_public_linkable(r.module_type)
    )
  );

comment on table public.program_module_public_links is
  '모듈 공개 링크(모듈 1:1). 켜고 끄는 것은 사업 담당자(운영), 그 종류가 나갈 수 있는지는
   ADMIN의 module_templates.allow_public_link(정책)가 정한다.';
