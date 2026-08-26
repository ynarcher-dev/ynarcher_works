import { Badge, IconButton, Spinner, cn } from '@ynarcher/ui'
import { ExternalLink } from 'lucide-react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { useDocumentLinks } from '@/features/approval/documentLinkApi'
import { DOC_STATUS_LABEL, DOC_STATUS_TONE, approvalText } from '@/features/approval/config'

interface ApprovalLinkPanelProps {
  documentId: string
  /** 참조 문서를 눌렀을 때 그 문서로 이동한다. */
  onOpen?: (id: string) => void
}

/**
 * 상호 참조 문서 패널(상세) — 이 문서와 관련된 다른 결재 문서를 읽기 전용으로 보인다.
 *
 * **참조는 방향이 없다.** 기안 화면에서 B를 걸면 B의 상세에도 이 문서가 나타난다(원장에 행이
 * 쌍마다 하나뿐이고, 조회가 양방향으로 펴기 때문이다 — documentLinkApi 참조). 그래서
 * 화면에는 '건 문서/걸린 문서' 구분이 없고 목록도 하나다.
 *
 * **여기서 걸고 떼지 않는다.** 참조는 첨부·연동과 마찬가지로 문서를 쓰는 동안 정하는 것이라
 * 기안·수정 화면(ApprovalDocLinkField)이 소유한다 — 도장이 찍히기 시작한 문서의 근거가
 * 나중에 바뀌면, 결재자가 무엇을 보고 승인했는지 판정할 근거가 사라진다.
 *
 * 첨부·의견 패널과 같은 우측 패널 규격(DetailPanelCard)을 쓴다 — 문서에 곁들이는 것들은
 * 한 자리에 같은 모양으로 모인다.
 */
export function ApprovalLinkPanel({ documentId, onOpen }: ApprovalLinkPanelProps) {
  const { data: links, isLoading } = useDocumentLinks(documentId)
  const list = links ?? []

  return (
    <DetailPanelCard title="상호 참조 문서" count={list.length}>
      {isLoading && list.length === 0 ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className={cn('py-4 text-center', approvalText.empty)}>연결된 문서가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {list.map((doc) => (
            <li
              key={doc.linkId}
              className="flex items-start gap-2 rounded-radius-sm border border-gray-200 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={DOC_STATUS_TONE[doc.status]}>{DOC_STATUS_LABEL[doc.status]}</Badge>
                  <span className={cn('truncate', approvalText.primary)}>{doc.title}</span>
                </div>
                <p className={cn('mt-0.5 truncate', approvalText.meta)}>
                  {[doc.formName, doc.docNo ?? '미채번', doc.createdAt.slice(0, 10)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {doc.note && <p className={cn('mt-0.5', approvalText.body)}>{doc.note}</p>}
              </div>
              {onOpen && (
                <IconButton
                  density="table"
                  variant="ghost"
                  label="문서 열기"
                  onClick={() => onOpen(doc.id)}
                  icon={<ExternalLink size={14} />}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailPanelCard>
  )
}
