import { Button, IconButton, Input, Select } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import type { ProgramDepartmentDraft } from '@/features/program/hooks'
import { ratioSum } from '@/features/program/programManagerCoverage'
import { useDepartmentOptions } from '@/features/management/departmentOptions'

/** 편집용 부서 구성(Draft + React 리스트 키). */
export interface ProgramDepartmentSegment extends ProgramDepartmentDraft {
  _key: string
}

interface Props {
  value: ProgramDepartmentSegment[]
  onChange: (rows: ProgramDepartmentSegment[]) => void
  /** 이 단계의 org 버전(부서 선택지 스코프 + 신규 행 스탬프). */
  versionId: string
}

/**
 * 프로그램 부서 구성 편집기(메인 1개 + 협업 n개) — 한 단계(org 버전) 스코프.
 * 해당 버전 조직도에서 부서를 골라 메인/협업으로 지정하고 협업비율(합 100%)을 세팅한다.
 * 담당자 투입률은 이 부서 협업비율을 기준으로 채운다.
 * 부서 선택지는 조직도 순서 + 전체 경로 라벨이다(departmentOptions) — 같은 이름의 말단이 여럿이라
 * 이름만으로는 어느 상위 소속인지 가릴 수 없다.
 */
export function ProgramDepartmentEditor({ value, onChange, versionId }: Props) {
  const { options: master, labelOf } = useDepartmentOptions(versionId)
  const nameOf = (id: string) => labelOf(id, '부서 선택')

  const add = () => {
    const isFirst = value.length === 0
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        org_version_id: versionId,
        department_id: '',
        kind: isFirst ? 'MAIN' : 'COLLAB',
        collaboration_ratio: 0,
      },
    ])
  }
  const remove = (key: string) => {
    const next = value.filter((r) => r._key !== key)
    // 메인을 지웠고 행이 남으면 첫 행을 메인으로 승격(항상 메인 1개 유지 시도).
    if (next.length && !next.some((r) => r.kind === 'MAIN')) next[0] = { ...next[0]!, kind: 'MAIN' }
    onChange(next)
  }
  const patch = (key: string, next: Partial<ProgramDepartmentSegment>) =>
    onChange(value.map((r) => (r._key === key ? { ...r, ...next } : r)))
  const setMain = (key: string) =>
    onChange(value.map((r) => ({ ...r, kind: r._key === key ? 'MAIN' : 'COLLAB' })))

  const sum = ratioSum(value)
  const mainCount = value.filter((r) => r.kind === 'MAIN').length
  const usedIds = new Set(value.map((r) => r.department_id).filter(Boolean))

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((row) => (
            <li key={row._key} className="flex items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-25 px-2.5 py-1.5">
              <Select
                value={row.department_id}
                onChange={(e) => patch(row._key, { department_id: e.target.value })}
                className="min-w-0 flex-1"
              >
                <option value="">부서 선택</option>
                {master
                  .filter((d) => d.id === row.department_id || !usedIds.has(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
              </Select>
              {/* 켜짐/꺼짐을 색으로 가른다 — 켜지면 브랜드 채움(primary), 아니면 테두리(outline). */}
              <Button
                className="shrink-0"
                variant={row.kind === 'MAIN' ? 'primary' : 'outline'}
                aria-pressed={row.kind === 'MAIN'}
                onClick={() => setMain(row._key)}
                title="메인 부서로 지정"
              >
                메인
              </Button>
              {/* 단위(%)는 입력과 같은 줄에 서므로 같은 크기로 둔다 — 한 줄 안에서 크기를 갈라
                  위계를 만들지 않는다. 폭은 바깥 칸이 갖는다(Input이 w-full 래퍼를 두므로). */}
              <label className="flex shrink-0 items-center gap-1">
                <span className="w-16">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={row.collaboration_ratio || ''}
                    onChange={(e) =>
                      patch(row._key, {
                        collaboration_ratio: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                    aria-label={`${nameOf(row.department_id)} 협업비율`}
                  />
                </span>
                <span className="text-body-sm text-gray-600">%</span>
              </label>
              <IconButton
                variant="ghost"
                danger
                label="부서 제거"
                onClick={() => remove(row._key)}
                icon={<X className="size-4" aria-hidden />}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" className="border-dashed" onClick={add}>
          <Plus className="size-4" aria-hidden /> 부서 추가
        </Button>
        {value.length > 0 && (
          <span className="flex items-center gap-2 text-caption">
            <span className={mainCount !== 1 ? 'font-medium text-danger' : 'text-gray-600'}>
              메인 {mainCount}개{mainCount !== 1 ? ' (1개 필요)' : ''}
            </span>
            <span className={sum === 100 ? 'font-medium text-success' : 'font-medium text-danger'}>
              협업비율 합 {sum}% / 100%
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
