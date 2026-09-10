import type { ReactNode } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { cn } from '../utils/cn'

/**
 * 좌우 두 목록 사이로 줄을 옮기는 창의 골격 — **왼쪽은 아직 아닌 것, 오른쪽은 정해진 것**이다.
 *
 * 한 목록에서 체크만 하는 창과 갈리는 지점은 *지금까지 무엇을 골랐는가*가 눈에 보이는가다.
 * 원장이 수천 건이 되면 한 목록에서는 방금 고른 셋이 검색어를 바꾸는 순간 목록 아래로
 * 흩어지고, 담당자는 저장 버튼의 `(3)`이라는 숫자 하나로만 자기가 무엇을 골랐는지 안다.
 * 오른쪽 기둥은 그 숫자를 **목록으로** 되돌려 준다.
 *
 * **옮기는 것은 체크한 줄이고, 옮기는 조작은 가운데 버튼이다.** 줄을 누르는 즉시 건너가는
 * 방식도 있었으나(계정생성 창의 첫 모양) 그러면 열 건을 옮기는 데 열 번을 누르게 되고, 무엇보다
 * 같은 창의 왼쪽 목록이 '체크해서 고르는 곳'인데 오른쪽만 '눌러서 실행하는 곳'이 되어 같은
 * 생김새의 줄이 자리마다 다르게 동작한다. 체크 → 옮기기는 결재선 설정 창이 먼저 쓰던 규격이다.
 *
 * **각 기둥의 속은 화면이 채운다.** 검색칸·목록·아래 안내줄이 창마다 다르고(계정생성의 오른쪽
 * 줄에는 입력칸이 서고, 명단 담기의 왼쪽 아래에는 '새로 등록'이 선다), 그것까지 이 부품이
 * 가지면 창이 하나 늘 때마다 여기에 분기가 하나 는다. 이 부품이 소유하는 것은 **기둥의 배치와
 * 가운데 버튼 넷**이다 — 손으로 쓰던 동안 그 넷은 창마다 라벨도 순서도 폭도 달랐다.
 */
export interface TransferSide {
  title: ReactNode
  /** 제목 옆 건수. 이 창에서 세는 대상이 몇 건인지는 언제나 답해야 한다. */
  count?: number
  children: ReactNode
}

export interface TransferMove {
  /** 그 기둥에서 지금 체크된 줄 수 — 버튼의 `(N)`이자 활성 여부다. */
  count: number
  onMove: () => void
  /**
   * 보이는 줄 전부 옮기기. 생략하면 그 버튼을 세우지 않는다 — 한쪽으로만 '전부'가 성립하는
   * 창이 있다(되돌릴 수 없는 쪽으로 한 번에 미는 버튼은 두지 않는다).
   */
  onMoveAll?: () => void
  allDisabled?: boolean
}

export interface TransferPanesProps {
  left: TransferSide
  right: TransferSide
  /** 왼쪽 → 오른쪽. */
  toRight: TransferMove
  /** 오른쪽 → 왼쪽. */
  toLeft: TransferMove
  className?: string
}

/**
 * 기둥 폭 — **왼쪽은 정해진 폭, 오른쪽은 남는 폭 전부**다(2026-09-10).
 *
 * 반반으로 나누던 자리다. 갈라 놓고 보니 두 기둥이 세우는 것이 서로 달랐다 — 왼쪽 줄에는
 * 이름 하나가 서고 오른쪽 줄에는 그 대상을 확정하는 값들(이메일·연락처·조직)이 한 줄에
 * 함께 선다. 폭이 같으면 왼쪽은 이름 하나를 두고 절반을 비워 두는데 오른쪽은 그 폭이
 * 모자라 값이 잘린다.
 *
 * 왼쪽을 `1fr`이 아니라 고정 폭으로 두는 이유도 같다 — 창이 넓어질수록 남는 폭은 값이 여럿인
 * 쪽으로 가야 한다. 결재선 설정 창이 먼저 쓰던 규격(18rem)보다 조금 넓은 것은 여기 서는 것이
 * 사람 이름만이 아니라 기업명일 수 있어서다.
 */
const PANE_GRID = 'lg:grid-cols-[20rem_auto_minmax(0,1fr)]'

export function TransferPanes({ left, right, toRight, toLeft, className }: TransferPanesProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4', PANE_GRID, className)}>
      <Card title={left.title} count={left.count}>
        {left.children}
      </Card>

      {/* 두 기둥을 잇는 조작이라 어느 한쪽 끝에 붙이지 않고 세로 가운데에 세운다.
          방향끼리 묶고(넣기·전체 넣기 / 빼기·전체 빼기) 묶음 사이만 벌린다 — 넷을 같은
          간격으로 세우면 어느 버튼이 어느 방향인지 화살표를 하나씩 읽어야 안다. */}
      <div className="flex flex-row flex-wrap items-center justify-center gap-2 lg:flex-col">
        <MoveButton label="넣기" move={toRight} dir="right" />
        <MoveButton label="전체 넣기" move={toRight} dir="right" all />
        <div className="hidden h-2 lg:block" aria-hidden />
        <MoveButton label="빼기" move={toLeft} dir="left" />
        <MoveButton label="전체 빼기" move={toLeft} dir="left" all />
      </div>

      <Card title={right.title} count={right.count}>
        {right.children}
      </Card>
    </div>
  )
}

/**
 * 가운데 버튼 한 개. 넷이 같은 성격의 조작이라 폭을 라벨 길이에 맡기지 않고 맞춰 세운다
 * ('전체 빼기'만 넓어지면 넷 중 하나가 더 큰 일처럼 읽힌다).
 *
 * 화살표는 언제나 **가는 방향 쪽**에 붙는다(오른쪽으로 가면 라벨 뒤, 왼쪽으로 가면 라벨 앞).
 */
function MoveButton({
  label,
  move,
  dir,
  all,
}: {
  label: string
  move: TransferMove
  dir: 'left' | 'right'
  all?: boolean
}) {
  if (all && !move.onMoveAll) return null

  const disabled = all ? move.allDisabled : move.count === 0
  const glyph = <Chevron dir={dir} double={all} />

  return (
    <Button
      variant="outline"
      onClick={all ? move.onMoveAll : move.onMove}
      disabled={disabled}
      className="w-full justify-between lg:w-32"
    >
      {dir === 'left' && glyph}
      {/* 체크한 줄을 옮기는 버튼만 건수를 든다 — '전체'는 보이는 줄 전부라 셀 것이 없다. */}
      <span>{all || move.count === 0 ? label : `${label} (${move.count})`}</span>
      {dir === 'right' && glyph}
    </Button>
  )
}

/** `packages/ui`는 아이콘 라이브러리에 의존하지 않는다(lucide chevron과 같은 형태를 그린다). */
function Chevron({ dir, double }: { dir: 'left' | 'right'; double?: boolean }) {
  const path = dir === 'right' ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'
  const second = dir === 'right' ? 'm4 18 6-6-6-6' : 'm20 18-6-6 6-6'
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
      {double && <path d={second} />}
    </svg>
  )
}
