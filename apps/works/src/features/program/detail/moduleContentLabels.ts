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
