/**
 * 연차 원장이 서기 전까지 휴가 내역 화면이 읽는 **임시 값 한 벌**.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 이 파일이 따로 있는 이유는 하나다 — **바꿀 자리를 한 곳으로 묶어 두기 위해서다.** 화면 안에
 * 숫자를 박아 두면 원장이 선 날 화면 여러 곳을 뒤져야 하고, 그중 하나를 놓치면 실제 잔여와
 * 다른 수가 한 칸에 남는다. 훅의 모양(`{ data, isLoading }`)을 실제 조회 훅과 같게 두어, 매핑은
 * 이 파일의 구현만 바꾸는 일이 되게 한다.
 *
 * **합계는 여기 적지 않는다.** 총·사용·잔여는 아래 `leaveLedgerTotals`가 행에서 더해 낸다 —
 * 지어낸 합계를 함께 적어 두면 행과 합이 어긋난 채로도 화면이 멀쩡해 보이고, 원장이 붙었을 때
 * 그 합계 계산이 그대로 남아 있어야 값만 바뀐다.
 *
 * 화면은 이 값이 예시임을 반드시 함께 적는다(`LEAVE_LEDGER_NOTICE`). 잔여 일수는 사람이 그대로
 * 믿고 휴가를 신청하는 수라, 예시인지 실제인지 말하지 않으면 화면이 거짓말을 하는 셈이 된다.
 */
import dayjs from 'dayjs'

/** 하루 = 8시간. 발생·사용은 시간 단위로 세고(반차·반반차), 표기만 일/시간으로 나눈다. */
export const LEAVE_DAY_MINUTES = 8 * 60

/** 휴가 발생 한 줄(지급 이력). */
export interface LeaveGrantRow {
  id: string
  /** 발생일. */
  grantedOn: string
  /** 이 줄로 늘어난 휴가(분). */
  minutes: number
  /** 발생 사유 — `정기 휴가`·`수동생성` 등. */
  reason: string
  /** 비고 — 산식이나 부여한 사람을 적는 자리. */
  note: string
}

/** 휴가 사용 한 줄(소진 이력). 사용일과 그날 쓴 시간만 답한다. */
export interface LeaveUsageRow {
  id: string
  usedOn: string
  minutes: number
  /** 휴가 종류(연차·반차 등). */
  typeLabel: string
}

export interface LeaveLedger {
  grants: LeaveGrantRow[]
  usages: LeaveUsageRow[]
}

/** 화면이 값 옆에 함께 적는 말. 한 곳에 두어 카드마다 다른 말로 갈리지 않게 한다. */
export const LEAVE_LEDGER_NOTICE =
  '연차 지급·소진 원장 연동 전이라 아래 값은 화면 배치를 확인하기 위한 예시입니다.'

/** 올해 1월 1일. 정기 발생은 회계연도 첫날에 선다. */
const yearStart = (year: number) => `${year}-01-01`

/**
 * 그 해의 임시 원장 한 벌.
 *
 * 값은 **한 사람의 한 해**를 그럴듯하게 채우는 최소한이다(정기 15일 + 생일반차 4시간, 사용 몇 줄).
 * 연도를 바꿔도 같은 모양이 서는 이유는, 이 화면이 확인해야 할 것이 '이 해에 실제로 몇 일을
 * 썼는가'가 아니라 표와 합계가 어떻게 서는가이기 때문이다.
 */
export function mockLeaveLedger(year: number): LeaveLedger {
  return {
    grants: [
      {
        id: `${year}-regular`,
        grantedOn: yearStart(year),
        minutes: 15 * LEAVE_DAY_MINUTES,
        reason: '정기 휴가',
        note: `연차 (15일 x 8시간=${15 * 8}시간)`,
      },
      {
        id: `${year}-birthday`,
        grantedOn: `${year}-07-30`,
        minutes: 4 * 60,
        reason: '수동생성',
        note: '생일반차 (0.5일 x 8시간=4시간)',
      },
    ],
    usages: [
      { id: `${year}-u1`, usedOn: `${year}-03-11`, minutes: LEAVE_DAY_MINUTES, typeLabel: '연차' },
      { id: `${year}-u2`, usedOn: `${year}-05-02`, minutes: LEAVE_DAY_MINUTES, typeLabel: '연차' },
      { id: `${year}-u3`, usedOn: `${year}-07-06`, minutes: 2 * 60, typeLabel: '반반차' },
      { id: `${year}-u4`, usedOn: `${year}-08-07`, minutes: 4 * 60, typeLabel: '생일반차' },
    ],
  }
}

