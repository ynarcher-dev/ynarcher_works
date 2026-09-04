/**
 * 알림의 target_type(코멘트 대상 유형) → 해당 레코드 상세 경로.
 * entity_feedback.target_type은 다형 단수 키이고, 라우트는 그 키가 가리키는 화면이다.
 */

/**
 * 옛 네트워크 단수 키들. 2026-09-04 원장 통합으로 저장값은 'network' 하나가 되었지만,
 * 통합 이전에 발송된 알림이 옛 키를 들고 있을 수 있어 같은 화면으로 받아 준다.
 * (원장 행의 id는 이관에서 보존되므로 그 알림들은 여전히 올바른 레코드를 연다.)
 */
const LEGACY_NETWORK_TYPES = new Set([
  'expert', 'van', 'exp', 'investor', 'corporate', 'institution',
  'university', 'etc', 'other', 'vendor', 'global_network',
])

/**
 * 알림 클릭 시 이동할 경로를 만든다. 경로를 확정할 수 없으면 null(이동 불가로 처리).
 * @param targetType entity_feedback.target_type
 * @param targetId   대상 레코드 id(모든 상세 라우트가 :id 파라미터로 받는다)
 */
export function notificationRoute(targetType: string, targetId: string): string | null {
  switch (targetType) {
    case 'startup':
      return `/startup/discovered/${targetId}`
    case 'employee':
      // /management/hr 와 /office/managers 두 라우트가 같은 화면을 열지만, HR을 기본으로 쓴다.
      return `/management/hr/${targetId}`
    case 'program':
      return `/ac/programs/${targetId}`
    case 'ma_program':
      return `/mna/programs/${targetId}`
    case 'project_program':
      return `/project/programs/${targetId}`
    case 'board_post':
      // 게시글은 소속 게시판 탭 안에서 열린다(/office?tab=<slug>&post=<id>). 알림은 slug를 모르므로
      // post만 실어 보내고, OfficePage가 글의 게시판을 찾아 탭을 보정한다.
      return `/office?post=${targetId}`
    case 'office_minute':
      // 회의록은 탭이 고정('minutes')이라 slug 조회 없이 바로 딥링크한다(MinutesWorkspace가 minute=로 연다).
      return `/office?tab=minutes&minute=${targetId}`
    case 'asset_checkout':
      // 반출 알림이 가리키는 것은 반출 건이 아니라 그 물건이다 — 요청·이력·처리 버튼이 모두
      // 물품 모달 안에 있어서, 물건을 여는 것이 곧 그 요청 앞에 서는 것이다.
      return `/office?tab=outbound&asset=${targetId}`
    case 'network':
      return `/networks/record/${targetId}`
    default:
      return LEGACY_NETWORK_TYPES.has(targetType) ? `/networks/record/${targetId}` : null
  }
}
