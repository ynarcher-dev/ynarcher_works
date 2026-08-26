import { Badge, Spinner, cn } from '@ynarcher/ui'
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
 * 한 자리에 같은 모양으로 모인다. 행 규격도 바로 위 '워크스페이스 연동'과 같다 — **한 건이
 * 한 줄짜리 버튼**이고 상태 배지·제목·문서 번호가 그 한 줄 안에서 왼쪽부터 오른쪽 끝까지
 * 자리를 나눠 갖는다. 사업코드와 문서 번호는 둘 다 "그래서 어느 건인가"에 답하는 같은 성격의
 * 값이라 같은 자리에 선다. 양식명·기안일은 줄에서 뺐다 — 건너간 문서의 머리가 이미 답하는
 * 것이고, 곁다리 패널은 세로 자리를 아낄수록 본문이 먼저 보인다.
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
        <ul className="space-y-1.5">
          {list.map((doc) => (
            <li key={doc.linkId}>
              {/* 행 전체가 곧 [열기]라 여는 아이콘을 따로 세우지 않는다(워크스페이스 연동과
                  같은 문법). onOpen이 없는 자리에서는 누를 곳이 없으므로 버튼을 비활성으로
                  두어, 눌러도 아무 일이 없는 행이 생기지 않게 한다. */}
              <button
                type="button"
                disabled={!onOpen}
                title={onOpen ? `${doc.title} 열기` : undefined}
                onClick={() => onOpen?.(doc.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-white"
              >
                <Badge tone={DOC_STATUS_TONE[doc.status]}>{DOC_STATUS_LABEL[doc.status]}</Badge>
                <span className={cn('min-w-0 flex-1 truncate text-left', approvalText.primary)}>
                  {doc.title}
                </span>
                <span className={cn('shrink-0 tabular-nums', approvalText.meta)}>
                  {doc.docNo ?? '미채번'}
                </span>
              </button>
              {/* 메모는 지금은 걸 수 없는 값이지만(다건 선택 UI에 한 건짜리 메모 칸을 두면
                  고른 전부에 같은 말이 붙는다) 예전에 남긴 것은 계속 읽힌다. 사람이 쓴
                  문장이라 줄 안에 욱여넣지 않고 아래에 그대로 편다. */}
              {doc.note && <p className={cn('mt-0.5 px-3', approvalText.body)}>{doc.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </DetailPanelCard>
  )
}
