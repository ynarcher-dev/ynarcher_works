import { Button, DataTable, EmptyValue, Modal, PanelCard, cardText, tableText, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import type { Shareholder, ShareholderSnapshot } from '@/features/startup/startupShareholders'

/** 지분율 표시값: 저장된 값이 있으면 그 값을, 없으면 주식 수 비중으로 계산. */
function pctOf(h: Shareholder, totalShares: number): number | null {
  if (h.percentage != null && !Number.isNaN(Number(h.percentage))) return Number(h.percentage)
  if (totalShares > 0) return ((Number(h.shares) || 0) / totalShares) * 100
  return null
}

function shareholderColumns(totalShares: number): Column<Shareholder>[] {
  return [
    { key: 'name', header: '주주명', type: 'name', primary: true, render: (h) => h.name || <EmptyValue /> },
    {
      /**
       * 주식 수는 `count`가 아니라 `money`(금액·**수량**)다. `count`의 폭(카드 자리 80px)은
       * `건수`처럼 짧은 머리글을 재어 정한 값이라, `보유 주식 수`가 두 줄로 접혀 그 열만 머리글
       * 높이가 두 배가 됐다. 접히는 것은 머리글이 길다는 신호이고 여기서는 종류가 틀렸다는
       * 신호다 — `10,000`은 세어 올린 건수가 아니라 자릿수를 견주는 수량이다.
       */
      key: 'shares',
      header: '보유 주식 수',
      type: 'money',
      render: (h) => (h.shares == null ? <EmptyValue /> : Number(h.shares).toLocaleString()),
    },
    {
      key: 'percentage',
      header: '지분율',
      type: 'count',
      render: (h) => {
        const pct = pctOf(h, totalShares)
        return pct == null ? <EmptyValue /> : `${pct.toFixed(1)}%`
      },
    },
  ]
}

/** 스냅샷 1건의 주주 표(주주명/보유 주식 수/지분율). */
function HolderTable({ holders }: { holders: Shareholder[] }) {
  const total = holders.reduce((s, h) => s + (Number(h.shares) || 0), 0)
  return (
    <DataTable
      columns={shareholderColumns(total)}
      rows={holders}
      rowKey={(h) => `${h.name || 'holder'}-${h.shares ?? 'shares'}-${h.percentage ?? 'pct'}`}
      numbered={false}
      standardColumns={false}
      layout="fixed"
    />
  )
}

/** 스냅샷 헤더: 기준일. */
function SnapshotMeta({ snap }: { snap: ShareholderSnapshot }) {
  return (
    <div className="flex items-center gap-2">
      <span className={tableText.meta}>기준일 {snap.date || '-'}</span>
    </div>
  )
}

/**
 * 주주 구성 카드(읽기, 성장 지표 안 · 투자 현황 위). 변경 시점별 이력형.
 * 최신 구성은 표 하나로 세우고, 과거 이력은 '변경 이력' 모달로 펼쳐 본다.
 * 도넛 차트를 두지 않는 이유는 지분율이 이미 표의 한 열이어서다 — 같은 값을 원과 숫자로
 * 두 번 말하면 카드 폭의 절반이 표가 이미 답한 것을 되풀이하는 데 쓰인다.
 * 편집은 통합 수정 폼에서 관리하므로 카드 수정 버튼·수정 날짜는 두지 않는다.
 */
export function StartupShareholderCard({ history }: { history: ShareholderSnapshot[] }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [latest] = history
  const hasHistory = history.length > 1

  return (
    <PanelCard
      title="주주 구성"
      action={
        /* 기준일은 헤더 우측 — 옆 카드들의 `(단위: 백만원)`이 서는 자리다. 표 아래에 두면
           표를 다 읽고 나서야 그 숫자들이 언제 기준인지 알게 되고, 나란히 선 카드들 사이에서
           이 카드만 헤더 우측이 비어 제목 줄의 기준선이 어긋난다. */
        <div className="flex items-center gap-2">
          {latest?.date && <span className={`shrink-0 ${cardText.subtitle}`}>(기준일 {latest.date})</span>}
          {hasHistory && (
            <Button type="button" variant="outline" onClick={() => setHistoryOpen(true)}>
              변경 이력
            </Button>
          )}
        </div>
      }
    >
      {!latest || latest.holders.length === 0 ? (
        <p className="text-body text-gray-600">등록된 주주 정보가 없습니다.</p>
      ) : (
        <HolderTable holders={latest.holders} />
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
    </PanelCard>
  )
}
