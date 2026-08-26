import { Button, IconButton, Input, Modal, TagChip, cn, useToast } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ApprovalOrgTree, type OrgPerson } from '@/features/approval/ApprovalOrgTree'
import type { ApprovalLineInput } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, LINE_KIND_ORDER, approvalText } from '@/features/approval/config'

interface ApprovalLineModalProps {
  open: boolean
  /** 열릴 때의 결재선·참조(취소하면 이 값으로 되돌아간다). */
  lines: ApprovalLineInput
  recipientIds: string[]
  onClose: () => void
  onConfirm: (lines: ApprovalLineInput, recipientIds: string[]) => void
}

type Slot = keyof ApprovalLineInput | 'CC'

const SLOT_LABEL: Record<Slot, string> = {
  APPROVAL: LINE_KIND_LABEL.APPROVAL,
  AGREEMENT: LINE_KIND_LABEL.AGREEMENT,
  FINANCE_AGREEMENT: LINE_KIND_LABEL.FINANCE_AGREEMENT,
  CC: '참조',
}

const SLOTS: Slot[] = [...LINE_KIND_ORDER, 'CC']

/**
 * 결재선 설정 — 조직에서 사람을 골라 결재 / 합의 / 재무합의 / 참조 네 자리로 보낸다.
 *
 * 기안 화면에 입력 칸을 늘어놓지 않고 창을 따로 여는 이유는, 결재선을 짜는 일이 문서를 쓰는
 * 일과 다른 종류의 작업이기 때문이다. 조직을 펼쳐 사람을 찾고, 자리를 정하고, 순서를 고치는
 * 동안에는 그 일에만 집중하는 화면이 필요하다. 정한 결과는 기안 화면에 결재선 표로 요약된다.
 *
 * 창 안의 편집은 [확인]을 눌러야 문서에 반영된다 — 조직을 뒤지다 창을 닫았을 뿐인데 결재선이
 * 바뀌어 있으면 안 된다.
 */
