-- =====================================================================
-- 회의록 음성 기록 전용 첨부(attachments, target_type='office_minute_voice') 접근범위 종속
-- 선행: 20260723150000_meeting_minutes_body_and_attachment_scope.sql
--
-- 배경
--   회의록 상세에서 음성 녹음을 일반 첨부(office_minute)와 섞이지 않게 별도 슬롯으로 저장한다
--   (스타트업 자료 분류가 target_type을 나눠 쓰는 것과 동일 방식). 새 target_type
--   'office_minute_voice'가 그 슬롯이다.
--
--   문제: 기본 attachments 정책은 '내부 사용자 전원' 열람이라, office_minute만 회의록 RLS에
--   종속시킨 20260723150000의 가드는 새 음성 target_type을 커버하지 못한다. 그대로 두면
--   일부공개(PARTICIPANTS) 회의록의 음성 기록이 명단 밖 내부 사용자에게 샌다.
--
-- 결정
--   회의록에 종속되는 target_type 집합을 {office_minute, office_minute_voice}로 넓힌다.
--   판정은 종전과 동일 — 열람은 app.can_read_minute, 업로드는 app.is_minute_author(작성자).
--   음성 슬롯도 결국 회의록 첨부이므로 같은 경계를 공유하는 것이 옳다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(회의록 첨부).
--   · 데이터 등급: Internal(회의 음성). 개인정보 원본 아님(내부 회의 기록).
--   · 접근 주체: 내부 사용자 중 회의록 열람 권한자(참석자·참조·작성자 또는 전체공개 열람자).
--   · Scope: 회의록 단건(app.can_read_minute) · 업로드는 작성자(app.is_minute_author).
--   · 감사 로그: 파일 다운로드는 클라이언트 signed URL 흐름(기존 attachments와 동일).
--   · RLS: attachments 이미 활성. SELECT/INSERT/UPDATE 분리 유지, DELETE 정책 없음(soft).
--   · SECURITY DEFINER: 신규 없음 — 기존 can_read_minute/is_minute_author 재사용.
--   · 시드/더미: 없음.
-- =====================================================================

-- SELECT: 내부 사용자 조건은 그대로 두되, 회의록 첨부(일반+음성)이면 회의록 열람 권한을 요구.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select
  using (
    app.is_admin()
    or (
      app.current_app_user_id() is not null
      and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest')
      and (
        target_type not in ('office_minute', 'office_minute_voice')
        or app.can_read_minute(target_id)
      )
    )
  );

-- INSERT: 업로더 본인 조건은 그대로 두되, 회의록 첨부(일반+음성)이면 회의록 작성자만 업로드 가능.
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert
  with check (
    uploaded_by = app.current_app_user_id()
    and app.current_app_user_id() is not null
    and (
      target_type not in ('office_minute', 'office_minute_voice')
      or app.is_minute_author(target_id)
    )
  );

-- UPDATE 정책(admin 또는 업로더 본인)은 변경하지 않는다 — office_minute과 동일하게
-- 위 INSERT 가드상 음성 첨부의 업로더는 회의록 작성자뿐이라 소프트 삭제 권한이 자연히 제한된다.
