/**
 * 알림의 target_type(코멘트 대상 유형) → 해당 레코드 상세 경로.
 * entity_feedback.target_type은 단수 리소스 타입이고, 라우트 세그먼트는 복수 엔티티 키라
 * 명시적 역매핑이 필요하다(router.tsx / networks/config.ts PROFILE_RESOURCE_TYPE 기준).
 */

/** 국내 네트워크: 단수 target_type → 복수 라우트 세그먼트. */
const NETWORK_SEGMENT: Record<string, string> = {
  expert: 'experts',
  van: 'van',
  exp: 'exp',
  investor: 'investors',
  corporate: 'corporates',
  institution: 'institutions',
  university: 'universities',
  etc: 'etc',
  other: 'others',
  // vendor(외주/거래)는 라우트가 은퇴해 이동 경로가 없다.
}

/**
 * 알림 클릭 시 이동할 경로를 만든다. 경로를 확정할 수 없으면 null(이동 불가로 처리).
 * @param targetType entity_feedback.target_type
 * @param targetId   대상 레코드 id(모든 상세 라우트가 :id 파라미터로 받는다)
 */
export function notificationRoute(targetType: string, targetId: string): string | null {
  switch (targetType) {
    case 'global_network':
      return `/networks/global/${targetId}`
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
    default: {
      const seg = NETWORK_SEGMENT[targetType]
      return seg ? `/networks/${seg}/${targetId}` : null
    }
  }
}
