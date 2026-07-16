import { Badge, Button, Modal } from '@ynarcher/ui'
import { useState } from 'react'
import { MiniTable, td, tdL, th, thL } from '@/features/startup/MiniTable'
import { StartupShareholderChart } from '@/features/startup/StartupShareholderChart'
import type { Shareholder, ShareholderSnapshot } from '@/features/startup/startupShareholders'

/** 지분율 표시값: 저장된 값이 있으면 그 값을, 없으면 주식 수 비중으로 계산. */
function pctOf(h: Shareholder, totalShares: number): number | null {
  if (h.percentage != null && !Number.isNaN(Number(h.percentage))) return Number(h.percentage)
  if (totalShares > 0) return ((Number(h.shares) || 0) / totalShares) * 100
  return null
}

/** 스냅샷 1건의 주주 표(주주명/보유 주식 수/지분율). */
function HolderTable({ holders }: { holders: Shareholder[] }) {
  const total = holders.reduce((s, h) => s + (Number(h.shares) || 0), 0)
  return (
    <MiniTable
      head={
        <>
          <th className={thL}>주주명</th>
          <th className={th}>보유 주식 수</th>
          <th className={th}>지분율</th>
        </>
      }
    >
      {holders.map((h, i) => {
        const pct = pctOf(h, total)
        return (
          <tr key={i}>
            <td className={tdL}>{h.name || '-'}</td>
            <td className={td}>
              {h.shares == null ? <span className="text-gray-400">-</span> : Number(h.shares).toLocaleString()}
            </td>
            <td className={td}>
              {pct == null ? <span className="text-gray-400">-</span> : `${pct.toFixed(1)}%`}
            </td>
          </tr>
        )
      })}
    </MiniTable>
  )
}

/** 스냅샷 헤더: 기준일 + 라운드 배지. */
function SnapshotMeta({ snap }: { snap: ShareholderSnapshot }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-gray-500">기준일 {snap.date || '-'}</span>
      {snap.round && (
        <Badge tone="neutral" size="sm">
          {snap.round}
        </Badge>
      )}
    </div>
  )
}

/**
 * 주주 구성 카드(읽기, 성장 지표 아래). 변경 시점별 이력형.
 * 최신 구성은 좌측 도넛 + 우측 표로 나란히 보여주고, 과거 이력은 '변경 이력' 모달로 펼쳐 본다.
 * 편집은 통합 수정 폼에서 관리하므로 카드 수정 버튼·수정 날짜는 두지 않는다.
 */
export function StartupShareholderCard({ history }: { history: ShareholderSnapshot[] }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [latest] = history
  const hasHistory = history.length > 1

  return (
    <section className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-gray-900">주주 구성</h3>
        {hasHistory && (
          <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            변경 이력
          </Button>
        )}
      </div>

      {!latest || latest.holders.length === 0 ? (
        <p className="text-body text-gray-400">등록된 주주 정보가 없습니다.</p>
      ) : (
        // 좌: 도넛 차트 · 우: 표(하단 우측에 기준일·라운드)
        <div className="grid items-center gap-4 lg:grid-cols-2">
          <StartupShareholderChart shareholders={latest.holders} />
          <div className="space-y-2">
            <HolderTable holders={latest.holders} />
            {(latest.date || latest.round) && (
              <div className="flex justify-end">
                <SnapshotMeta snap={latest} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 변경 이력 모달: 전체 시점을 최신 순으로 나열 */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="주주 구성 변경 이력" size="lg">
        <div className="max-h-[70vh] space-y-5 overflow-y-auto">
          {history.map((snap, i) => (
            <div key={i} className="space-y-2">
              <SnapshotMeta snap={snap} />
              <HolderTable holders={snap.holders} />
            </div>
          ))}
        </div>
      </Modal>
    </section>
  )
}
