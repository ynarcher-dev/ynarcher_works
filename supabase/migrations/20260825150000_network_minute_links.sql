-- =====================================================================
-- NETWORKS 원장(전문가·BAN·투자사 등 9종 + 글로벌)을 회의록 연동 대상으로 확장
--
-- 배경
--   전문가·투자사 담당자는 회의의 '참석자'가 되는 쪽이라, 그 사람 상세를 열었을 때
--   "이 사람이 낀 회의가 무엇이었나"가 사업·스타트업만큼이나 자주 필요하다. 지금은
--   meeting_minute_links.target_type CHECK가 사업 3종·스타트업·펀드만 허용해
--   네트워크 인물/기관을 연동할 수 없고, 상세 우측에 '관련 회의록' 패널도 없다.
--   (회의록 원장의 external_attendees는 이름 문자열 배열이라 원장 레코드와 무관하다.)
--
-- 결정
--   1) target_type CHECK에 NETWORKS 다형 키 10종을 추가한다 —
--      'expert','van','exp','investor','corporate','institution','university',
--      'etc','other','global_network'.
--      키는 attachments.target_type / entity_feedback.target_type이 이미 쓰는 단수 키를
--      그대로 재사용한다(신규 키 체계를 만들면 같은 레코드가 패널마다 다른 이름을 갖는다).
--      은퇴 원장 vendors는 제외한다 — 상세 라우트가 없어 연동해도 열 수 없는 링크가 된다.
--   2) app.can_link_minute_target에 networks 분기를 추가한다. NETWORKS 8종·글로벌은
--      담당자 원장이 없는 영구 공동관리라(CLAUDE.md 3축 규칙) 단건 스코프 헬퍼 없이
--      워크스페이스 읽기 권한 + 원장에 살아 있는 행인지로 판정한다(startup 분기와 동형).
--   3) 역방향(대상 상세 → 회의록) 열람은 기존 링크 SELECT 정책 app.can_read_minute가
--      그대로 처리하므로 정책 변경이 없다 — 열람 불가·삭제 회의록은 애초에 행이 없다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: networks(연동 대상) / office(회의록 본문). 데이터 등급: Internal.
--     회의록 제목·일자만 노출하며 개인정보 원본(연락처·이메일)은 이 경로로 흐르지 않는다.
--   · 접근 주체: 내부 사용자. 게스트는 meeting_minutes/meeting_minute_links 어느 쪽도 못 읽는다.
--   · Scope: 연동 쓰기 = networks 워크스페이스 읽기 + 원장 생존 행. 열람 = 회의록 read scope.
--   · 신규 테이블·정책·SECURITY DEFINER 함수 없음 — 기존 DEFINER 헬퍼
--     app.can_link_minute_target(search_path 고정 유지)의 분기 확장뿐이며,
--     쓰기 경로는 여전히 app.set_minute_links() RPC 한 곳이다(조인 테이블 write 정책 없음).
--   · 변경은 전부 가산적 — 기존 program/ma_program/project_program/startup/fund 분기 불변.
-- 근거: 20260723220000_meeting_minute_links.sql(링크 원장·판정 헬퍼 원형),
--       20260724120000_fund_polymorphic_panels.sql(같은 확장을 fund에 적용한 선례),
--       20260731140000_startups_workspace_key.sql(현행 can_link_minute_target 정의),
--       20260705120400_networks_master.sql / 20260706170000_networks_org_masters.sql /
--       20260707140000_networks_etc_master.sql / 20260707180000_networks_exp_master.sql /
--       20260707220000_global_networks.sql(원장 10종)
-- =====================================================================

-- (1) 회의록 링크 대상에 NETWORKS 다형 키 10종 허용 ----------------------
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_target_type_check;
alter table public.meeting_minute_links
  add constraint meeting_minute_links_target_type_check
  check (target_type in (
    'program', 'ma_program', 'project_program', 'startup', 'fund',
    'expert', 'van', 'exp', 'investor', 'corporate', 'institution',
    'university', 'etc', 'other', 'global_network'
  ));

-- (2) 연동 가능 판정 — networks 분기 추가(기존 분기 원문 보존) ------------
create or replace function app.can_link_minute_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'project_program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
      and exists (select 1 from public.project_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('startup')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'fund' then
      app.can_read_workspace('fund') and app.can_access_fund(p_target_id)
      and exists (select 1 from public.funds x
                   where x.id = p_target_id and x.deleted_at is null)
    -- NETWORKS 원장 10종: 담당자 원장이 없는 영구 공동관리라 워크스페이스 읽기 권한 +
    -- 원장에 살아 있는 행인지로 판정한다(단건 스코프 헬퍼 없음 — startup 분기와 동형).
    when 'expert' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.experts x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'van' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.van x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'exp' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.exp x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'investor' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.investors x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'corporate' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.corporates x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'institution' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.institutions x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'university' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.universities x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'etc' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.etc x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'other' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.others x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'global_network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.global_networks x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$$;

comment on function app.can_link_minute_target(text, uuid) is
  '회의록 연동 대상 판정 — 사업 3종·스타트업·펀드·NETWORKS 원장 10종. 요청자 열람 권한과 생존 행을 함께 확인한다.';
comment on constraint meeting_minute_links_target_type_check on public.meeting_minute_links is
  '연동 대상 다형 키 — attachments/entity_feedback와 같은 값 체계(사업 3종·startup·fund·NETWORKS 10종).';
