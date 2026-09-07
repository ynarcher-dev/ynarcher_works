import { Button, CardShell, ExpandToggleButton, StatStrip, useToast } from '@ynarcher/ui'
import { Maximize2, Minimize2, Plus } from 'lucide-react'
import { useState } from 'react'
import { CapitalCallFormModal } from '@/features/fund/CapitalCallFormModal'
import { CapitalCallMatrix } from '@/features/fund/CapitalCallMatrix'
import { useCapitalCallDraft } from '@/features/fund/capitalCallDraft'
import { useDeleteCapitalCall, type CapitalCall, type FundLp } from '@/features/fund/hooks'

/**
 * 캐피탈 콜 탭 — 상단 요약 타일 + 차수×LP 매트릭스.
 * 요약 타일과 표는 `useCapitalCallDraft` 하나에서 계산된 같은 숫자를 본다(§1.3 산식) —
 * 총 약정액 = Σ 약정액, 총 실 납입액 = Σ 요청액(상태 납입완료), 납입률 = 납입 ÷ 약정,
 * 미납 잔액 = 약정 − 납입. 저장하면 같은 값이 fund_lps.paid_amount·실출자금액으로 파생된다.
 * (근거: docs_planning/3_5_workspace_fund.md §1.3)
 */
export function CapitalCallPanel({
  fundId,
  fundName,
  calls,
  lps,
}: {
  fundId: string
  fundName: string
  calls: CapitalCall[]
  lps: FundLp[]
}) {
  const toast = useToast()
  const del = useDeleteCapitalCall(fundId)
  const draft = useCapitalCallDraft(fundId, calls, lps)
  const [modal, setModal] = useState<{ open: boolean; editing: CapitalCall | null }>({
    open: false,
    editing: null,
  })
  const [expanded, setExpanded] = useState(false)

  const nextCallNo = calls.reduce((max, c) => Math.max(max, c.call_no), 0) + 1

  const onDelete = async (call: CapitalCall) => {
    if (!window.confirm(`${call.call_no}차 캐피탈 콜을 삭제하시겠습니까? 납입 현황도 함께 사라집니다.`)) {
      return
    }
    try {
      await del.mutateAsync(call.id)
      toast.show('차수를 삭제했습니다.', 'success')
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  // 지표 띠 규격(상자 없이 옅은 세로선으로만 나눈 한 덩어리)은 화면이 아니라 공용 `StatStrip`이
  // 갖는다 — 종전 로컬 타일은 펀드 상세의 것과 글자 하나까지 같은 사본이라, 한쪽만 고쳐지면
  // 같은 펀드의 숫자가 탭마다 다른 모양으로 섰다.
  const summary = (
    <StatStrip
      className="grid grid-cols-2 divide-gray-200 sm:grid-cols-4 sm:divide-x"
      tiles={[
        { key: 'commitment', label: '총 약정액', value: draft.totals.commitment.toLocaleString() },
        { key: 'paid', label: '총 실 납입액', value: draft.totals.paid.toLocaleString() },
        { key: 'rate', label: '납입률', value: draft.totals.rate },
        { key: 'unpaid', label: '미납 잔액', value: draft.totals.unpaid.toLocaleString() },
      ]}
    />
  )

  const empty =
    calls.length === 0 ? (
      <p className="text-body-sm text-gray-500">
        등록된 캐피탈 콜 차수가 없습니다. '차수 추가'로 1차를 등록하세요.
      </p>
    ) : lps.length === 0 ? (
      <p className="text-body-sm text-gray-500">
        등록된 출자자(LP)가 없습니다. 출자자 탭에서 먼저 조합원을 등록하세요.
      </p>
    ) : null

  // 펼칠 표가 없으면 확대보기 토글도 내보내지 않는다(빈 화면을 전체 화면으로 여는 버튼은 함정이다).
  const actions = (
    <div className="flex items-center gap-2">
      {!empty && (
        <ExpandToggleButton
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          expandIcon={<Maximize2 className="size-4" />}
          collapseIcon={<Minimize2 className="size-4" />}
        />
      )}
      <Button density="card" onClick={() => setModal({ open: true, editing: null })}>
        <Plus className="size-4" />
        차수 추가
      </Button>
    </div>
  )

  return (
    <>
      <CardShell>
        <div className="space-y-4">
          {summary}

          <div className="flex items-center justify-between">
            <h4 className="text-body font-semibold text-gray-700">캐피탈 콜 차수</h4>
            {actions}
          </div>

          {empty ?? (
            <CapitalCallMatrix
              fundName={fundName}
              calls={calls}
              lps={lps}
              draft={draft}
              onEditCall={(c) => setModal({ open: true, editing: c })}
              onDeleteCall={onDelete}
              expanded={expanded}
              onCollapse={() => setExpanded(false)}
              headerActions={actions}
              summary={summary}
            />
          )}
        </div>
      </CardShell>

      <CapitalCallFormModal
        fundId={fundId}
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        editing={modal.editing}
        nextCallNo={nextCallNo}
      />
    </>
  )
}
