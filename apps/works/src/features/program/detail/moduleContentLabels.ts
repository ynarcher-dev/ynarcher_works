/**
 * 모듈 삭제 차단 사유의 원장명 → 사람이 읽는 이름.
 *
 * 라벨을 DB가 아니라 화면이 갖는 이유는, 서버가 돌려주는 것이 '무엇이 몇 건 남았는가'라는
 * 사실이고 그것을 뭐라 부를지는 표시의 문제이기 때문이다. 서버(program_module_delete_blockers)는
 * 카탈로그를 훑어 원장명만 답하므로, 여기에 없는 원장이 나오면 원장명을 그대로 보여 준다 —
 * 새 템플릿이 생긴 날 사유가 사라지는 것보다 낯선 이름이 보이는 편이 낫다.
 */
const CONTENT_LABEL: Record<string, string> = {
  // 모집
  application_forms: '모집 신청서',
  application_form_fields: '신청서 항목',
  application_submissions: '지원서',
  application_answers: '지원서 답변',
  // 평가(서류·대면·데모데이)
  evaluation_forms: '평가표',
  evaluation_criteria: '평가 항목',
  evaluation_targets: '평가 대상',
  evaluation_assignments: '평가 배정',
  evaluation_submissions: '평가 제출',
  evaluation_answers: '평가 답변',
  document_review_rounds: '서류평가 회차',
  document_review_snapshots: '서류평가 기록',
  onsite_eval_sessions: '대면평가 세션',
  onsite_eval_presentations: '대면평가 발표',
  selection_results: '선정 결과',
  demoday_sessions: '데모데이 세션',
  demoday_presentations: '데모데이 발표',
  demoday_interests: '데모데이 관심표명',
  follow_up_meetings: '후속 미팅',
  // 오리엔테이션·출석
  orientation_sessions: 'OT 세션',
  session_attendees: '세션 참석자',
  session_materials: '세션 자료',
  attendance_logs: '출석 기록',
  // 멘토링
  mentoring_relationships: '멘토링 관계',
  mentoring_sessions: '멘토링 세션',
  mentoring_logs: '멘토링 기록',
  mentor_satisfaction_records: '멘토링 만족도',
  mentor_feedback_records: '멘토링 피드백',
  // 비즈니스 매칭
  matching_events: '매칭 회차',
  matching_tables: '매칭 테이블',
  matching_slots: '매칭 슬롯',
  matching_bookings: '매칭 예약',
  counseling_logs: '상담 기록',
  // 성과
  module_kpi_snapshots: 'KPI 스냅샷',
  outcome_records: '성과 기록',
  // 기본 3종·알림·첨부
  program_posts: '글',
  program_links: 'URL 첨부',
  program_notices: '알림',
  attachments: '첨부 파일',
}

/**
 * 원장명을 표시 이름으로. 사업 3종은 원장이 물리 분리돼 접두사만 다르므로(ma_ / project_)
 * 접두사를 떼고 한 번만 이름을 둔다 — 워크스페이스마다 같은 뜻의 라벨을 세 벌 두면
 * 하나를 고칠 때 나머지 둘이 옛 이름으로 남는다.
 */
export function moduleContentLabel(relName: string): string {
  const base = relName.replace(/^(?:ma|project)_/, '')
  return CONTENT_LABEL[base] ?? base
}
