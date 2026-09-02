// 모듈 공개 링크의 **판정만** 담은 순수 모듈(입출력 없음).
//
// 조회에서 떼어 낸 이유는 이 판정이 이 기능에서 틀리면 가장 크게 다치는 자리이기 때문이다 —
// 한쪽으로 틀리면 닫은 문이 열려 있고, 반대로 틀리면 열어 둔 문이 담당자 몰래 닫힌다.
// DB 클라이언트를 물고 있으면 단위 테스트가 불가능해 그 위험이 배포 뒤에야 드러난다.
//
// 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §6.3, §6.4, §8

/** 열 수 없는 사유. null이면 공개 가능. */
export type LinkDenyReason =
  | 'not_found' // 그런 주소가 없다(토큰 오류)
  | 'private' // 주소는 있으나 아직 열지 않았다
  | 'closed' // 담당자가 마감했거나 기간이 지났다
  | 'scheduled' // 아직 열릴 때가 안 됐다
  | 'module_closed' // 메뉴가 꺼졌거나 취소됐다(사업 종료·삭제 포함)

export interface GateInput {
  /** 링크 원장의 저장값. */
  linkStatus: string
  linkOpenAt: string | null
  linkCloseAt: string | null
  /** 모듈 세팅의 기간('YYYY-MM-DD'). 링크에 기간이 없으면 이 값을 상속한다. */
  moduleStartDate: string | null
  moduleEndDate: string | null
  /** 모듈이 원장에 남아 있는가(고아 링크 판별). */
  moduleExists: boolean
  moduleEnabled: boolean
  moduleStatus: string
  /** 사업이 살아 있는가(삭제·종료·취소가 아닌가). */
  programAlive: boolean
}

export interface GateResult {
  reason: LinkDenyReason | null
  /** 상속을 적용한 실제 공개 기간. 화면이 날짜를 말할 때 쓴다. */
  openAt: string | null
  closeAt: string | null
}

/**
 * 'YYYY-MM-DD'를 KST 하루의 시작/끝으로 읽는다.
 *
 * 모듈 기간은 시각이 없는 날짜라 그대로 Date로 넘기면 UTC 자정으로 해석되어, 한국에서
 * 마감일 당일 오전 9시부터 이미 닫힌다. 이 서비스의 날짜는 전부 KST 기준이므로 오프셋을
 * 명시해 읽는다. 마감일은 **그날이 끝날 때까지** 열려 있어야 한다(사람은 마감일을 포함으로 읽는다).
 */
export function kstDay(date: string, edge: 'start' | 'end'): string {
  return edge === 'start' ? `${date}T00:00:00+09:00` : `${date}T23:59:59.999+09:00`
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 링크에 적힌 기간이 우선, 없으면 모듈 기간을 상속. 같은 사실을 두 번 받지 않기 위한 규칙이다. */
export function effectiveWindow(input: GateInput): { openAt: string | null; closeAt: string | null } {
  const start = input.moduleStartDate && DATE_ONLY.test(input.moduleStartDate) ? input.moduleStartDate : null
  const end = input.moduleEndDate && DATE_ONLY.test(input.moduleEndDate) ? input.moduleEndDate : null
  return {
    openAt: input.linkOpenAt ?? (start ? kstDay(start, 'start') : null),
    closeAt: input.linkCloseAt ?? (end ? kstDay(end, 'end') : null),
  }
}

/**
 * 지금 이 링크를 열어 줄 수 있는가.
 *
 * 판정 순서는 좁은 것부터가 아니라 **바깥부터** 간다 — 링크 상태·기간 → 모듈 생존 → 사업 생존.
 * 안쪽에서 먼저 걸리면 열람자에게 돌려줄 사유가 실제 원인과 어긋난다(담당자가 마감해 둔 링크인데
 * "메뉴가 없습니다"라고 답하는 식).
 */
export function gate(input: GateInput, now: number = Date.now()): GateResult {
  const { openAt, closeAt } = effectiveWindow(input)
  const deny = (reason: LinkDenyReason): GateResult => ({ reason, openAt, closeAt })

  // 고아 링크(모듈이 지워짐)는 닫힌 것으로 답한다 — 주소가 틀린 것이 아니라 메뉴가 없어진 것이다.
  if (!input.moduleExists) return deny('module_closed')

  // (1) 링크 상태·기간
  if (input.linkStatus === 'PRIVATE') return deny('private')
  if (input.linkStatus !== 'OPEN') return deny('closed')
  if (openAt && now < new Date(openAt).getTime()) return deny('scheduled')
  if (closeAt && now > new Date(closeAt).getTime()) return deny('closed')

  // (2) 모듈 생존. 준비(DRAFT) 단계도 닫는다 — 메뉴가 서는 것과 그 안이 열리는 것은 다른
  //     물음이고, 담당자가 아직 준비로 둔 자료가 바깥에 먼저 나가서는 안 된다.
  if (!input.moduleEnabled) return deny('module_closed')
  if (input.moduleStatus !== 'OPEN' && input.moduleStatus !== 'CLOSED') return deny('module_closed')

  // (3) 사업 생존 — 종료·취소·삭제된 사업의 문은 함께 닫힌다.
  if (!input.programAlive) return deny('module_closed')

  return { reason: null, openAt, closeAt }
}

/** 거부 사유 → HTTP 상태. 주소가 틀린 것과 닫힌 것은 다른 사실이라 코드도 가른다. */
export function denyStatus(reason: LinkDenyReason): number {
  return reason === 'not_found' ? 404 : 403
}
