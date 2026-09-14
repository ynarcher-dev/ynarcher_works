import { CONTEXT_KIND_LABEL, type GuestEntityKey } from '@/auth/guestStore'

/**
 * 맥락 한 줄을 **무엇으로 보여 줄 것인가**를 정하는 자리(2026-09-13 신설).
 *
 * 로그인 직후의 선택 화면, 사이드바 전환기, 개요 요약이 같은 맥락을 세 곳에서 그린다. 값이
 * 같아도 조립이 각자면 어느 화면에서는 종류가 서고 다른 화면에서는 빠지는 일이 생긴다 —
 * 실제로 선택 화면에는 종류(프로젝트/M&A/FUND)가 아예 없었고, 같은 회사가 사업에도 조합에도
 * 걸리면 목록의 두 줄이 제목만으로는 갈리지 않았다. 조립 규칙을 한곳에 두고 화면은 그린다.
 */

/** 태그 한 칸. 중립 톤이다 — 아래 주석 참조. */
export interface ContextTag {
  /** 같은 목록 안에서 key로 쓸 수 있는 값. */
  key: string
  label: string
}

/**
 * 이 맥락을 설명하는 종류 태그 한 칸이다.
 *
 * 색은 쓰지 않는다. 색이 답하는 것은 상태(진행중·종료·취소)이고, 종류는
 * 상태가 아니라 분류다 — 종류마다 색을 주면 같은 목록에서 '진행중'과 'FUND'가 같은 무게로
 * 경쟁하고, 색이 만들던 위계가 무너진다(4_color_system_rules.md).
 *
 * 모르는 값은 지어내지 않는다 — 구 세션이 복원되면 종류 칸이 비어 들어오는데, 그때
 * '프로젝트'를 임의로 세우면 조합에 들어와 있는 사람에게 틀린 말을 하게 된다.
 */
export function contextTags(entityKey: string | null | undefined): ContextTag[] {
  const tags: ContextTag[] = []
  const kind = entityKey ? CONTEXT_KIND_LABEL[entityKey as GuestEntityKey] : undefined
  if (kind) tags.push({ key: `kind:${entityKey}`, label: kind })
  return tags
}

/**
 * 사업(조합) 기간 한 줄 — `2026. 9. 12. ~ 2027. 1. 14.`(2026-09-14 사용자 지정).
 *
 * 목록 줄이 답하는 물음이 '이 사업이 언제부터 언제까지인가'로 바뀌면서 종전의 코드·접근
 * 종료일을 대신한다. **아는 쪽만 세운다** — 한쪽이 비면 그 자리를 비운 채 물결표만 남기고,
 * 둘 다 없으면 아무 말도 하지 않는다(담당자가 정하지 않은 것을 화면이 정하지 않는다).
 */
export function programPeriodLabel(
  start?: string | null,
  end?: string | null,
): string | null {
  const from = dateLabel(start)
  const to = dateLabel(end)
  if (!from && !to) return null
  return `${from ?? ''} ~ ${to ?? ''}`.trim()
}

function dateLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('ko-KR')
}

/**
 * 접근이 끝나는 날. 참여 줄마다 다르며(3_9_1 §8) 없으면 아무 말도 하지 않는다 —
 * '무기한'이라고 적으면 담당자가 아직 정하지 않은 것을 정해진 것처럼 말하게 된다.
 */
export function accessEndLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `~ ${d.toLocaleDateString('ko-KR')}`
}

/**
 * 전환기가 지금 무엇으로 서야 하는가.
 *
 * · `switchable` : 갈 곳이 둘 이상 — 펼칠 수 있는 컨트롤
 * · `single`     : 갈 곳이 하나 — 읽기 전용 표시(고를 것이 없는데 열리는 컨트롤을 두지 않는다)
 * · `loading`    : 아직 목록을 모른다 — 현재 맥락은 세우되 '하나뿐'이라고 단정하지 않는다
 * · `error`      : 목록을 받지 못했다 — 다시 시도할 길을 함께 준다
 *
 * 목록을 이미 들고 있으면 다시 받는 중이어도 `switchable`을 유지한다. 갱신 때마다 컨트롤이
 * 읽기 전용으로 접혔다 펴지면, 누르려던 순간에 눌 수 없는 것으로 바뀐다.
 */
export type SwitcherState = 'switchable' | 'single' | 'loading' | 'error'

export function switcherState(input: {
  count: number
  loading: boolean
  error: boolean
}): SwitcherState {
  if (input.count > 1) return 'switchable'
  if (input.error) return 'error'
  if (input.loading) return 'loading'
  return 'single'
}
