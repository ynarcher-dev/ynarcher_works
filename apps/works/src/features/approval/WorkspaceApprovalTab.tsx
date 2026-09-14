import { Badge, Banner, DataTable, ListToolbar, Spinner, cn, type Column } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APPROVAL_RELATION_LABEL, type ApprovalNode } from '@/features/approval/approvalTree'
import { DOC_STATUS_LABEL, DOC_STATUS_TONE } from '@/features/approval/config'
import { errorText } from '@/features/approval/errorText'
import { formatMoney } from '@/features/approval/numeric'
import type { ProgramLinkType } from '@/features/approval/programLinkApi'
import { useWorkspaceApprovals } from '@/features/approval/relatedApprovalsApi'

interface Props {
  targetType: ProgramLinkType
  targetId: string
}

/** 전자결재 문서함과 같은 한 장 분량(15건). 같은 결재를 두 화면이 다른 묶음으로 보이지 않는다. */
const PAGE_SIZE = 15

/**
 * 워크스페이스 전자결재 — PROJECT·M&A·FUND 상세가 공유하는 한 벌. 답하는 질문은 하나다:
 * **이 워크스페이스로 무슨 결재가 오갔나.**
 *
 * 2026-09-14에 우측 패널(`RelatedApprovalPanel`)에서 좌측 탭 줄로 옮겼고 자리는 예산/지출
 * 바로 오른쪽이다. 근거는 둘이다. 하나, 결재는 *이 워크스페이스 안에서 하는 일*이라 워크플로우
 * ·참가자·예산과 같은 축이다 — 우측 컬럼은 자료·회의록·변동이력·코멘트처럼 **일을 둘러싼**
 * 것들이 서는 자리다. 둘, 결재와 예산은 같은 원장을 앞뒤로 읽는다(배정 품의가 예산을 세우고
 * 그 줄에서 지출이 나간다). 두 질문이 탭 줄에서 이웃하면 "얼마가 배정됐나" 다음에
 * "무슨 결재가 오갔나"로 한 칸만 옮기면 된다.
 *
 * **목록은 평평하지 않고 계보다**(2026-09-14). 워크스페이스에 직접 연동된 문서가 뿌리로 서고,
 * 그 품의를 근거로 나간 지출과 상호 참조로 엮인 제반 서류(구매내역·계약서 등)가 바로 아래
 * 들여쓰여 선다. 담당자가 한 사업을 두고 찾는 것은 품의 한 장이 아니라 그 품의에 매달린 서류
 * 전부이기 때문이다. 무엇이 어디에 매달렸는지는 '관계' 열이 말한다 — 목록에 선 이유를 목록이
 * 답하지 못하면, 처음 보는 문서가 왜 이 사업 것인지 확인할 방법이 없다.
 *
 * **정렬을 켜지 않는 이유도 그것이다.** 열을 눌러 다시 줄을 세우면 부모와 자식이 흩어져
 * 들여쓰기가 거짓말을 한다. 순서는 조회가 소유한다(뿌리는 기안일 내림차순, 자식은 부모 아래).
 * 같은 이유로 **검색은 맞은 문서의 윗줄을 함께 남긴다** — 딸린 서류만 걸렸을 때 근거 품의가
 * 사라지면 그 줄이 무엇에 매달린 것인지 화면이 답하지 못한다.
 *
 * 좁은 패널이 아니라 넓은 자리에 서므로 **문서 번호가 함께 선다** — 곁다리 열에서 뺐던 이유가
 * "식별자를 둘 세우면 제목이 먹힌다"였는데, 여기서는 제목이 먹히지 않는다.
 *
 * **여기서 걸고 떼지 않는다.** 연동을 만드는 자리는 기안·수정 화면 하나뿐이다 — 이미 도장이
 * 찍히기 시작한 문서의 소속을 워크스페이스 화면에서 바꿀 수 있으면, 결재자가 무엇을 보고
 * 승인했는지 판정할 근거가 사라진다. 딸린 서류도 같다: 계보는 원장에 복제되지 않고 읽을 때만
 * 펴진다(근거는 `relatedApprovalsApi` 주석).
 *
 * 열람 불가·삭제·임시저장 문서는 조회 단계에서 빠진다 — 즉 이 화면이 남의 결재 내용을 흘리지
 * 않는다. 그래서 빈 목록은 '결재가 없다'가 아니라 '내가 볼 수 있는 것 중에 없다'이다.
 */
