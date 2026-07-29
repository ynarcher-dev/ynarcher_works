import { Button, CardShell, ExpandToggleButton, useToast } from '@ynarcher/ui'
import { Maximize2, Minimize2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CapitalCallFormModal } from '@/features/fund/CapitalCallFormModal'
import { CapitalCallMatrix } from '@/features/fund/CapitalCallMatrix'
import {
  useDeleteCapitalCall,
  type CapitalCall,
  type FundLp,
} from '@/features/fund/hooks'

/** 상단 요약 타일 — 라벨 한 줄, 값 한 줄. 타일마다 지표는 하나만 싣는다. */
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2">
      <p className="text-caption text-gray-600">{label}</p>
      <p className="text-body font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  )
}

/**
 * 캐피탈 콜 탭 — 상단 요약 타일 + 차수×LP 매트릭스. 상단 요약은 출자자 원장에서 파생된
 * 총 약정·총 실납입·납입률·미납 잔액이며, 캐피탈 콜에서 LP 상태를 '납입완료'로 둔 요청액이
 * fund_lps.paid_amount 로 집계된 결과가 그대로 반영된다.
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
  const [modal, setModal] = useState<{ open: boolean; editing: CapitalCall | null }>({
    open: false,
    editing: null,
  })
  const [expanded, setExpanded] = useState(false)

  const totals = useMemo(() => {
    const commitment = lps.reduce((a, l) => a + l.commitment_amount, 0)
    const paid = lps.reduce((a, l) => a + l.paid_amount, 0)
    return { commitment, paid, rate: commitment > 0 ? Math.round((paid / commitment) * 100) : 0 }
  }, [lps])

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

  // 출자자 연동 요약: 총 약정 대비 캐피탈 콜로 집계된 실 납입. 납입률도 제 타일을 가져 모두 두 줄이다.
  const summary = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Summary label="총 약정액" value={totals.commitment.toLocaleString()} />
      <Summary label="총 실 납입액" value={totals.paid.toLocaleString()} />
      <Summary label="납입률" value={`${totals.rate}%`} />
      <Summary
        label="미납 잔액"
        value={Math.max(0, totals.commitment - totals.paid).toLocaleString()}
      />
    </div>
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

          {/*
            매트릭스는 항상 마운트해 두고 확대 여부만 내려준다 — 확대/축소 때 컴포넌트가 다시
            마운트되면 저장 전 초안(요청액·상태)이 날아간다.
          */}
          {empty ?? (
            <CapitalCallMatrix
              fundId={fundId}
              fundName={fundName}
              calls={calls}
              lps={lps}
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
