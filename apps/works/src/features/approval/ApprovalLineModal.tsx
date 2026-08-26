import { Button, IconButton, Input, Modal, TagChip, cn, tableText, useToast } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ApprovalOrgTree, type OrgPerson } from '@/features/approval/ApprovalOrgTree'
import type { ApprovalLineInput } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, LINE_KIND_ORDER } from '@/features/approval/config'

interface ApprovalLineModalProps {
  open: boolean
  /** 열릴 때의 결재선·참조(취소하면 이 값으로 되돌아간다). */
  lines: ApprovalLineInput
  recipientIds: string[]
  excludeId?: string | null
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
  excludeId,
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
  const excludeIds = useMemo(() => {
    const s = new Set(assigned)
    if (excludeId) s.add(excludeId)
    return s
  }, [assigned, excludeId])

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
    else setDraft((prev) => ({ ...prev, [slot]: prev[slot].filter((x) => x !== id) }))
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

  const confirm = () => {
    if (draft.APPROVAL.length === 0) {
      toast.show('결재자를 한 명 이상 지정하세요.', 'warning')
      return
    }
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr]">
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

        {/* 중앙: 고른 사람을 어느 자리로 보낼지 */}
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 lg:flex-col lg:justify-start lg:pt-10">
          {SLOTS.map((slot) => (
            <Button key={slot} variant="outline" onClick={() => assign(slot)}>
              {SLOT_LABEL[slot]}
              <ChevronRight size={14} className="ml-1" />
            </Button>
          ))}
        </div>

        {/* 우: 정해진 결재선 */}
        <div className="space-y-3">
          <div className="h-80 overflow-auto rounded-radius-md border border-gray-200">
            {LINE_KIND_ORDER.every((k) => draft[k].length === 0) ? (
              <p className={cn('py-10 text-center', tableText.empty)}>
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
                    <span className={cn('w-5 shrink-0 text-center', tableText.meta)}>
                      {kind === 'APPROVAL' ? i + 1 : ''}
                    </span>
                    <span className={cn('w-16 shrink-0', tableText.head)}>
                      {LINE_KIND_LABEL[kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={tableText.body}>{nameOf(id)}</span>
                      {titleOf(id) && (
                        <span className={cn('ml-2', tableText.meta)}>{titleOf(id)}</span>
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
            <p className={tableText.head}>참조</p>
            <div className="min-h-[4rem] rounded-radius-md border border-gray-200 p-2">
              {draftCc.length === 0 ? (
                <p className={tableText.empty}>지정된 참조자가 없습니다.</p>
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
