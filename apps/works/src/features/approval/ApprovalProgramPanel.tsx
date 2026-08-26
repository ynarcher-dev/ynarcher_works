import { Badge, Spinner, cn } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { approvalText } from '@/features/approval/config'
import { PROGRAM_LINK_META, useApprovalProgramLinks } from '@/features/approval/programLinkApi'

/**
 * 워크스페이스 연동 패널(상세) — 이 결재 문서가 **어느 사업의 일인가**를 읽기 전용으로 보인다.
 * 대상은 AC 사업 / M&A 딜 / PROJECT 세 원장이며 N건이 걸릴 수 있다.
 *
 * 표기는 '관련 회의록' 패널과 같은 규격이다 — **한 건이 한 줄짜리 버튼**이고, 종류 배지·이름·
 * 사업코드가 그 한 줄 안에서 왼쪽부터 오른쪽 끝까지 자리를 나눠 갖는다. 행 전체가 곧 버튼이라
 * 여는 아이콘을 따로 세우지 않으며, 이름이 길면 줄을 늘리는 대신 잘라낸다(전체 이름은 건너간
 * 사업 상세가 답한다). 상세의 곁다리 패널이라 세로 자리를 아낄수록 본문이 먼저 보인다.
 *
 * **여기서 걸고 떼지 않는다.** 연동은 첨부와 마찬가지로 문서를 쓰는 동안 정하는 것이라
 * 기안·수정 화면(ApprovalProgramField)이 소유한다 — 이미 상신되어 도장이 찍히기 시작한
 * 문서의 소속이 바뀌면, 결재자가 무엇을 보고 승인했는지 판정할 근거가 사라진다.
 *
 * 바로 아래 '상호 참조 문서'와 축이 다르다. 저쪽은 결재 문서끼리의 방향 없는 관계(근거 품의 ↔
 * 지출결의)이고, 이쪽은 문서가 자기 소속을 가리키는 방향 있는 참조다. 그래서 위에 둔다 —
 * 결재자가 문서를 열고 처음 묻는 것이 "이게 어느 사업 건인가"이기 때문이다.
 *
 * 사업명은 그 워크스페이스를 열람할 수 있을 때만 채워진다(원장 RLS). 권한이 없으면 연동이
 * 걸려 있다는 사실만 남고 이름 자리는 '접근 권한 없음'이 된다 — 회의록 연동과 같은 처리다.
 */
export function ApprovalProgramPanel({ documentId }: { documentId: string }) {
  const navigate = useNavigate()
  const { data: links, isLoading } = useApprovalProgramLinks(documentId)
  const list = links ?? []

  return (
    <DetailPanelCard title="워크스페이스 연동" count={list.length}>
      {isLoading && list.length === 0 ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className={approvalText.empty}>연동된 프로젝트가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((l) => {
            const meta = PROGRAM_LINK_META[l.targetType]
            // 이름이 비어 있으면 열 수 없는 대상이다(권한 없음) — 누를 수 없게 잠근다.
            const canOpen = Boolean(l.title)
            return (
              <li key={l.linkId}>
                <button
                  type="button"
                  disabled={!canOpen}
                  title={canOpen ? `${l.title} 열기` : '접근 권한이 없어 열 수 없는 대상입니다'}
                  onClick={() => navigate(meta.toPath(l.targetId))}
                  className="flex w-full min-w-0 items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-25 disabled:hover:bg-gray-25"
                >
                  <Badge tone={canOpen ? 'info' : 'neutral'}>{meta.kindLabel}</Badge>
                  <span className={cn('min-w-0 flex-1 truncate text-left', approvalText.primary)}>
                    {l.title ?? '접근 권한 없음'}
                  </span>
                  {l.code && (
                    <span className={cn('shrink-0 tabular-nums', approvalText.meta)}>{l.code}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </DetailPanelCard>
  )
}
