import { useEffect } from 'react'
import { Badge, Button, InfoField, InfoGrid, Modal } from '@ynarcher/ui'
import type { KpiDashboardRow } from '@/features/management/kpi/kpiTypes'
import { actualLabel, calculationLabel, scoreRows, targetLabel } from './kpiDisplay'

export function KpiDetailModal({ row, onClose }: { row: KpiDashboardRow | null; onClose: () => void }) {
  useEffect(() => {
    if (!row) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [row, onClose])
  const rows = row ? scoreRows(row) : []
  return (
    <Modal open={Boolean(row)} onClose={onClose} title={row?.metric_name ?? 'KPI 상세'} size="lg" footer={<Button onClick={onClose}>확인</Button>}>
      {row && <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone={row.scope_type === 'PERSON' ? 'info' : 'neutral'}>{row.scope_type === 'PERSON' ? '개인 KPI' : '부서 KPI'}</Badge>
          <Badge tone={row.computed_score == null ? 'neutral' : 'success'}>{row.computed_score == null ? '미입력' : `${row.computed_score}점`}</Badge>
        </div>
        <section>
          <h3 className="font-semibold text-gray-900">설명</h3>
          <p className="mt-1 whitespace-pre-wrap text-body text-gray-700">{row.description ?? '등록된 설명이 없습니다.'}</p>
        </section>
        <section>
          <h3 className="font-semibold text-gray-900">인정 기준</h3>
          <p className="mt-1 whitespace-pre-wrap text-body text-gray-700">{row.criteria_text ?? '등록된 인정 기준이 없습니다.'}</p>
        </section>
        <InfoGrid columns={3}>
          <InfoField label="목표" value={targetLabel(row)} />
          <InfoField label="현재 실적" value={actualLabel(row)} />
          <InfoField label="현재 점수" value={row.computed_score == null ? '-' : `${row.computed_score}점`} />
        </InfoGrid>
        <section>
          <h3 className="mb-2 font-semibold text-gray-900">점수 기준</h3>
          {rows.length ? <div className="overflow-hidden rounded-radius-md border border-gray-200">
            <table className="w-full text-left text-body"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 font-medium">조건</th><th className="px-3 py-2 text-right font-medium">점수</th></tr></thead>
              <tbody className="divide-y divide-gray-200">{rows.map((scoreRow, index) => <tr key={`${scoreRow.condition}-${index}`}><td className="px-3 py-2 text-gray-700">{scoreRow.condition}</td><td className="px-3 py-2 text-right font-medium text-gray-900">{scoreRow.score}</td></tr>)}</tbody>
            </table>
          </div> : <p className="text-body text-gray-500">등록된 점수 구간이 없습니다.</p>}
        </section>
        <section className="rounded-radius-md border border-info-border bg-info-subtle p-3">
          <h3 className="font-semibold text-info">현재 산정 근거</h3>
          <p className="mt-1 text-body text-gray-700">{calculationLabel(row)}</p>
          {row.evidence_ref && <p className="mt-2 text-caption text-gray-600">증빙: {row.evidence_ref}</p>}
        </section>
        <p className="text-caption text-gray-500">{row.org_version_label} · {row.kpi_version_label} · {row.effective_from} ~ {row.effective_to ?? '계속'}{row.membership_from ? ` · 소속 적용 ${row.membership_from}` : ''}</p>
      </div>}
    </Modal>
  )
}
