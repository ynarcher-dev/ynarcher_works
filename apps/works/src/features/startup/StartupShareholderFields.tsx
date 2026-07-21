import { Button, Input } from '@ynarcher/ui'
import type { Shareholder, ShareholderSnapshot } from '@/features/startup/startupShareholders'

/** 빈 문자열 → undefined, 그 외 숫자로 파싱(콤마 허용). */
function numOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? undefined : n
}

/** 오늘 날짜(YYYY-MM-DD) — 새 구성의 기본 기준일. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  history: ShareholderSnapshot[]
  setHistory: (h: ShareholderSnapshot[]) => void
}

/**
 * 통합 수정 폼의 '주주 구성' 입력 섹션(변경 시점별 이력형).
 * 시점(기준일 + 라운드)별 스냅샷을 추가하고, 각 스냅샷 안에서 주주 행을 편집한다.
 * 저장은 상위 폼이 shareholders jsonb로 통째 반영한다.
 */
export function StartupShareholderFields({ history, setHistory }: Props) {
  const patchSnap = (si: number, patch: Partial<ShareholderSnapshot>) =>
    setHistory(history.map((s, idx) => (idx === si ? { ...s, ...patch } : s)))

  const patchHolder = (si: number, hi: number, patch: Partial<Shareholder>) => {
    const holders = history[si]?.holders ?? []
    patchSnap(si, { holders: holders.map((h, idx) => (idx === hi ? { ...h, ...patch } : h)) })
  }

  const addHolder = (si: number) => {
    const holders = history[si]?.holders ?? []
    patchSnap(si, { holders: [...holders, { name: '', shares: undefined, percentage: undefined }] })
  }

  const removeHolder = (si: number, hi: number) => {
    const holders = history[si]?.holders ?? []
    patchSnap(si, { holders: holders.filter((_, idx) => idx !== hi) })
  }

  return (
    <div className="space-y-4">
      {history.map((snap, si) => (
        <div key={si} className="space-y-3 rounded-radius-md border border-gray-200 p-3">
          {/* 시점 헤더: 기준일 + 라운드 + 구성 삭제 */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-0.5 block text-caption text-gray-700">기준일</span>
              <Input
                type="date"
                className="w-40"
                value={snap.date ?? ''}
                onChange={(e) => patchSnap(si, { date: e.target.value })}
              />
            </label>
            <label className="min-w-40 flex-1 block">
              <span className="mb-0.5 block text-caption text-gray-700">라운드·사유(선택)</span>
              <Input
                placeholder="예: Series A"
                value={snap.round ?? ''}
                onChange={(e) => patchSnap(si, { round: e.target.value })}
              />
            </label>
            <Button type="button" variant="secondary" onClick={() => setHistory(history.filter((_, idx) => idx !== si))}>
              구성 삭제
            </Button>
          </div>

          {/* 주주 목록 */}
          <div className="space-y-2">
            {snap.holders.map((h, hi) => (
              <div key={hi} className="flex flex-wrap items-end gap-2">
                <label className="min-w-40 flex-1 block">
                  <span className="mb-0.5 block text-caption text-gray-700">주주명</span>
                  <Input value={h.name ?? ''} onChange={(e) => patchHolder(si, hi, { name: e.target.value })} />
                </label>
                <label className="w-36 block">
                  <span className="mb-0.5 block text-caption text-gray-700">보유 주식 수</span>
                  <Input
                    type="number"
                    value={h.shares ?? ''}
                    onChange={(e) => patchHolder(si, hi, { shares: numOrUndef(e.target.value) })}
                  />
                </label>
                <label className="w-28 block">
                  <span className="mb-0.5 block text-caption text-gray-700">지분율(%)</span>
                  <Input
                    type="number"
                    value={h.percentage ?? ''}
                    onChange={(e) => patchHolder(si, hi, { percentage: numOrUndef(e.target.value) })}
                  />
                </label>
                <Button type="button" variant="secondary" onClick={() => removeHolder(si, hi)}>
                  삭제
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => addHolder(si)}>
              주주 추가
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => setHistory([{ date: today(), round: '', holders: [{ name: '', shares: undefined, percentage: undefined }] }, ...history])}
      >
        구성 추가(시점)
      </Button>
    </div>
  )
}
