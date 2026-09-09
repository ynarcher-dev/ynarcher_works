import { Button, Input } from '@ynarcher/ui'
import { ItemRows, patchAt, removeAt, type ItemCol } from '@/components/ItemRows'
import { numOrUndef } from '@/components/FormRowFields'
import type { Shareholder, ShareholderSnapshot } from '@/features/startup/startupShareholders'

/** 오늘 날짜(YYYY-MM-DD) — 새 구성의 기본 기준일. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 주주 한 줄. 주식 수·지분율은 자릿수가 정해진 값이고, 이름만 길이를 모른다.
 *
 * 종전에는 이 목록만 고정폭 flex(`min-w-40 flex-1`·`w-36`·`w-28`)에 줄마다 라벨을 다시 달았다 —
 * 같은 폼 안에서 목록이 네 가지 모양으로 서 있던 그 넷 중 하나다(2026-09-09 통일).
 */
const HOLDER_COLS: ItemCol[] = [
  { label: '주주명' },
  { label: '보유 주식 수', kind: 'num' },
  { label: '지분율(%)', kind: 'num' },
]

interface Props {
  history: ShareholderSnapshot[]
  setHistory: (h: ShareholderSnapshot[]) => void
}

/**
 * 통합 수정 폼의 '주주 구성' 입력 섹션(변경 시점별 이력형).
 * 시점(기준일)별 스냅샷을 추가하고, 각 스냅샷 안에서 주주 행을 편집한다.
 * 저장은 상위 폼이 shareholders jsonb로 통째 반영한다.
 *
 * 스냅샷을 감싸는 상자는 남는다 — 이것은 *항목 하나*를 감싸는 상자가 아니라 **한 시점의 목록
 * 전체**를 묶는 상자다. 여기까지 걷으면 기준일이 어느 목록의 것인지 화면이 답하지 못한다.
 */
export function StartupShareholderFields({ history, setHistory }: Props) {
  const patchSnap = (si: number, patch: Partial<ShareholderSnapshot>) => setHistory(patchAt(history, si, patch))

  const setHolders = (si: number, holders: Shareholder[]) => patchSnap(si, { holders })

  return (
    <div className="space-y-4">
      {history.map((snap, si) => (
        <div key={si} className="space-y-3 rounded-radius-md border border-gray-200 p-3">
          {/* 시점 헤더: 기준일 + 구성 삭제 */}
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
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={() => setHistory(removeAt(history, si))}>
              구성 삭제
            </Button>
          </div>

          {/* 주주 목록 */}
          <ItemRows
            cols={HOLDER_COLS}
            rows={snap.holders}
            onRemove={(hi) => setHolders(si, removeAt(snap.holders, hi))}
            onAdd={() =>
              setHolders(si, [...snap.holders, { name: '', shares: undefined, percentage: undefined }])
            }
            addLabel="주주 추가"
          >
            {(h, hi) => {
              const patch = (p: Partial<Shareholder>) => setHolders(si, patchAt(snap.holders, hi, p))
              return (
                <>
                  <Input value={h.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
                  <Input
                    type="number"
                    value={h.shares ?? ''}
                    onChange={(e) => patch({ shares: numOrUndef(e.target.value) })}
                  />
                  <Input
                    type="number"
                    value={h.percentage ?? ''}
                    onChange={(e) => patch({ percentage: numOrUndef(e.target.value) })}
                  />
                </>
              )
            }}
          </ItemRows>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setHistory([
            { date: today(), holders: [{ name: '', shares: undefined, percentage: undefined }] },
            ...history,
          ])
        }
      >
        구성 추가(시점)
      </Button>
    </div>
  )
}
