import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyState,
  ExpandToggleButton,
  FullscreenPanel,
  ListToolbar,
  Spinner,
  Tabs,
  cn,
  tableText,
  type Column,
} from '@ynarcher/ui'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { budgetLineOptions, budgetTotal as sumBudget } from '@/features/approval/budget'
import { planProfit, planValue } from '@/features/approval/fields'
import { useBudgetStatus } from '@/features/approval/budgetApi'
import { BudgetSummaryCard } from '@/features/approval/BudgetSummaryCard'
import { BudgetTreeView } from '@/features/approval/BudgetTreeView'
import { DOC_STATUS_LABEL, DOC_STATUS_TONE } from '@/features/approval/config'
import { errorText } from '@/features/approval/errorText'
import { budgetAmountColumn, budgetValue, formatMoney } from '@/features/approval/fields'
import type { ProgramLinkType } from '@/features/approval/programLinkApi'
import {
  useBudgetSpendItems,
  useWorkspaceBudgets,
  type BudgetSpendItem,
} from '@/features/approval/workspaceBudgetApi'
import { useEmployees } from '@/features/management/hooks'

interface Props {
  targetType: ProgramLinkType
  targetId: string
}

/** 이웃한 전자결재 탭·문서함과 같은 한 장 분량(15건). 같은 건이 화면마다 다른 묶음으로 서지 않는다. */
const SPEND_PAGE_SIZE = 15

/**
 * 지출 한 줄의 일자 — **분까지** 적는다. 같은 날 올라간 지출이 여럿이면 날짜만으로는 순서가
 * 보이지 않는다. 서버는 UTC로 주므로 문자열을 자르지 않고 보는 사람의 시간대로 옮긴다
 * (잘라 쓰면 오후에 올린 결재가 오전으로 보인다).
 */
