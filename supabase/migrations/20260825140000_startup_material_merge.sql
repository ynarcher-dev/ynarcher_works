-- ---------------------------------------------------------------------
-- 스타트업 자료 분류 통합 — startup_ir / startup_financial → startup
--
-- 스타트업 상세의 자료 패널은 IR·재무제표·기타 3분류로 나뉘어 각자 target_type 을 썼다.
-- 그러나 이 두 키는 app.entity_key_workspace() 에 없어 else 분기('networks')로 떨어졌고,
-- 결과적으로 STARTUP 자료가 NETWORKS 권한으로 열리고 닫혔다(소유 워크스페이스 오판정).
-- 화면도 다른 상세페이지와 달리 같은 카드를 셋으로 늘려 우측 패널 자리만 먹었다.
-- 분류를 없애고 'startup' 한 곳으로 모아 정책 판정과 화면을 함께 바로잡는다.
--
-- storage_path 는 행에 그대로 저장돼 있어 target_type 만 바꿔도 다운로드 경로는 유지된다
-- (attachments 버킷 정책은 경로가 아니라 app.can_use_attachment_storage() 로만 판정).
-- ---------------------------------------------------------------------

update public.attachments
   set target_type = 'startup'
 where target_type in ('startup_ir', 'startup_financial');