export function ApprovalLineModal({
  open,
  lines,
  recipientIds,
  onClose,
  onConfirm,
}: ApprovalLineModalProps) {
  const toast = useToast()
  const [draft, setDraft] = useState<ApprovalLineInput>(lines)
  const [draftCc, setDraftCc] = useState<string[]>(recipientIds)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [people, setPeople] = useState<Map<string, OrgPerson>>(new Map())

  // 창이 열릴 때마다 문서의 현재 결재선을 초안으로 싣는다.
  useEffect(() => {
    if (!open) return
    setDraft(lines)
    setDraftCc(recipientIds)
    setChecked(new Set())
    setKeyword('')
  }, [open, lines, recipientIds])

  const assigned = useMemo(
    () => new Set([...LINE_KIND_ORDER.flatMap((k) => draft[k]), ...draftCc]),
    [draft, draftCc],
  )
  // 이미 어느 자리에 배정된 사람만 후보에서 뺀다. **기안자 본인은 빼지 않는다** —
  // 자기가 올린 문서를 자기가 결재하는 흐름(1인 부서·소액 지출 등)이 실제로 있고,
  // 기안 도장과 결재 도장은 서로 다른 사실이라 한 사람이 둘 다 찍을 수 있다.
  const excludeIds = useMemo(() => new Set(assigned), [assigned])

  const nameOf = (id: string) => people.get(id)?.name ?? '(알 수 없음)'
  const titleOf = (id: string) => people.get(id)?.title ?? ''

  const assign = (slot: Slot) => {
    const ids = [...checked]
    if (ids.length === 0) {
      toast.show('조직에서 사람을 먼저 고르세요.', 'warning')
      return
    }
    if (slot === 'CC') setDraftCc((prev) => [...prev, ...ids])
    else setDraft((prev) => ({ ...prev, [slot]: [...prev[slot], ...ids] }))
    setChecked(new Set())
  }

  const removeFrom = (slot: Slot, id: string) => {
    if (slot === 'CC') setDraftCc((prev) => prev.filter((x) => x !== id))
    else
      setDraft((prev) => ({
        ...prev,
        [slot]: prev[slot].filter((x) => x !== id),
      }))
  }

  // 결재 순번 조정. 합의는 병렬이라 순서가 뜻을 갖지 않으므로 이동 버튼을 두지 않는다.
  const move = (index: number, delta: number) => {
    setDraft((prev) => {
      const list = [...prev.APPROVAL]
      const target = index + delta
      if (target < 0 || target >= list.length) return prev
      const [item] = list.splice(index, 1)
      list.splice(target, 0, item!)
      return { ...prev, APPROVAL: list }
    })
  }

  /**
   * 결재자가 비어 있어도 그대로 담는다 — 참조만 먼저 걸어 두고 결재자는 나중에 정하는
   * 순서가 실제로 있다. "결재자 한 명 이상"은 **상신**의 조건이지 결재선 편집의 조건이
   * 아니다(ApprovalEditor.submit이 상신 직전에 검사한다). 여기서 막으면 임시저장으로
   * 가는 길까지 함께 막힌다.
   */
  const confirm = () => {
    onConfirm(draft, draftCc)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="결재선 설정"
      size="2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={confirm}>확인</Button>
        </>
      }
    >
      {/* 조직(좌)은 이름이 서는 폭이면 충분하고, 결재선(우)은 구분·이름·직책·순서 조작이 한 줄에
          들어가야 하므로 넓다. 반반으로 나누면 왼쪽은 남고 오른쪽은 좁아 줄이 접힌다. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_auto_1fr]">
        {/* 좌: 조직에서 고르기 */}
        <div className="space-y-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름, 직책, 조직 검색"
          />
          <ApprovalOrgTree
            keyword={keyword}
            checked={checked}
            onCheckedChange={setChecked}
            excludeIds={excludeIds}
            onPeopleLoaded={setPeople}
          />
        </div>

        {/* 중앙: 고른 사람을 어느 자리로 보낼지. 두 패널 사이를 잇는 조작이라 어느 한쪽 끝에
            붙이지 않고 세로 가운데에 세운다. */}
        <div className="flex flex-row flex-wrap items-center justify-center gap-3 lg:flex-col lg:justify-center">
          {SLOTS.map((slot) => (
            // 네 버튼은 같은 성격의 조작이라 폭을 라벨 길이에 맡기지 않고 맞춰 세운다
            // ('재무합의'만 넓어지면 넷 중 하나가 더 중요한 자리처럼 읽힌다).
            <Button
              key={slot}
              variant="outline"
              onClick={() => assign(slot)}
              className="w-full justify-between lg:w-28"
            >
              {SLOT_LABEL[slot]}
              <ChevronRight size={14} />
            </Button>
          ))}
        </div>

        {/* 우: 정해진 결재선 */}
        <div className="space-y-3">
          {/* 좌우 기둥이 같은 높이에서 끝나도록 잡은 값(좌: 검색창+트리, 우: 목록+참조). */}
          <div className="h-[22.5rem] overflow-auto rounded-radius-md border border-gray-200">
            {LINE_KIND_ORDER.every((k) => draft[k].length === 0) ? (
              <p className={cn('py-10 text-center', approvalText.empty)}>
                왼쪽에서 사람을 고르고 가운데 버튼으로 자리를 정하세요.
              </p>
            ) : (
              LINE_KIND_ORDER.flatMap((kind) =>
                draft[kind].map((id, i) => (
                  <div
                    key={`${kind}-${id}`}
                    className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    {/* 순번은 결재에만 붙는다 — 합의에 번호를 달면 순서가 있는 것처럼 읽힌다. */}
                    <span className={cn('w-5 shrink-0 text-center', approvalText.meta)}>
                      {kind === 'APPROVAL' ? i + 1 : ''}
                    </span>
                    <span className={cn('w-16 shrink-0', approvalText.head)}>
                      {LINE_KIND_LABEL[kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={approvalText.body}>{nameOf(id)}</span>
                      {titleOf(id) && (
                        <span className={cn('ml-2', approvalText.meta)}>{titleOf(id)}</span>
                      )}
                    </span>
                    {kind === 'APPROVAL' && (
                      <>
                        <IconButton
                          density="table"
                          variant="ghost"
                          label="위로"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          icon={<ArrowUp size={14} />}
                        />
                        <IconButton
                          density="table"
                          variant="ghost"
                          label="아래로"
                          onClick={() => move(i, 1)}
                          disabled={i === draft.APPROVAL.length - 1}
                          icon={<ArrowDown size={14} />}
                        />
                      </>
                    )}
                    <IconButton
                      density="table"
                      variant="ghost"
                      danger
                      label="제외"
                      onClick={() => removeFrom(kind, id)}
                      icon={<X size={14} />}
                    />
                  </div>
                )),
              )
            )}
          </div>

          <div className="space-y-1">
            <p className={approvalText.head}>참조</p>
            <div className="min-h-[4rem] rounded-radius-md border border-gray-200 p-2">
              {draftCc.length === 0 ? (
                <p className={approvalText.empty}>지정된 참조자가 없습니다.</p>
              ) : (
                // 참조자는 순서도 도장도 없어 칩 나열이 맞다. 누르면 빠진다.
                <div className="flex flex-wrap gap-1.5">
                  {draftCc.map((id) => (
                    <TagChip
                      key={id}
                      density="table"
                      title={`${nameOf(id)} 제외`}
                      onClick={() => removeFrom('CC', id)}
                    >
                      {nameOf(id)}
                      <X size={12} className="ml-1" />
                    </TagChip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
