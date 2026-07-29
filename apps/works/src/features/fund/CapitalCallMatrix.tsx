import { Badge, Button, FullscreenPanel, IconButton, tableText, useToast } from '@ynarcher/ui'
import { Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { CapitalCallCell, cellTint } from '@/features/fund/CapitalCallCell'
import type { CapitalCallDraft } from '@/features/fund/capitalCallDraft'
import type { CapitalCall, FundLp } from '@/features/fund/hooks'

/** 푸터 합계 한 줄 — 라벨과 값을 같은 크기로 두고 색·굵기로만 갈라 위계를 만든다. */
function TotalLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={tableText.meta}>{label}</span>
      <span className="font-semibold tabular-nums text-gray-900">{value.toLocaleString()}</span>
    </div>
  )
}

/**
 * 캐피탈 콜 매트릭스 — 가로축 N차 · 세로축 LP. 각 셀은 그 차수에 그 LP가 낼 요청액 +
 * 그 LP의 상태(예정/통지/납입완료/연체)다. "누가 몇 차를 얼마 냈나"가 한 화면에 보인다.
 * 편집 상태와 합계는 모두 `useCapitalCallDraft`가 소유하고 이 컴포넌트는 그리기만 한다 —
 * 상단 요약 타일과 이 표가 같은 숫자를 보게 하는 것이 목적이다.
 * (근거: docs_planning/3_5_workspace_fund.md §1.3)
 */
export function CapitalCallMatrix({
  fundName,
  calls,
  lps,
  draft,
  onEditCall,
  onDeleteCall,
  expanded = false,
  onCollapse,
  headerActions,
  summary,
}: {
  fundName: string
  calls: CapitalCall[]
  lps: FundLp[]
  draft: CapitalCallDraft
  onEditCall: (call: CapitalCall) => void
  onDeleteCall: (call: CapitalCall) => void
  /** 전체화면 확대 여부(상태는 부모가 소유 — 토글 버튼이 '차수 추가' 옆에 있다). */
  expanded?: boolean
  onCollapse?: () => void
  /** 확대 화면 헤더에 다시 태울 액션(축소 토글 + 차수 추가). */
  headerActions?: ReactNode
  /** 확대 화면에서도 같이 보여줄 상단 요약 타일. */
  summary?: ReactNode
}) {
  const toast = useToast()

  const onSave = async () => {
    try {
      await draft.save()
      toast.show('납입 현황을 저장했습니다.', 'success')
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const table = (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-radius-md border border-gray-200">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-25">
              {/* LP명은 가로 스크롤 시에도 고정(sticky). */}
              <th className={`sticky left-0 z-10 bg-gray-25 px-3 py-2 text-left ${tableText.head}`}>
                LP명
              </th>
              <th className={`px-3 py-2 text-right ${tableText.head}`}>약정액</th>
              {calls.map((call) => (
                <th key={call.id} className="min-w-[13rem] border-l border-gray-100 px-2 py-1.5">
                  {/* 헤더는 "1차 (납입기한)" 한 줄. 상태 배지는 LP 행으로 내려갔다. */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-baseline gap-1 text-caption">
                      <span className="font-semibold text-gray-900">{call.call_no}차</span>
                      <span className="font-normal text-gray-500">
                        ({call.due_date ?? '기한 미정'})
                      </span>
                    </span>
                    <span className="flex items-center">
                      <IconButton
                        label={`${call.call_no}차 수정`}
                        variant="ghost"
                        density="table"
                        icon={<Pencil className="size-3.5" />}
                        onClick={() => onEditCall(call)}
                      />
                      <IconButton
                        label={`${call.call_no}차 삭제`}
                        variant="ghost"
                        density="table"
                        danger
                        icon={<Trash2 className="size-3.5" />}
                        onClick={() => onDeleteCall(call)}
                      />
                    </span>
                  </div>
                </th>
              ))}
              <th className={`border-l border-gray-200 px-3 py-2 text-right ${tableText.head}`}>
                납입 합계
              </th>
            </tr>
          </thead>
          <tbody>
            {lps.map((lp) => (
              <tr key={lp.id} className="border-t border-gray-100">
                <td className={`sticky left-0 z-10 bg-white px-3 py-1.5 ${tableText.primary}`}>
                  {lp.name}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${tableText.meta}`}>
                  {lp.commitment_amount.toLocaleString()}
                </td>
                {calls.map((call) => {
                  const c = draft.cellOf(call.id, lp.id)
                  return (
                    <td
                      key={call.id}
                      className={`border-l border-gray-100 px-2 py-1.5 ${cellTint(c.status)}`}
                    >
                      <CapitalCallCell
                        requested={c.requested}
                        status={c.status}
                        ariaLabel={`${lp.name} ${call.call_no}차`}
                        onChange={(patch) => draft.setCell(call.id, lp.id, patch)}
                      />
                    </td>
                  )
                })}
                <td className="border-l border-gray-200 px-3 py-1.5 text-right text-caption font-semibold tabular-nums text-brand">
                  {draft.lpPaid(lp.id).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* 차수 합계 = 그 차수의 '납입(상태 납입완료인 셀의 요청액 합)'과 '요청(요청액 전체 합)'. */}
            <tr className="border-t-2 border-gray-200 bg-gray-25 text-caption">
              <td className="sticky left-0 z-10 bg-gray-25 px-3 py-2 font-semibold text-gray-900">
                차수 합계
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${tableText.meta}`}>
                {draft.totals.commitment.toLocaleString()}
              </td>
              {calls.map((call) => {
                const t = draft.callTotals[call.id] ?? { requested: 0, paid: 0 }
                return (
                  <td key={call.id} className="border-l border-gray-100 px-2 py-2">
                    <TotalLine label="납입" value={t.paid} />
                    <TotalLine label="요청" value={t.requested} />
                  </td>
                )
              })}
              <td className="border-l border-gray-200 px-3 py-2 text-right font-semibold tabular-nums text-brand">
                {draft.totals.paid.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className={tableText.meta}>
          셀에 요청액을 입력하고 LP마다 상태를 고르세요. 저장하면 실 납입액·실출자금액과 차수 상태에
          반영됩니다.
        </p>
        <Button onClick={() => void onSave()} disabled={draft.dirtyCount === 0 || draft.saving}>
          납입 현황 저장
        </Button>
      </div>
    </div>
  )

  // 확대보기: 카드 밖 전체 화면으로 펼친다. 초안은 부모(훅)가 들고 있어 확대/축소로 사라지지 않는다.
  if (expanded) {
    return (
      <FullscreenPanel
        open
        onClose={() => onCollapse?.()}
        title={
          <>
            <span className="text-title-sm font-medium text-gray-900">캐피탈 콜</span>
            <Badge tone="neutral">{fundName}</Badge>
          </>
        }
        actions={headerActions}
      >
        <div className="space-y-4">
          {summary}
          {table}
        </div>
      </FullscreenPanel>
    )
  }

  return table
}
