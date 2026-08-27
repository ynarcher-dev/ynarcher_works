import { memberSummary } from '@/lib/memberLabel'
import type { ProgramManagerRole } from '@/features/program/hooks'

/** 표기에 필요한 최소 형태 — 원장 임베드(ProgramManager)와 기업 상세의 축약 조회가 함께 만족한다. */
interface ManagerLike {
  user_id: string
  role: ProgramManagerRole
  user: { name: string | null } | null
}

/**
 * 사업 담당자 표시명: 대표(PM) 1명 + "외 N"(공용 규격 memberSummary).
 *
 * 담당자 원장은 사람당 복수 구간(단계·기간별)을 담으므로 user_id로 먼저 접는다 —
 * 접지 않으면 한 사람이 구간 수만큼 세어져 "외 N"이 부풀어 오른다.
 * 지정 담당자가 없으면 null(호출부가 '미지정' 등 맥락에 맞게 적는다).
 *
 * 사업 목록과 기업 상세의 '참여 사업' 표가 같은 사업을 두 화면에서 보여주므로 규칙을 한 곳에
 * 둔다 — 갈라지면 같은 사업의 담당자가 화면마다 다르게 접힌다.
 */
export function programManagerLabel(managers: readonly ManagerLike[] | null | undefined): string | null {
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
  return memberSummary(ordered.map((p) => p.name))
}