function dateTime(v: string): string {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v.slice(0, 16).replace('T', ' ')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 결재 문서로 가는 길 — 상세는 내 오피스의 결재 탭 하나가 소유한다. */
const docPath = (id: string) => `/my-office?tab=approval&doc=${id}`

/**
 * 워크스페이스 예산/지출 — PROJECT·M&A·FUND 상세가 공유하는 한 벌.
 *
 * 답하는 질문은 셋이다. **얼마를 배정받았나**(승인된 품의의 예산표), **얼마가 나갔나**(줄별
 * 사용금액·결재 대기·잔액), 그리고 **어디로 나갔나**(일자 순 지출 내역). 앞의 둘은 결재 문서
 * 상세가 이미 답하지만 그 답은 문서를 아는 사람만 찾을 수 있다 — 사업을 맡은 사람이 먼저
 * 여는 화면은 사업이지 문서가 아니다.
 *
 * 배정 품의가 둘 이상이면 안쪽 탭으로 가른다. 합치지 않는 이유는 예산 줄의 이름이 품의마다
 * 따로 정해지기 때문이다 — 같은 '인건비'라도 근거가 다르면 다른 돈이고, 지출은 언제나 근거
 * 품의 한 건의 줄을 가리켜 차감된다.
 *
 * **실패는 0으로 그리지 않는다.** 사용 현황을 읽지 못했는데 숫자 칸을 0으로 채우면 화면이
 * "다 남았다"고 거짓말을 한다. 그래서 읽기에 실패한 자리는 숫자를 세우지 않고 사유를 적는다.
 */
export function WorkspaceBudgetTab({ targetType, targetId }: Props) {
  const { data: docs, isLoading, error } = useWorkspaceBudgets(targetType, targetId)
  const [picked, setPicked] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [spendKeyword, setSpendKeyword] = useState('')
  const [spendPage, setSpendPage] = useState(0)
  const navigate = useNavigate()

  const active = docs?.find((d) => d.id === picked) ?? docs?.[0] ?? null
  const {
    data: usage,
    error: usageError,
    isLoading: usageLoading,
  } = useBudgetStatus(active?.id ?? null)
  const {
    data: spendItems,
    error: spendError,
    isLoading: spendLoading,
  } = useBudgetSpendItems(active?.id)
  const { data: employees } = useEmployees()

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees ?? []) m.set(e.id, e.name)
    return m
  }, [employees])
  const nameOf = (id: string | null) => (id ? (nameById.get(id) ?? '-') : '-')

  const tree = active ? budgetValue(active.values, active.field.key) : null
  const amountColumn = active ? budgetAmountColumn(active.field) : null
  const total = tree && amountColumn ? sumBudget(tree.rows, amountColumn.key) : null
  // 줄 id는 사람이 읽을 이름이 아니다 — 예산표와 같은 파생으로 경로(대분류 › 중분류)를 편다.
  const lineName = useMemo(() => {
    const m = new Map<string, string>()
    if (tree && amountColumn) {
      for (const o of budgetLineOptions(tree, amountColumn.key)) m.set(o.id, o.path)
    }
    return m
  }, [tree, amountColumn])

  // 표는 **일자 순** 한 벌이다. 예산 줄로 갈라 놓으면 "이번 달에 무엇이 나갔나"를 읽으려는
  // 사람이 줄마다 흩어진 날짜를 눈으로 합쳐야 한다 — 분류는 칸으로 답할 수 있다.
  const spendRows = useMemo(
    () => [...(spendItems ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [spendItems],
  )

  // 검색은 화면에 적힌 것만 훑는다 — 열람할 수 없는 건의 제목·항목은 애초에 오지 않으므로
  // 검색으로도 새지 않는다(분류는 근거 품의의 예산표라 이 탭을 연 사람이 이미 볼 수 있다).
  const visibleSpendRows = useMemo(() => {
    const q = spendKeyword.trim().toLowerCase()
    if (!q) return spendRows
    return spendRows.filter((r) =>
      [r.title ?? '', r.docNo ?? '', r.item ?? '', lineName.get(r.lineId) ?? '', dateTime(r.createdAt)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [spendRows, spendKeyword, lineName])

  // 검색으로 목록이 줄면 있던 페이지가 사라질 수 있다 — 빈 장 대신 마지막 장으로 당긴다.
  const spendPageCount = Math.max(1, Math.ceil(visibleSpendRows.length / SPEND_PAGE_SIZE))
  const safeSpendPage = Math.min(spendPage, spendPageCount - 1)
  const spendPageRows = visibleSpendRows.slice(
    safeSpendPage * SPEND_PAGE_SIZE,
    (safeSpendPage + 1) * SPEND_PAGE_SIZE,
  )

  const spendColumns: Column<BudgetSpendItem>[] = [
    {
      key: 'createdAt',
      header: '일자',
      type: 'datetime',
      render: (r) => dateTime(r.createdAt),
    },
    {
      key: 'title',
      header: '문서',
      type: 'name',
      primary: true,
      render: (r) =>
        r.readable ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 break-all">{r.title}</span>
            {/* 완료된 건은 상태를 말하지 않는다(거의 전부가 그렇다). 다만 이 목록에는
                **아직 결재가 흐르는 지출도** 서고 그 돈은 아직 나가지 않았으므로 그때만
                꼬리표를 남긴다 — 빼 버리면 회색 금액이 유일한 단서가 된다. */}
            {r.status !== 'APPROVED' && (
              <Badge tone={DOC_STATUS_TONE[r.status]}>{DOC_STATUS_LABEL[r.status]}</Badge>
            )}
          </span>
        ) : (
          <span className="text-gray-500">열람 권한 없음</span>
        ),
    },
    // 제목과 문서 번호는 서로 다른 것을 답한다 — 한 칸에 이어 붙이면 정렬도 복사도 되지 않는다.
    { key: 'docNo', header: '문서 번호', type: 'code', render: (r) => r.docNo ?? '-' },
    {
      key: 'line',
      header: '분류',
      type: 'text',
      // 예산 변경으로 줄이 사라져도 나간 돈은 남는다 — 그 사실을 숨기지 않는다.
      render: (r) =>
        lineName.get(r.lineId) ?? <span className="text-gray-500">삭제된 예산 줄</span>,
    },
    // 지출결의서의 '항목' 칸 그대로다(화면이 새로 짓지 않는다).
    { key: 'item', header: '항목', type: 'text', render: (r) => r.item ?? '-' },
    {
      key: 'amount',
      header: '금액',
      type: 'money',
      render: (r) => (
        <span className={cn(r.status !== 'APPROVED' && 'text-gray-500')}>
          {formatMoney(r.amount)}
        </span>
      ),
    },
  ]

  if (isLoading) return <Spinner />
  if (error) {
    return (
      <Banner tone="danger">
        {errorText(error) ?? '예산을 읽지 못했습니다. 권한을 확인하세요.'}
      </Banner>
    )
  }
  if (!docs || docs.length === 0 || !active) {
    return (
      // '없다'가 아니라 '내가 볼 수 있는 것 중에 없다'라고 적는다 — 열람할 수 없는 품의는
      // 서버가 애초에 돌려주지 않으므로, 빈 목록이 곧 예산 0원을 뜻하지 않는다.
      <EmptyState
        title="조회 가능한 승인 품의가 없습니다."
        description="승인이 끝난 품의서를 이 워크스페이스에 연동하면 여기에 예산과 지출이 섭니다. 열람 권한이 없는 품의는 이 목록에 오르지 않습니다."
      />
    )
  }

  // 이 품의가 세운 수지 계획. 양식이 계획 필드를 갖지 않으면 계획 구역 자체가 서지 않는다.
  const plan = active.plan ? planProfit(planValue(active.values, active.plan.key)) : undefined

  // 이 탭이 읽고 있는 근거 문서 한 줄. 예산 요약 카드 맨 위에 구분선과 함께 서고, 읽는 중·
  // 읽지 못한 자리에도 같은 줄이 선다 — 숫자가 없는 동안에도 "어느 품의인가"는 늘 답해야 한다.
  const sourceLine = (
    <div className="min-w-0 border-b border-gray-200 pb-3">
      <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-2', tableText.body)}>
        {/* 맨 앞은 문서 제목이 아니라 **고정 낱말 '품의서'**다. 제목은 기안자가 뭐라도 적을 수
            있어('사업' 한 글자짜리도 있다) 그 자리에 두면 무엇을 보고 있는지가 문서마다
            달라진다. 무엇인지는 화면이 말하고, 어느 건인지는 옆의 문서 번호가 말한다. */}
        <span className={cn(tableText.head, 'shrink-0')}>품의서</span>
        {/* **어느 건인가는 문서 번호가 답한다.** 제목은 양식 약칭으로 시작하는 번호와 나란히
            서면 같은 말을 두 번 적은 것처럼 읽혀('사업 사업-260914-0001') 정작 번호가 묻힌다.
            번호가 없는 문서(상신 전)만 제목이 대신 선다 — 줄이 비지 않게 한다.
            min-w-0가 없으면 flex 칸의 최소 폭이 값 전체 폭이 된다. 본문은 word-break:keep-all
            이라 띄어쓰기 없는 긴 값 하나가 페이지 전체를 가로로 늘린다(360px → 1114px). */}
        <Link
          to={docPath(active.id)}
          className={cn(
            'min-w-0 max-w-full break-all font-semibold text-primary hover:underline',
            active.docNo && 'tabular-nums',
          )}
        >
          {active.docNo ?? active.title}
        </Link>
        <Badge tone={DOC_STATUS_TONE[active.status]}>{DOC_STATUS_LABEL[active.status]}</Badge>
      </div>
    </div>
  )

  /**
   * 확대보기 토글 — 다른 워크스페이스(캐피탈 콜·모듈 보드·문항 구성)와 같은 부품·같은 아이콘.
   * 카드 안에서 볼 때와 전체 화면으로 펼쳤을 때 같은 버튼이 자리만 옮겨 선다.
   */
  const expandToggle = (
    <ExpandToggleButton
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      expandIcon={<Maximize2 className="h-4 w-4" />}
      collapseIcon={<Minimize2 className="h-4 w-4" />}
    />
  )

  return (
    <div className="min-w-0 max-w-full space-y-4">
      {docs.length > 1 && (
        // 배정 품의가 열 건을 넘는 사업이 있다. 줄바꿈을 두면 좁은 화면에서 탭이 열두 줄로
        // 쌓여 정작 예산이 화면 밖으로 밀린다. 이 탭 안에서만 한 줄로 세우고 가로로 민다
        // (공용 Tabs의 기본 줄바꿈은 그대로 둔다 — 다른 화면은 탭이 서너 개다).
        <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1">
          <Tabs
            className="w-max min-w-full flex-nowrap"
            items={docs.map((d) => ({
              key: d.id,
              // 제목이 길어도 탭 줄을 밀지 않는다(긴 이름은 잘리고 전체는 툴팁이 답한다).
              label: (
                <span className="block max-w-[14rem] truncate" title={d.title}>
                  {d.title}
                </span>
              ),
            }))}
            value={active.id}
            onChange={setPicked}
          />
        </div>
      )}

      {usageError ? (
        // 숫자를 세우지 않는다 — 0은 '안 썼다'로 읽히고, 그것이 지금 우리가 모르는 사실이다.
        // 그래도 **어느 품의를 읽으려 했는지는 남긴다** — 실패한 자리에 근거까지 사라지면
        // 담당자가 무엇의 권한이 없는지 확인할 곳이 없다.
        <Card title="예산 요약">
          {sourceLine}
          <Banner tone="danger">
            {errorText(usageError) ?? '사용 현황을 읽지 못했습니다. 권한을 확인하세요.'}
          </Banner>
        </Card>
      ) : usageLoading ? (
        // 아직 모르는 것을 0원으로 그리면 '다 남았다'가 되어 버린다.
        <Card title="예산 요약">
          {sourceLine}
          <Spinner />
        </Card>
      ) : (
        <BudgetSummaryCard
          documentId={active.id}
          budgetTotal={total}
          usage={usage}
          nameOf={nameOf}
          source={sourceLine}
          plan={plan}
        />
      )}

      {tree && (
        <>
          {/* 제목은 양식이 지은 필드 이름('예산')이 아니라 **고정 낱말**이다 — 이 표가 답하는
              것은 배정액만이 아니라 줄마다 얼마가 나갔고 얼마가 남았는가이고, 그 이름이
              양식마다 달라질 이유가 없다. */}
          <Card
            title="예산 현황"
            help="줄마다 배정액과 지금까지 나간 돈이 함께 섭니다. 산출내역/비고처럼 글이 긴 칸은 카드 폭에서 접히므로 확대보기로 펼쳐 읽습니다."
            actions={expandToggle}
          >
            {/* 사용 현황을 모르는 동안에는 사용/남음 칸을 세우지 않는다(0으로 채우지 않는다). */}
            <BudgetTreeView field={active.field} value={tree} usage={usage} compact />
          </Card>

          {/* 확대보기: 카드 밖 전체 화면으로 펼치고, 거기서는 글 칸까지 **전부** 선다.
              닫힌 동안에는 아무것도 그리지 않는다(FullscreenPanel이 null을 낸다). */}
          <FullscreenPanel
            open={expanded}
            onClose={() => setExpanded(false)}
            title={
              <>
                <span className="text-title-sm font-medium text-gray-900">예산 현황</span>
                {/* 전체 화면에는 품의 탭 줄이 따라오지 않는다 — 어느 품의를 펼친 것인지는
                    여기서만 말할 수 있다. */}
                <span className={cn(tableText.body, 'min-w-0 truncate text-gray-600')}>
                  {active.title}
                </span>
              </>
            }
            actions={expandToggle}
          >
            <BudgetTreeView field={active.field} value={tree} usage={usage} />
          </FullscreenPanel>
        </>
      )}

      <Card
        title="지출 내역"
        help="이 품의의 예산 줄을 근거로 올라간 결재입니다. 일자 순으로 서며, 한 문서가 항목을 여럿 올렸으면 항목마다 한 줄씩 섭니다. 열람할 수 없는 건은 제목·항목 없이 금액만 섭니다."
      >
        {spendError ? (
          <Banner tone="danger">
            {errorText(spendError) ?? '지출 내역을 읽지 못했습니다. 권한을 확인하세요.'}
          </Banner>
        ) : spendLoading ? (
          <Spinner />
        ) : (
          <div className="min-w-0 space-y-3">
            <ListToolbar
              keyword={spendKeyword}
              onKeywordChange={(value) => {
                setSpendKeyword(value)
                setSpendPage(0)
              }}
              searchPlaceholder="문서, 문서 번호, 분류, 항목 검색"
              dense
            />
            <DataTable
              columns={spendColumns}
              rows={spendPageRows}
              rowKey={(r) => `${r.documentId}-${r.lineId}-${r.item ?? ''}`}
              // 행 어디를 눌러도 그 결재로 간다(문서 상세는 내 오피스의 결재 탭이 소유한다).
              // 열람할 수 없는 건은 열리지 않으므로 보내지 않는다 — 빈 화면으로 보내는 것은
              // 답이 아니다.
              onRowClick={(r) => {
                if (r.readable) navigate(docPath(r.documentId))
              }}
              emptyText={
                spendKeyword.trim() ? '검색 결과가 없습니다.' : '아직 나간 지출이 없습니다.'
              }
              pagination={{
                page: safeSpendPage,
                pageSize: SPEND_PAGE_SIZE,
                total: visibleSpendRows.length,
                totalAll: spendKeyword.trim() ? spendRows.length : undefined,
                onChange: setSpendPage,
              }}
              numbered={false}
              standardColumns={false}
              // 고를 수 있다고 말하면서 아무것도 못 하는 칸을 두지 않는다(이웃 탭과 같은 판단).
              selectable={false}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
