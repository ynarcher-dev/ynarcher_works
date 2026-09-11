-- 회의록 외부 참석자에서 STARTUP 대표자를 기업 원장 참조로 직접 연결한다.
--
-- NETWORKS 사람 행이나 게스트 신원을 만들지 않는다. meeting_minute_links에는 이미 startup이
-- 일반 연동(SUBJECT) 대상으로 허용돼 있고 app.can_link_minute_target()도 STARTUP 열람권한과
-- 생존 행을 검증하므로, 외부 참석자 역할의 대상 CHECK만 좁게 확장한다.
-- 대표자명·이메일·연락처는 링크 행에 복제하지 않으며 target_id=startups.id만 저장한다.

ALTER TABLE public.meeting_minute_links
  DROP CONSTRAINT meeting_minute_links_attendee_target_check;

ALTER TABLE public.meeting_minute_links
  ADD CONSTRAINT meeting_minute_links_attendee_target_check
  CHECK (
    role <> 'EXTERNAL_ATTENDEE'
    OR target_type IN ('network', 'startup')
  )
  NOT VALID;

ALTER TABLE public.meeting_minute_links
  VALIDATE CONSTRAINT meeting_minute_links_attendee_target_check;

COMMENT ON CONSTRAINT meeting_minute_links_attendee_target_check
  ON public.meeting_minute_links IS
  '외부 참석자는 NETWORKS 인물 또는 STARTUP이 직접 소유한 대표자만 가리킨다.';

COMMENT ON COLUMN public.meeting_minute_links.role IS
  '링크 이유: SUBJECT(회의가 다룬 대상) 또는 EXTERNAL_ATTENDEE(NETWORKS 인물/STARTUP 대표자).';

-- 기존 함수 본문은 작성자/admin을 다시 확인하지만, 기본 PUBLIC 실행권한 때문에 anon도 RPC를
-- 호출할 수 있었다. 함수는 바꾸지 않고 API 표면만 실제 사용 주체와 맞춘다.
REVOKE ALL ON FUNCTION public.set_minute_links(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_minute_links(uuid, jsonb) TO authenticated;
