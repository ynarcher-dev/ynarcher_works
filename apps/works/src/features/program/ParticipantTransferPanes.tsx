import { Button, Card, Field, Input, PickList, PickRow, Spinner, cardText, cn } from '@ynarcher/ui'
import { ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { ParticipantRightRow } from '@/features/program/ParticipantRightRow'
import type { MasterTable, ParticipantPersona } from '@/features/program/participantPersona'
import type { useParticipantTransfer } from '@/features/program/participantTransfer'

/**
 * 계정생성 창의 두 기둥 — **왼쪽은 계정 없음, 오른쪽은 계정 있음**이다.
 *
 * 축을 '고른 것 / 안 고른 것'이 아니라 **계정 유무**로 세운 것이 요점이다. 담당자가 이 창을
 * 여는 이유는 무언가를 고르기 위해서가 아니라 *이 사업에서 누가 로그인하는가*를 정하기
 * 위해서이고, 그 물음의 답은 좌우 두 목록에 이미 그려져 있다. 종전 한 목록에서는 그 답이
 * '등록됨'이라는 회색 꼬리표로만 남아, 계정을 몇 건 세웠는지 알려면 창을 닫고 표로 돌아가야 했다.
 *
 * **개별 이동은 줄을 누르는 것 하나다**(결재선 설정 창처럼 체크한 뒤 가운데 버튼을 누르지
 * 않는다). 저쪽은 고른 사람을 **결재·합의·재무합의·참조 넷 중 어디로** 보낼지 정해야 해서
 * 고르기와 보내기가 갈리지만, 여기는 갈 자리가 하나뿐이라 그 두 동작이 같은 뜻이 된다.
 * 가운데 버튼이 맡는 것은 한 줄씩으로는 못 하는 일(전부 옮기기)뿐이다.
 */
export function ParticipantTransferPanes({
  master,
  spec,
  search,
  onSearchChange,
  isLoading,
  transfer,
}: {
  master: MasterTable
  spec: ParticipantPersona
  search: string
  onSearchChange: (v: string) => void
  isLoading: boolean
  transfer: ReturnType<typeof useParticipantTransfer>
}) {
  const { left, right } = transfer

  return (
    // 좌측은 이름 한 줄이면 충분하고 우측은 이름·계정 선택·입력 세 칸이 서므로 넓다.
    // 반반으로 나누면 왼쪽은 남고 오른쪽은 좁아 입력칸이 한 칸씩 접힌다.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1.4fr]">
      <Card title="계정 없음" count={left.length}>
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
                // 검색어가 없는데도 비었다면 걸러진 것이 아니라, 참가자 목록에 담긴 대상 전원이
                // 이미 계정을 갖고 있다는 뜻이다 — 두 경우에 담당자가 할 일이 정반대다.
                empty={
                  search.trim()
                    ? '검색 결과가 없습니다.'
                    : `계정이 없는 ${spec.label}가 없습니다. 참가자 목록 탭에서 먼저 담아 주세요.`
                }
              >
                {left.map((row) => (
                  <PickRow key={row.masterId} onClick={() => transfer.add(row)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-gray-900">
                        <span className="font-medium">{row.name}</span>
                      </span>
                      <span className="block truncate text-body-sm text-gray-600">{row.meta}</span>
                    </span>
                    {row.removingParticipantId ? (
                      // 내린 줄은 **확정하면 지워진다**. 그 사실을 좌측에서 말하지 않으면
                      // '아직 안 담은 것'과 생김새가 같아, 되돌리려는 손이 그 줄을 못 찾는다.
                      <span className="shrink-0 text-body-sm text-danger">뺌</span>
                    ) : (
                      <ChevronRight size={14} className="shrink-0 text-gray-400" />
                    )}
                  </PickRow>
                ))}
              </PickList>
            )}
          </div>
        </div>
      </Card>

      {/* 두 기둥을 잇는 조작이라 어느 한쪽 끝에 붙이지 않고 세로 가운데에 세운다. */}
      <div className="flex flex-row flex-wrap items-center justify-center gap-2 lg:flex-col">
        <Button
          variant="outline"
          onClick={() => transfer.addAll(left)}
          disabled={left.length === 0}
          className="w-full justify-between lg:w-32"
        >
          전체 넣기
          <ChevronsRight size={14} />
        </Button>
        <Button
          variant="outline"
          onClick={() => transfer.takeAll(right)}
          disabled={right.length === 0}
          className="w-full justify-between lg:w-32"
        >
          <ChevronsLeft size={14} />
          전체 빼기
        </Button>
      </div>

      <Card title="계정 있음" count={right.length}>
        {/* 좌우 기둥이 같은 높이에서 끝나도록 잡은 값(좌: 검색칸 + 목록). */}
        <div className="h-[23rem] overflow-y-auto rounded-radius-md border border-gray-200">
          {right.length === 0 ? (
            <p className={cn('px-3 py-10 text-center', cardText.meta)}>
              왼쪽에서 줄을 눌러 계정을 세울 대상을 옮기세요.
            </p>
          ) : (
            right.map((row) => (
              <ParticipantRightRow
                key={row.masterId}
                master={master}
                row={row}
                choice={transfer.people[row.masterId]}
                onChange={(next) => transfer.setChoice(row.masterId, next)}
                onRemove={() => transfer.take(row)}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
