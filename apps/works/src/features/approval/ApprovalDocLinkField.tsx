import { Badge, Button, IconButton, Input, Modal, PanelCard, cn } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApprovalDocuments } from '@/features/approval/approvalApi'
import { isInvolved } from '@/features/approval/model'
import { DOC_STATUS_LABEL, DOC_STATUS_TONE, approvalText } from '@/features/approval/config'

/** 기안 화면이 들고 있는 참조 1건. 저장에 필요한 것은 id뿐이고 나머지는 표시용이다. */
export interface DocLinkDraft {
  id: string
  title: string
  docNo: string | null
  status: keyof typeof DOC_STATUS_LABEL
}

interface Props {
  /** 지금 쓰고 있는 문서. 자기 자신은 후보에서 뺀다. */
  documentId?: string
  /** 후보를 가르는 기준(당사자인 문서만) — 서버 정책과 같은 규칙. */
  userId: string | null
  value: DocLinkDraft[]
  onChange: (next: DocLinkDraft[]) => void
}

/**
 * 상호 참조 문서 입력(기안·수정 화면) — 이 결재의 근거가 되는 다른 결재 문서를 문서를 쓰는
 * 동안 건다(지출결의서가 근거 품의를, 변경 계약이 원 계약을 가리키는 식).
 *
 * 고른 명단은 문서가 저장될 때 한 번에 원장에 반영된다(useSyncDocumentLinks) — 참조는 방향이
 * 없어 상대 문서 상세에도 곧바로 나타나므로, 여기서 즉시 저장하면 아직 상신하지도 않은(또는
 * 결국 버려질) 기안이 남의 문서에 걸린 것으로 읽힌다.
 */
export function ApprovalDocLinkField({ documentId, userId, value, onChange }: Props) {
  const [picking, setPicking] = useState(false)

  return (
    <PanelCard
      title="상호 참조 문서"
      count={value.length}
      action={
        <Button variant="secondary" onClick={() => setPicking(true)}>
          문서 연결
        </Button>
      }
    >
      {value.length === 0 ? (
        <p className={cn('py-4 text-center', approvalText.empty)}>연결된 문서가 없습니다.</p>
      ) : (
        // 바로 위 '워크스페이스 연동'과 같은 한 줄 규격 — 배지·제목·식별자가 왼쪽부터 오른쪽
        // 끝까지 자리를 나눠 갖는다. 문서 번호를 제목 **아래**로 내리면 두 패널이 나란히 선
        // 자리에서 행 높이와 눈이 훑는 경로가 갈리고, 사업코드와 문서 번호는 둘 다 "그래서
        // 어느 건인가"에 답하는 같은 성격의 값이라 같은 자리(오른쪽 끝)에 서야 한다.
        <ul className="space-y-1.5">
          {value.map((d) => (
            <li
              key={d.id}
              className="flex min-w-0 items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2"
            >
              <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
              <span className={cn('min-w-0 flex-1 truncate', approvalText.primary)}>{d.title}</span>
              <span className={cn('shrink-0 tabular-nums', approvalText.meta)}>
                {d.docNo ?? '미채번'}
              </span>
              <IconButton
                density="table"
                variant="ghost"
                danger
                label="연결 해제"
                onClick={() => onChange(value.filter((v) => v.id !== d.id))}
                icon={<X size={14} />}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 열려 있는 동안에만 세운다 — 창을 닫으면 고르던 것이 함께 사라져야 하고(취소),
          다시 열면 지금의 명단에서 출발해야 한다. 마운트가 그 초기화를 대신한다. */}
      {picking && (
        <DocLinkPickerModal
          documentId={documentId}
          userId={userId}
          value={value}
          onChange={onChange}
          onClose={() => setPicking(false)}
        />
      )}
    </PanelCard>
  )
}

/**
 * 연결할 문서 고르기 — 내가 **당사자**인 문서만 목록에 오른다(기안·결재선·참조). 같은 부서라서
 * 보이는 문서는 후보에 올리지 않는다: 서버 정책(is_approval_participant)과 같은 규칙이며,
 * 여기서 거르지 않으면 고를 수는 있는데 저장 단계에서야 실패한다.
 * 창 안의 선택은 [확인]을 눌러야 문서에 반영된다(결재선 설정 창과 같은 규칙).
 */
function DocLinkPickerModal({
  documentId,
  userId,
  value,
  onChange,
  onClose,
}: Props & { onClose: () => void }) {
  const [keyword, setKeyword] = useState('')
  const [draft, setDraft] = useState<DocLinkDraft[]>(value)
  const { data: docs } = useApprovalDocuments()

  const picked = useMemo(() => new Set(draft.map((d) => d.id)), [draft])

  const candidates = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return (docs ?? [])
      .filter((d) => d.id !== documentId)
      .filter((d) => (userId ? isInvolved(d, userId) : false))
      .filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          (d.doc_no ?? '').toLowerCase().includes(q) ||
          (d.form?.name ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [docs, documentId, keyword, userId])

  const toggle = (d: DocLinkDraft) =>
    setDraft(picked.has(d.id) ? draft.filter((v) => v.id !== d.id) : [...draft, d])

  return (
    <Modal
      open
      onClose={onClose}
      title="상호 참조 문서 연결"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => {
              onChange(draft)
              onClose()
            }}
          >
            확인
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className={approvalText.meta}>
          이 결재의 근거가 되는 다른 결재 문서를 겁니다. 내가 기안·결재·참조로 걸려 있는 문서만 고를
          수 있으며, 여러 건을 고를 수 있습니다.
        </p>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="제목, 문서 번호, 양식 검색"
        />
        <div className="h-80 overflow-auto rounded-radius-md border border-gray-200">
          {candidates.length === 0 ? (
            <p className={cn('py-10 text-center', approvalText.empty)}>
              연결할 수 있는 문서가 없습니다.
            </p>
          ) : (
            candidates.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() =>
                  toggle({
                    id: d.id,
                    title: d.title,
                    docNo: d.doc_no,
                    status: d.status,
                  })
                }
                className={cn(
                  'flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left last:border-b-0',
                  picked.has(d.id) ? 'bg-info-subtle' : 'hover:bg-gray-50',
                )}
              >
                <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
                <span className={cn('min-w-0 flex-1 truncate', approvalText.primary)}>
                  {d.title}
                </span>
                <span className={approvalText.meta}>{d.doc_no ?? '미채번'}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
