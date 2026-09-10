import { PickList, PickMark, PickRow, TransferPanes, cardText, cn } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { RosterCandidateList } from '@/features/program/RosterCandidateList'
import type { RosterPick } from '@/features/program/rosterPick'

/**
 * 명단 담기 창의 두 기둥 — **왼쪽은 원장, 오른쪽은 이번에 담을 대상**이다.
 *
 * 좌우로 가른 이유는 원장의 크기다(2026-09-10 사용자 지정). 후보 조회는 전사 원장을 검색어로
 * 긁어 50건씩 내려 주는데, 한 목록에서 체크만 하던 동안에는 검색어를 바꾸는 순간 방금 고른
 * 줄이 목록 밖으로 사라졌다 — 원장이 커질수록 담당자가 자기 선택을 되읽을 방법이 저장 버튼의
 * 숫자 하나뿐이 된다. 오른쪽 기둥은 그 숫자를 목록으로 되돌린다.
 *
 * 계정생성 창과 **같은 부품**(`TransferPanes`)을 쓴다. 두 창이 하는 일은 다르지만(저기는
 * 계정을 세우고 여기는 참가 사실을 담는다) 담당자가 하는 손놀림은 같다 — 왼쪽에서 체크하고
 * 가운데로 옮기고 오른쪽을 확인한 뒤 저장한다. 같은 손놀림이 창마다 다르게 생길 이유가 없다.
 */
export function RosterPickPanes({
  master,
  isLoading,
  search,
  onSearchChange,
  pick,
  /** 왼쪽 기둥 아래 — '원장에 없나요?'로 시작하는 다른 길들(새로 등록·대용량 업로드). */
  footer,
}: {
  master: MasterTable
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  pick: RosterPick
  footer?: ReactNode
}) {
  const spec = PARTICIPANT_PERSONAS[master]
  /** 이미 담긴 줄은 옮길 수 없다 — '전체 넣기'가 옮길 것이 있는지도 그 값이 답한다. */
  const movable = pick.left.filter((c) => !c.alreadyMapped)

  return (
    <TransferPanes
      left={{
        title: `${spec.label} 원장`,
        count: pick.left.length,
        children: (
          <div className="space-y-3">
            <RosterCandidateList
              master={master}
              candidates={pick.left}
              isLoading={isLoading}
              search={search}
              onSearchChange={onSearchChange}
              checked={pick.checkedLeft}
              onToggle={pick.toggleLeft}
            />
            {footer}
          </div>
        ),
      }}
      right={{
        title: '담을 대상',
        count: pick.right.length,
        children: (
          <div className="overflow-hidden rounded-radius-md border border-gray-200">
            <PickList
              isEmpty={pick.right.length === 0}
              empty="왼쪽에서 대상을 고르고 [넣기]를 누르세요."
            >
              {pick.right.map((c) => {
                const on = pick.checkedRight.includes(c.id)
                return (
                  <PickRow key={c.id} selected={on} onClick={() => pick.toggleRight(c.id)}>
                    <PickMark checked={on}>
                      <Check className="size-3" />
                    </PickMark>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-gray-900">
                        <span className="font-medium">{c.name}</span>
                        {c.loginName && <span className="text-gray-500"> · {c.loginName}</span>}
                      </span>
                      <span className={cn('block truncate', cardText.meta)}>
                        {c.email ?? c.phone ?? '원장에 연락처 없음'}
                      </span>
                    </span>
                  </PickRow>
                )
              })}
            </PickList>
          </div>
        ),
      }}
      toRight={{
        count: pick.checkedLeft.length,
        onMove: pick.moveRight,
        onMoveAll: pick.moveAllRight,
        allDisabled: movable.length === 0,
      }}
      toLeft={{
        count: pick.checkedRight.length,
        onMove: pick.moveLeft,
        onMoveAll: pick.moveAllLeft,
        allDisabled: pick.right.length === 0,
      }}
    />
  )
}
