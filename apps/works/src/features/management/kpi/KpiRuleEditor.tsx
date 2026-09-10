import { Button, Field, Input } from '@ynarcher/ui'
import type { BandRule, GradeRule, KpiRuleType, UnitRule } from './kpiTypes'

interface Props {
  type: KpiRuleType
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}

const numberOrNull = (value: string) => value === '' ? null : Number(value)
const list = <T,>(value: unknown, fallback: T[]): T[] => Array.isArray(value) ? value as T[] : fallback

export function KpiRuleEditor({ type, value, onChange }: Props) {
  if (type === 'PER_UNIT_CAP') {
    const rows = list<UnitRule>(value.per_unit, [{ key: '항목', score: 0 }])
    const setRows = (next: UnitRule[]) => onChange({ ...value, per_unit: next })
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.key}-${index}`} className="grid grid-cols-[1fr_120px_auto] gap-2">
              <Input value={row.key} aria-label="집계 항목" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, key: e.target.value } : r))} />
              <Input type="number" value={row.score} aria-label="건당 점수" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, score: Number(e.target.value) } : r))} />
              <Button variant="ghost" onClick={() => setRows(rows.filter((_, i) => i !== index))}>삭제</Button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Button variant="secondary" onClick={() => setRows([...rows, { key: `항목 ${rows.length + 1}`, score: 0 }])}>항목 추가</Button>
          <Field label="합계 상한" className="w-40">
            <Input type="number" value={String(value.cap ?? '')} onChange={(e) => onChange({ ...value, cap: numberOrNull(e.target.value) })} />
          </Field>
        </div>
      </div>
    )
  }

  if (type === 'GRADE_MAP') {
    const rows = list<GradeRule>(value.grades, [{ grade: 'S', score: 0 }])
    const setRows = (next: GradeRule[]) => onChange({ ...value, grades: next })
    return (
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`${row.grade}-${index}`} className="grid grid-cols-[1fr_120px_auto] gap-2">
            <Input value={row.grade} aria-label="등급" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, grade: e.target.value } : r))} />
            <Input type="number" value={row.score} aria-label="점수" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, score: Number(e.target.value) } : r))} />
            <Button variant="ghost" onClick={() => setRows(rows.filter((_, i) => i !== index))}>삭제</Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => setRows([...rows, { grade: `등급 ${rows.length + 1}`, score: 0 }])}>등급 추가</Button>
      </div>
    )
  }

  const rows = list<BandRule>(value.bands, [{ min: null, max: null, score: 0 }])
  const setRows = (next: BandRule[]) => onChange({ ...value, bands: next })
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-caption font-medium text-gray-600">
        <span>이상</span><span>미만</span><span>점수</span><span className="w-12" />
      </div>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <Input type="number" value={row.min ?? ''} aria-label="구간 시작" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, min: numberOrNull(e.target.value) } : r))} />
          <Input type="number" value={row.max ?? ''} aria-label="구간 종료" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, max: numberOrNull(e.target.value) } : r))} />
          <Input type="number" value={row.score} aria-label="점수" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, score: Number(e.target.value) } : r))} />
          <Button variant="ghost" onClick={() => setRows(rows.filter((_, i) => i !== index))}>삭제</Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => setRows([...rows, { min: null, max: null, score: 0 }])}>구간 추가</Button>
    </div>
  )
}
