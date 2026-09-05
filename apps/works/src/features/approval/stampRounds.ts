import { LINE_KIND_ORDER, type ApprovalLineKind } from '@/features/approval/config'
import type { StampLine } from '@/features/approval/ApprovalStampTable'
import type { ReturnTarget } from '@/features/approval/ApprovalDecideModal'

/** 결재선 한 행 중 도장 표가 읽는 부분만. approvalApi.ApprovalDetail의 형태와 맞춘다. */
export interface RoundLine {
  id: string
  approver_id: string | null
  step_order: number
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  kind: ApprovalLineKind
  round: number
  comment: string | null
  decided_at: string | null
  return_to_step: number | null
  return_via_drafter: boolean | null
}

/**
 * 표에 세울 도장 한 칸 — 도장 표가 읽는 값에 **사람이 읽는 순번**을 더한 것.
 * 순번을 여기서 함께 내는 이유는 의견 창이 표에 선 것과 같은 숫자를 적어야 하기 때문이다.
 */
export interface SeqStampLine extends StampLine {
  seq: number
}

const kindOf = (l: RoundLine): ApprovalLineKind => l.kind ?? 'APPROVAL'
const roundOf = (l: RoundLine): number => l.round ?? 1

/** 문서의 현재 회차. model.currentRound와 같은 규칙(가장 큰 회차)이다. */
export function maxRound(lines: RoundLine[]): number {
  return lines.reduce((max, l) => Math.max(max, roundOf(l)), 1)
}

/**
 * 한 회차의 결재선 표에 세울 도장 행 — **그 회차의 행 + 건너뛴 지난 회차의 승인**.
 *
 * 되돌림이 앞 순번을 건너뛰면 그 자리는 새 회차에 아예 없다(다시 판단하지 않으므로 복제되지
 * 않는다). 그 자리를 비워 두면 결재선에 구멍이 생겨 **누가 봤는지를 표가 답하지 못한다** —
 * 건너뛴 사람이 나중에 "나는 이 내용을 본 적 없다"고 말할 때 화면이 사실을 말해야 하므로,
 * 지난 회차의 도장을 그 자리에 색만 물려 세우고 몇 차의 승인인지 한 줄로 적는다.
 *
 * 순번(seq)은 저장된 step_order가 아니라 **정렬 후의 자리**다 — 임시저장을 고치며 중간이
 * 빠지면 원장 값에 구멍이 생기는데, 사람이 읽는 순번에 2·4·5가 남으면 없는 3번을 찾게 된다.
 */
export function stampLinesForRound(lines: RoundLine[], round: number): SeqStampLine[] {
  const living = lines.filter((l) => roundOf(l) === round)

  // 건너뛴 자리 — 이 회차에 같은 (구분, 순번)이 없는 지난 회차의 승인. 여러 회차를 거쳤으면
  // 가장 최근 것 하나만 세운다(같은 사람의 같은 자리가 표에 두 번 서면 순번이 어긋난다).
  const carried = new Map<string, RoundLine>()
  for (const l of lines) {
    if (roundOf(l) >= round || l.decision !== 'APPROVED') continue
    const key = `${kindOf(l)}:${l.step_order}`
    if (living.some((v) => kindOf(v) === kindOf(l) && v.step_order === l.step_order)) continue
    const prev = carried.get(key)
    if (!prev || roundOf(prev) < roundOf(l)) carried.set(key, l)
  }

  const pool = [...living, ...carried.values()]

  return LINE_KIND_ORDER.flatMap((kind) => {
    const ofKind = pool.filter((l) => kindOf(l) === kind).sort((a, b) => a.step_order - b.step_order)
    // 되돌림 목적지를 사람이 읽는 순번으로 옮기려면 먼저 이 줄의 순번 지도가 있어야 한다.
    const seqByStep = new Map(ofKind.map((l, i) => [l.step_order, i + 1]))

    return ofKind.map((l, i) => {
      const carriedFrom = roundOf(l) < round ? roundOf(l) : null
      return {
        id: l.id,
        approverId: l.approver_id,
        stepOrder: l.step_order,
        seq: i + 1,
        decision: l.decision,
        kind,
        decidedAt: l.decided_at,
        comment: l.comment,
        carriedFromRound: carriedFrom,
        note: carriedFrom
          ? `${carriedFrom}차 승인`
          : l.decision === 'REJECTED'
            ? returnNote(l, seqByStep)
            : null,
      }
    })
  })
}

/** 되돌린 도장 아래 한 줄 — 어디로 되돌렸는지가 곧 다음에 일어날 일이다. */
function returnNote(line: RoundLine, seqByStep: Map<number, number>): string {
  const where =
    line.return_to_step != null ? `${seqByStep.get(line.return_to_step) ?? line.return_to_step}번부터` : '처음부터'
  // 기안자를 거치지 않는 되돌림은 문서가 그 자리에서 다시 도는 '반송'이라 이름이 다르다.
  return line.return_via_drafter === false ? `반송 → ${where}` : `→ ${where}`
}

/**
 * 되돌릴 수 있는 앞 순번 — **같은 구분에서 이미 승인한, 나보다 앞선 자리**뿐이다.
 *
 * 아직 처리하지 않은 뒤 순번으로는 보낼 수 없다(그것은 되돌림이 아니라 건너뛰기다). 다른
 * 구분의 사람에게 직접 보내는 것도 열지 않는다 — 합의 줄은 '다시 받기' 체크박스가 담당한다.
 */
export function returnTargetsFor(
  lines: RoundLine[],
  round: number,
  myKind: ApprovalLineKind,
  myStep: number,
  nameOf: (id: string | null) => string,
): ReturnTarget[] {
  const ofKind = lines
    .filter((l) => roundOf(l) === round && kindOf(l) === myKind)
    .sort((a, b) => a.step_order - b.step_order)

  return ofKind
    .map((l, i) => ({ line: l, seq: i + 1 }))
    .filter(({ line }) => line.step_order < myStep && line.decision === 'APPROVED')
    .map(({ line, seq }) => ({
      stepOrder: line.step_order,
      seq,
      name: nameOf(line.approver_id),
    }))
}
