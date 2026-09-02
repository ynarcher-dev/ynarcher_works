import { memberNames } from '@/lib/memberLabel'
import type { ProgramManagerRole } from '@/features/program/hooks'

/** 표기에 필요한 최소 형태 — 원장 임베드(ProgramManager)와 기업 상세의 축약 조회가 함께 만족한다. */
interface ManagerLike {
  user_id: string
  role: ProgramManagerRole
  user: { name: string | null } | null
}

/**
 * 사업 담당자 이름 목록 — 대표(PM)를 맨 앞에 세운 전원.
 *
 * 담당자 원장은 사람당 복수 구간(단계·기간별)을 담으므로 user_id로 먼저 접는다 —
 * 접지 않으면 한 사람이 구간 수만큼 되풀이된다. 지정 담당자가 없으면 빈 배열이다
 * (호출부가 '미지정' 등 맥락에 맞게 적는다).
 *
 * 몇 명까지 적을지는 여기서 정하지 않는다(2026-09-02) — 열 폭이 허락하는 만큼 적고 넘치는 수를
 * `+N`으로 알리는 일은 셀(`PersonCell`)의 몫이고, 그 판정은 글자 폭을 재야만 할 수 있다.
 * 이 함수가 소유하는 것은 **누가 먼저 오는가**뿐이다.
 *
 * 사업 목록과 기업 상세의 '참여 사업' 표가 같은 사업을 두 화면에서 보여주므로 순서 규칙을 한 곳에
 * 둔다 — 갈라지면 같은 사업의 담당자가 화면마다 다른 사람으로 시작한다.
 */
export function programManagerNames(managers: readonly ManagerLike[] | null | undefined): string[] {
  const byUser = new Map<string, { name: string | null | undefined; isPm: boolean }>()
  for (const m of managers ?? []) {
    const prev = byUser.get(m.user_id)
    byUser.set(m.user_id, {
      name: m.user?.name ?? prev?.name,
      isPm: (prev?.isPm ?? false) || m.role === 'PM',
    })
  }
  const people = [...byUser.values()]
  const pm = people.find((p) => p.isPm)
  const ordered = pm ? [pm, ...people.filter((p) => p !== pm)] : people
  return memberNames(ordered.map((p) => p.name))
}
