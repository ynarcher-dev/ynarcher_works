import {
  Field,
  Input,
  PickLine,
  PickList,
  PickMark,
  PickRow,
  Spinner,
  TransferPanes,
} from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { ParticipantRightTable } from '@/features/program/ParticipantRightTable'
import type { ParticipantPersona } from '@/features/program/participantPersona'
import type { useParticipantTransfer } from '@/features/program/participantTransfer'
import { useGuestHost } from '@/features/guest/host'

/**
 * 계정생성 창의 두 기둥 — **왼쪽은 계정 없음, 오른쪽은 계정 있음**이다.
 *
 * 축을 '고른 것 / 안 고른 것'이 아니라 **계정 유무**로 세운 것이 요점이다. 담당자가 이 창을
 * 여는 이유는 무언가를 고르기 위해서가 아니라 *이 사업에서 누가 로그인하는가*를 정하기
 * 위해서이고, 그 물음의 답은 좌우 두 목록에 이미 그려져 있다. 종전 한 목록에서는 그 답이
 * '등록됨'이라는 회색 꼬리표로만 남아, 계정을 몇 건 세웠는지 알려면 창을 닫고 표로 돌아가야 했다.
 *
 * **체크하고 가운데 버튼으로 옮긴다**(2026-09-10 사용자 지정). 줄을 누르면 곧바로 건너가던
 * 종전 방식은 한 번에 한 줄뿐이라 기수 시작처럼 스무 곳을 한꺼번에 여는 자리에서 스무 번을
 * 눌러야 했다. 결재선 설정 창이 먼저 쓰던 규격이고, 골격(`TransferPanes`)은 명단 담기 창과
 * 함께 쓴다 — 같은 손놀림이 창마다 다르게 생길 이유가 없다.
 */
export function ParticipantTransferPanes({
  spec,
  search,
  onSearchChange,
  isLoading,
  transfer,
}: {
  spec: ParticipantPersona
  search: string
  onSearchChange: (v: string) => void
  isLoading: boolean
  transfer: ReturnType<typeof useParticipantTransfer>
}) {
  const config = useGuestHost()
  const { left, right } = transfer

  return (
    <TransferPanes
      left={{
        title: '계정 없음',
        count: left.length,
        children: (
          <div className="space-y-2">
            <Field label="검색">
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={spec.pickSearchPlaceholder}
              />
            </Field>

            <div className="overflow-hidden rounded-radius-md border border-gray-200">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner />
                </div>
              ) : (
                <PickList
                  isEmpty={left.length === 0}
                  // 검색어가 없는데도 비었다면 걸러진 것이 아니라, 명단에 담긴 대상 전원이 이미
                  // 계정을 갖고 있다는 뜻이다 — 두 경우에 담당자가 할 일이 정반대다.
                  empty={
                    search.trim()
                      ? '검색 결과가 없습니다.'
                      : `계정이 없는 ${spec.label}가 없습니다. ${config.rosterLabel} 탭에서 먼저 담아 주세요.`
                  }
                >
                  {left.map((row) => {
                    const on = transfer.checkedLeft.includes(row.masterId)
                    return (
                      <PickRow
                        key={row.masterId}
                        selected={on}
                        onClick={() => transfer.toggleLeft(row.masterId)}
                      >
                        <PickMark checked={on}>
                          <Check className="size-3" />
                        </PickMark>
                        {/* 왼쪽에서 하는 일은 이름으로 찾아 고르는 것뿐이다 — 연락처는 옮기고
                            나서 오른쪽 기둥이 답한다(`PickLine` 주석). */}
                        <PickLine name={row.name} />
                        {row.removingParticipantId && (
                          // 내린 줄은 **확정하면 지워진다**. 그 사실을 좌측에서 말하지 않으면
                          // '아직 안 담은 것'과 생김새가 같아, 되돌리려는 손이 그 줄을 못 찾는다.
                          <span className="shrink-0 text-body-sm text-danger">뺌</span>
                        )}
                      </PickRow>
                    )
                  })}
                </PickList>
              )}
            </div>
          </div>
        ),
      }}
      right={{
        title: '계정 있음',
        count: right.length,
        children: (
          <ParticipantRightTable
            spec={spec}
            rows={right}
            checked={transfer.checkedRight}
            onCheckedChange={transfer.setCheckedRight}
          />
        ),
      }}
      toRight={{
        count: transfer.checkedLeft.length,
        onMove: transfer.moveRight,
        onMoveAll: transfer.moveAllRight,
        allDisabled: left.length === 0,
      }}
      toLeft={{
        count: transfer.checkedRight.length,
        onMove: transfer.moveLeft,
        onMoveAll: transfer.moveAllLeft,
        allDisabled: right.length === 0,
      }}
    />
  )
}
