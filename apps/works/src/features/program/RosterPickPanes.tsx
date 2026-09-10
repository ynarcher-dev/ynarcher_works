import { Badge, PickList, PickMark, PickRow, TransferPanes, cardText, cn } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { RosterCandidateList } from '@/features/program/RosterCandidateList'
import type { RosterPick } from '@/features/program/rosterPick'

/**
 * 명단 담기 창의 두 기둥 — **왼쪽은 아직 안 담긴 원장 행, 오른쪽은 이 사업 명단**이다.
 *
 * 좌우로 가른 이유는 원장의 크기다(2026-09-10 사용자 지정). 후보 조회는 전사 원장을 검색어로
 * 긁어 50건씩 내려 주는데, 한 목록에서 체크만 하던 동안에는 검색어를 바꾸는 순간 방금 고른
 * 줄이 목록 밖으로 사라졌다 — 원장이 커질수록 담당자가 자기 선택을 되읽을 방법이 저장 버튼의
 * 숫자 하나뿐이 된다. 오른쪽 기둥은 그 숫자를 목록으로 되돌린다.
 *
 * **이미 담긴 줄은 오른쪽에 선다**(2026-09-10 수정) — 왼쪽에 회색으로 세우면 '아직 아닌 것'이라는
 * 축이 거짓을 말하고, 아예 감추면 검색해도 안 나와 담당자가 `새로 등록`으로 가서 중복 원장 행을
 * 만든다. 다만 그 줄은 이 창에서 내리지 못한다 — 빼는 자리는 명단 표와 그 확인창이다.
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
  /** 왼쪽 기둥 아래 — '원장에 없나요?'로 시작하는 다른 길들(새로 등록·CSV파일 업로드). */
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
        title: '이 사업 명단',
        count: pick.right.length,
        children: (
          <div className="overflow-hidden rounded-radius-md border border-gray-200">
            <PickList
              isEmpty={pick.right.length === 0}
              empty="왼쪽에서 대상을 고르고 [넣기]를 누르세요."
            >
              {pick.right.map((row) => {
                const draft = row.kind === 'draft'
                const on = draft && pick.checkedRight.includes(row.id)
                return (
                  <PickRow
                    key={row.id}
                    selected={on}
                    // 이미 담긴 줄은 이 창에서 내리지 못한다 — 빼는 자리는 명단 표와 그
                    // 확인창이고, 여기서 함께 내리면 되돌릴 수 없는 일이 확인 없이 일어난다.
                    disabled={!draft}
                    onClick={() => pick.toggleRight(row.id)}
                  >
                    {draft ? (
                      <PickMark checked={on}>
                        <Check className="size-3" />
                      </PickMark>
                    ) : (
                      // 체크 자리를 비워 두면 두 갈래의 이름이 서로 다른 들여쓰기에서 시작한다.
                      <span className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-gray-900">
                        <span className="font-medium">{row.name}</span>
                        {row.loginName && <span className="text-gray-500"> · {row.loginName}</span>}
                      </span>
                      <span className={cn('block truncate', cardText.meta)}>
                        {row.email ?? row.phone ?? '원장에 연락처 없음'}
                      </span>
                    </span>
                    {draft ? (
                      <Badge tone="info">이번에 담기</Badge>
                    ) : (
                      <span className="shrink-0 text-body-sm text-gray-500">담김</span>
                    )}
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
        allDisabled: pick.left.length === 0,
      }}
      toLeft={{
        count: pick.checkedRight.length,
        onMove: pick.moveLeft,
        onMoveAll: pick.moveAllLeft,
        // 내릴 수 있는 것은 이번에 올린 줄뿐이라, 이미 담긴 줄만 있으면 누를 것이 없다.
        allDisabled: pick.staged.length === 0,
      }}
    />
  )
}
