import { Badge, Banner, Card, EmptyState, Spinner, Tabs, cn, tableText } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { budgetLineOptions, budgetTotal as sumBudget } from '@/features/approval/budget'
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

/** 결재 문서로 가는 길 — 상세는 내 오피스의 결재 탭 하나가 소유한다. */
const docPath = (id: string) => `/my-office?tab=approval&doc=${id}`

/**
 * 워크스페이스 예산/지출 — PROJECT·M&A·FUND 상세가 공유하는 한 벌.
 *
 * 답하는 질문은 셋이다. **얼마를 배정받았나**(승인된 품의의 예산표), **얼마가 나갔나**(줄별
 * 사용·결재 중·남음), 그리고 **어디로 나갔나**(줄별 지출 건별 내역). 앞의 둘은 결재 문서
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
  // 줄 id는 사람이 읽을 이름이 아니다 — 예산표와 같은 파생으로 경로(대분류 > 소분류)를 편다.
  const lineName = useMemo(() => {
    const m = new Map<string, string>()
    if (tree && amountColumn) {
      for (const o of budgetLineOptions(tree, amountColumn.key)) m.set(o.id, o.path)
    }
    return m
  }, [tree, amountColumn])

  const grouped = useMemo(() => {
    const m = new Map<string, BudgetSpendItem[]>()
    for (const item of spendItems ?? []) {
      const list = m.get(item.lineId)
      if (list) list.push(item)
      else m.set(item.lineId, [item])
    }
    return [...m.entries()]
  }, [spendItems])

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

      <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-2', tableText.body)}>
        {/* min-w-0가 없으면 flex 칸의 최소 폭이 제목 전체 폭이 된다. 본문은 word-break:keep-all
            이라 띄어쓰기 없는 긴 제목 하나가 페이지 전체를 가로로 늘린다(360px → 1114px). */}
        <Link
          to={docPath(active.id)}
          className="min-w-0 max-w-full break-all font-semibold text-primary hover:underline"
        >
          {active.title}
        </Link>
        {active.docNo && <span className="tabular-nums text-gray-500">{active.docNo}</span>}
        {active.formName && <span className="text-gray-500">{active.formName}</span>}
        <Badge tone={DOC_STATUS_TONE[active.status]}>{DOC_STATUS_LABEL[active.status]}</Badge>
      </div>

      {usageError ? (
        // 숫자를 세우지 않는다 — 0은 '안 썼다'로 읽히고, 그것이 지금 우리가 모르는 사실이다.
        <Banner tone="danger">
          {errorText(usageError) ?? '사용 현황을 읽지 못했습니다. 권한을 확인하세요.'}
        </Banner>
      ) : usageLoading ? (
        // 아직 모르는 것을 0원으로 그리면 '다 남았다'가 되어 버린다.
        <Card title="예산 현황">
          <Spinner />
        </Card>
      ) : (
        <BudgetSummaryCard
          documentId={active.id}
          budgetTotal={total}
          usage={usage}
          nameOf={nameOf}
        />
      )}

      {tree && (
        <Card title={active.field.label}>
          {/* 사용 현황을 모르는 동안에는 사용/남음 칸을 세우지 않는다(0으로 채우지 않는다). */}
          <BudgetTreeView field={active.field} value={tree} usage={usage} />
        </Card>
      )}

      <Card
        title="지출 내역"
        help="이 품의의 예산 줄을 근거로 올라간 결재입니다. 열람할 수 없는 건은 제목 없이 금액만 섭니다."
      >
        {spendError ? (
          <Banner tone="danger">
            {errorText(spendError) ?? '지출 내역을 읽지 못했습니다. 권한을 확인하세요.'}
          </Banner>
        ) : spendLoading ? (
          <Spinner />
        ) : grouped.length === 0 ? (
          <p className={cn(tableText.body, 'text-gray-600')}>아직 나간 지출이 없습니다.</p>
        ) : (
          <div className="min-w-0 space-y-3">
            {grouped.map(([lineId, items]) => (
              <section key={lineId} className="min-w-0 space-y-1">
                <h4 className={cn(tableText.head, 'truncate')}>
                  {/* 예산 변경으로 줄이 사라져도 나간 돈은 남는다 — 그 사실을 숨기지 않는다. */}
                  {lineName.get(lineId) ?? '삭제된 예산 줄'}
                </h4>
                <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
                  <table className="w-full min-w-[36rem] border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-25">
                        <th className={cn('px-3 py-1.5 text-left', tableText.head)}>문서</th>
                        <th className={cn('w-24 px-3 py-1.5 text-left', tableText.head)}>상태</th>
                        <th className={cn('w-36 px-3 py-1.5 text-right', tableText.head)}>금액</th>
                        <th className={cn('w-28 px-3 py-1.5 text-left', tableText.head)}>일자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={`${item.documentId}-${item.lineId}`}
                          className="border-b border-gray-100 last:border-b-0"
                        >
                          <td className={cn('min-w-0 px-3 py-1.5', tableText.body)}>
                            {/* 긴 제목은 칸 안에서 접는다 — 칸을 넓히면 표가 통째로 늘어난다. */}
                            <div className="max-w-[22rem] break-all">
                              {item.readable ? (
                                <Link
                                  to={docPath(item.documentId)}
                                  className="text-primary hover:underline"
                                >
                                  {item.title}
                                  {item.docNo && (
                                    <span className="ml-1.5 tabular-nums text-gray-500">
                                      {item.docNo}
                                    </span>
                                  )}
                                </Link>
                              ) : (
                                <span className="text-gray-500">열람 권한 없음</span>
                              )}
                            </div>
                          </td>
                          <td className={cn('px-3 py-1.5', tableText.body)}>
                            <Badge tone={DOC_STATUS_TONE[item.status]}>
                              {DOC_STATUS_LABEL[item.status]}
                            </Badge>
                          </td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-3 py-1.5 text-right tabular-nums',
                              item.status !== 'APPROVED' && 'text-gray-500',
                              tableText.body,
                            )}
                          >
                            {formatMoney(item.amount)}
                          </td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-3 py-1.5 tabular-nums',
                              tableText.body,
                            )}
                          >
                            {item.createdAt.slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