/**
 * 임시 원장 조회 — 훅 모양을 실제 조회와 맞춰 둔다.
 *
 * 원장이 서면 이 함수의 안쪽만 `useQuery`로 바뀌고, 부르는 화면은 그대로다. `isLoading`을 늘
 * `false`로 두는 것은 값이 이미 손 안에 있기 때문이며, 화면이 로딩을 다루는 길을 미리 열어 둔다.
 */
export function useMyLeaveLedger(year: number): { data: LeaveLedger; isLoading: boolean } {
  return { data: mockLeaveLedger(year), isLoading: false }
}

export interface LeaveLedgerTotals {
  /** 그 해에 발생한 총 휴가(분). */
  grantedMinutes: number
  /** 그 해에 쓴 휴가(분). */
  usedMinutes: number
  /** 남은 휴가(분). 음수가 되지 않게 누르지 않는다 — 초과 사용은 초과로 보여야 한다. */
  remainingMinutes: number
}

/** 행에서 합계를 낸다. 지어낸 합계를 따로 들지 않는다. */
export function leaveLedgerTotals(ledger: LeaveLedger): LeaveLedgerTotals {
  const grantedMinutes = ledger.grants.reduce((sum, g) => sum + g.minutes, 0)
  const usedMinutes = ledger.usages.reduce((sum, u) => sum + u.minutes, 0)
  return { grantedMinutes, usedMinutes, remainingMinutes: grantedMinutes - usedMinutes }
}

/**
 * 분 → `2일 6시간`. 휴가는 일과 시간 두 단위로 읽는 값이라 시간만으로 적지 않는다
 * (`120시간`이라고 적으면 며칠인지 사람이 8로 나눠야 한다).
 *
 * 0분은 `0일`이고, 음수(초과 사용)는 앞에 `-`를 붙여 그대로 적는다.
 */
export function leaveAmountText(minutes: number): string {
  const sign = minutes < 0 ? '-' : ''
  const abs = Math.abs(minutes)
  const days = Math.floor(abs / LEAVE_DAY_MINUTES)
  const hours = Math.floor((abs % LEAVE_DAY_MINUTES) / 60)
  const mins = abs % 60
  const parts = [
    days > 0 ? `${days}일` : '',
    hours > 0 ? `${hours}시간` : '',
    mins > 0 ? `${mins}분` : '',
  ].filter(Boolean)
  return sign + (parts.length > 0 ? parts.join(' ') : '0일')
}

/** 발생 내역 표의 `최종` 칸 — 그 줄까지 쌓인 누계다(위에서부터 더해 내려온다). */
export function runningGrantMinutes(grants: LeaveGrantRow[]): number[] {
  let sum = 0
  return grants.map((g) => {
    sum += g.minutes
    return sum
  })
}

/** 발생 내역은 이른 날짜부터 읽는다 — 누계가 위에서 아래로 쌓이는 표이기 때문이다. */
export function sortedGrants(ledger: LeaveLedger): LeaveGrantRow[] {
  return [...ledger.grants].sort((a, b) => a.grantedOn.localeCompare(b.grantedOn))
}

/** 사용 내역은 최근이 위다 — 방금 쓴 것을 먼저 확인하는 목록이다. */
export function sortedUsages(ledger: LeaveLedger): LeaveUsageRow[] {
  return [...ledger.usages].sort((a, b) => b.usedOn.localeCompare(a.usedOn))
}

/** 화면이 여는 기본 연도. 오늘이 속한 해다. */
export function currentLeaveYear(): number {
  return dayjs().year()
}