export function WorkspaceApprovalTab({ targetType, targetId }: Props) {
  const { data: nodes, isLoading, error } = useWorkspaceApprovals(targetType, targetId)
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  const rows = useMemo(() => nodes ?? [], [nodes])

  const visibleRows = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return rows
    const text = (node: ApprovalNode) =>
      [node.title, node.docNo ?? '', node.docType, APPROVAL_RELATION_LABEL[node.relation], node.note ?? '']
        .join(' ')
        .toLowerCase()
    const byId = new Map(rows.map((node) => [node.id, node]))
    const keep = new Set(rows.filter((node) => text(node).includes(q)).map((node) => node.id))
    // 맞은 줄의 윗줄(근거 품의)을 함께 남긴다 — 계보가 끊기면 들여쓰기가 거짓이 된다.
    for (const id of [...keep]) {
      let parentId = byId.get(id)?.parentId ?? null
      while (parentId && !keep.has(parentId)) {
        keep.add(parentId)
        parentId = byId.get(parentId)?.parentId ?? null
      }
    }
    return rows.filter((node) => keep.has(node.id))
  }, [rows, keyword])

  // 검색으로 목록이 줄면 있던 페이지가 사라질 수 있다 — 빈 장을 보여 주는 대신 마지막 장으로 당긴다.
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = visibleRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const columns: Column<ApprovalNode>[] = [
    {
      key: 'title',
      header: '제목',
      type: 'name',
      primary: true,
      // 계보를 순서로 그리므로 이 표는 정렬하지 않는다(파일 주석 참조).
      sortable: false,
      render: (r) => (
        <span
          className={cn('flex min-w-0 items-center gap-1', r.depth > 0 && 'text-gray-800')}
          // 들여쓰기는 깊이에 비례한다. 클래스로 세우지 않는 이유는 깊이의 상한이 없기 때문이다.
          style={{ paddingLeft: `${r.depth * 1.1}rem` }}
        >
          {r.depth > 0 && <span className="shrink-0 text-gray-400">└</span>}
          <span className="min-w-0 break-all">{r.title}</span>
        </span>
      ),
    },
    {
      key: 'relation',
      header: '관계',
      type: 'code',
      // 왜 이 목록에 섰는가. 뿌리는 사람이 직접 건 연동이고, 나머지는 근거 품의·상호 참조를
      // 따라 딸려 온 것이다. 상호 참조에 메모가 적혀 있으면 그 말이 곧 이유라 함께 보인다.
      render: (r) => (
        <span
          title={r.note ?? undefined}
          className={cn(r.relation === 'DIRECT' && 'text-gray-500')}
        >
          {APPROVAL_RELATION_LABEL[r.relation]}
        </span>
      ),
    },
    {
      key: 'docNo',
      header: '문서번호',
      type: 'code',
      // 상신 전 문서는 번호가 없다 — 빈 칸으로 두지 않고 없음을 적는다.
      render: (r) => r.docNo ?? '-',
    },
    { key: 'docType', header: '종류', type: 'text' },
    {
      key: 'amount',
      header: '금액',
      type: 'money',
      // 대표 금액이 없는 양식(휴가원 등)은 0이 아니라 없음이다 — 0으로 적으면 '무료로 처리된
      // 건'으로 읽힌다. 값은 DB가 파생해 둔 것을 그대로 적는다(화면이 다시 세지 않는다).
      render: (r) => (r.amount === null ? '-' : formatMoney(r.amount)),
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      // 배지가 종류가 아니라 **상태**를 말하는 이유는, 담당자가 이 목록에서 먼저 묻는 것이
      // "그 건 결재 났나"이기 때문이다.
      render: (r) => <Badge tone={DOC_STATUS_TONE[r.status]}>{DOC_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'createdAt',
      header: '기안일',
      type: 'date',
      render: (r) => r.createdAt.slice(0, 10),
    },
  ]

  if (isLoading) return <Spinner />
  if (error) {
    return (
      <Banner tone="danger">
        {errorText(error) ?? '전자결재를 읽지 못했습니다. 권한을 확인하세요.'}
      </Banner>
    )
  }

  return (
    <div className="min-w-0 space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(0)
        }}
        searchPlaceholder="제목, 문서번호, 종류, 관계 검색"
        dense
        // 이 목록이 무엇을 모아 두는지 — 표 안의 단서 줄(caption)이 아니라 검색줄 오른쪽 끝에
        // 선다. 상자를 하나 더 그리면 표가 두 겹으로 읽히고, 이 말은 어느 한 열이 아니라
        // 목록 전체에 걸리므로 좁히는 컨트롤과 같은 줄에 있는 편이 읽는 순서와 맞는다.
        actions={
          <p className="text-caption text-danger">
            ※ 연동된 문서와 그에 딸린 지출·관련 문서를 보여줍니다.
          </p>
        }
      />
      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(r) => r.id}
        // 문서 상세는 내 오피스의 결재 탭 하나가 소유한다(예산/지출 탭과 같은 경로).
        onRowClick={(r) => navigate(`/my-office?tab=approval&doc=${r.id}`)}
        emptyText={
          keyword.trim()
            ? '검색 결과가 없습니다.'
            : '조회 가능한 전자결재가 없습니다. 기안 화면에서 이 워크스페이스를 연동한 문서와 거기 딸린 서류가 여기에 섭니다.'
        }
        pagination={{
          page: safePage,
          pageSize: PAGE_SIZE,
          total: visibleRows.length,
          totalAll: keyword.trim() ? rows.length : undefined,
          onChange: setPage,
        }}
        numbered={false}
        standardColumns={false}
        // 고를 수 있다고 말하면서 아무것도 못 하는 칸을 두지 않는다 — 이 탭에는 일괄 처리가
        // 없고, 이웃한 예산/지출 탭의 표들도 같은 이유로 체크 칸이 없다.
        selectable={false}
      />
    </div>
  )
}
