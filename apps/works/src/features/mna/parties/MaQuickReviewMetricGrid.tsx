import { Button, IconButton, Input, formText } from '@ynarcher/ui'
import { Trash2 } from 'lucide-react'
import { Fragment } from 'react'
import { NumberInput, numOrUndef } from '@/components/FormRowFields'
import { million, percent } from '@/features/mna/parties/MaQuickReviewParts'
import { metricValue, type MetricRowSpec } from '@/features/mna/parties/quickReviewMetrics'

/**
 * 재무 표 한 장(편집) — 조회와 같이 **항목이 행, 연도가 열**이다.
 *
 * 조회와 배치를 맞추는 것이 규격이 아니라 **정확성**의 문제인 자리다. 적을 때는 세로로 눕히고
 * 읽을 때는 가로로 세우면, 방금 `2024년 EBITDA` 칸에 넣은 숫자가 조회에서 어느 칸으로 갔는지
 * 눈이 매번 다시 찾는다. 행 정의도 조회와 같은 목록(`quickReviewMetrics.ts`)을 읽는다.
 *
 * ## 계산되는 칸은 입력이 아니라 결과다
 *
 * `% growth`·`margin %`·`Net debt`는 입력 상자를 세우지 않고 **지금 적힌 값으로 즉시 계산해**
 * 회색 칸에 보여 준다. 상자를 세워 두고 못 쓰게 막는 방법(disabled)을 쓰지 않는 것은, 그 모양이
 * "지금은 못 적는다"로 읽혀 언젠가 적을 수 있는 칸처럼 보이기 때문이다 — 이 칸은 영영 적는
 * 칸이 아니라 답이 나오는 칸이다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */
export function MaQuickReviewMetricGrid<T extends { fiscalYear: number }>({
  specs,
  years,
  setYears,
  addLabel,
}: {
  specs: MetricRowSpec<T>[]
  years: T[]
  setYears: (years: T[]) => void
  addLabel: string
}) {
  const patch = (i: number, p: Partial<T>) =>
    setYears(years.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  // 연도 열은 최소 폭을 갖는다 — 여섯 자리 숫자가 들어가는 입력 상자라, 열이 좁아지면 적는
  // 동안 자릿수가 상자 밖으로 밀려 방금 친 숫자를 눈으로 확인할 수 없다. 열이 많아 폭이
  // 모자라면 격자가 줄어드는 대신 가로로 스크롤한다.
  const gridStyle = {
    gridTemplateColumns: `10rem repeat(${years.length}, minmax(7rem, 1fr))`,
  }

  const addYear = () => {
    // 새 해는 마지막 해 다음이다 — 문서가 왼쪽에서 오른쪽으로 시간순이라 그 순서를 깨지 않는다.
    const next = (years.at(-1)?.fiscalYear ?? new Date().getFullYear() - 1) + 1
    setYears([...years, { fiscalYear: next } as T])
  }

  return (
    <div className="space-y-2">
      {years.length > 0 && (
        <div className="overflow-x-auto">
          <div className="grid items-center gap-x-2 gap-y-1.5" style={gridStyle}>
            <span className="text-caption text-gray-700">항목</span>
            {years.map((y, i) => (
              <div key={`head-${i}`} className="flex items-center gap-1">
                <Input
                  type="number"
                  aria-label={`${i + 1}번째 회계연도`}
                  value={y.fiscalYear || ''}
                  onChange={(e) =>
                    patch(i, { fiscalYear: numOrUndef(e.target.value) ?? 0 } as Partial<T>)
                  }
                />
                {/* 연도를 지우는 것은 그 해의 모든 항목을 지우는 일이라 열 머리에 선다 —
                    행 끝에 두면 무엇이 지워지는지(한 해인지 한 항목인지) 자리가 답하지 못한다. */}
                <IconButton
                  label={`${y.fiscalYear || '이'} 연도 삭제`}
                  variant="ghost"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setYears(years.filter((_, idx) => idx !== i))}
                />
              </div>
            ))}

            {specs.map((spec) => (
              <Fragment key={spec.key}>
                {/* 라벨의 굵기·색이 조회 표와 같은 축을 말한다 — 굵으면 적는 값, 물러나 있으면
                    계산되는 값이다(들여쓰기는 '위 행에 딸렸다'는 별개 축). */}
                <span
                  className={`${spec.sub ? 'pl-3 ' : ''}${
                    spec.derive
                      ? 'text-body font-normal text-gray-600'
                      : 'text-body font-medium text-gray-900'
                  }`}
                >
                  {spec.label}
                </span>
                {years.map((row, i) => {
                  if (spec.derive) {
                    const v = metricValue(spec, row, years[i - 1] ?? null)
                    return (
                      <span
                        key={`${spec.key}-${i}`}
                        className="rounded-radius-sm bg-gray-50 px-3 py-1.5 text-right tabular-nums text-body text-gray-600"
                      >
                        {v == null ? '-' : spec.format === 'percent' ? percent(v) : million(v)}
                      </span>
                    )
                  }
                  return (
                    <NumberInput
                      key={`${spec.key}-${i}`}
                      value={(row as Record<string, number | null | undefined>)[spec.field ?? '']}
                      onChange={(v) => patch(i, { [spec.field as string]: v ?? null } as Partial<T>)}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {years.length === 0 && (
        // 차단 안내는 접지 않는다 — 왜 적을 칸이 없는지를 답하는 줄이다.
        <p className={formText.hint}>회계연도를 추가하면 항목을 적을 칸이 섭니다.</p>
      )}
      <Button type="button" variant="outline" onClick={addYear}>
        {addLabel}
      </Button>
    </div>
  )
}
