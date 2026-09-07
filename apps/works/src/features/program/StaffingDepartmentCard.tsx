import { Button, IconButton, Input, Select } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { coverageSlices } from '@/features/program/programManagerCoverage'
import { StaffingMemberPicker } from '@/features/program/StaffingMemberPicker'
import { StaffingMemberRows } from '@/features/program/StaffingMemberRows'
import type { StaffingPlacement } from '@/features/program/staffingPlacement'
import type {
  ProgramDepartmentSegment,
  ProgramManagerSegment,
} from '@/features/program/staffingTypes'

interface Props {
  dept: ProgramDepartmentSegment
  /** 이 부서에 얹힌 담당자 구간만. */
  managers: ProgramManagerSegment[]
  placement: StaffingPlacement
  /** 이 단계 조직도의 부서 선택지 — 다른 카드가 이미 쓰는 부서는 호출부가 걸러 준다. */
  options: { id: string; label: string }[]
  /** 단계 기간(커버리지 envelope). */
  phaseStart: string
  phaseEnd: string
  onPatchDept: (next: Partial<ProgramDepartmentSegment>) => void
  onSetMain: () => void
  onRemoveDept: () => void
  onAddManager: (userId: string) => void
  onPatchManager: (key: string, next: Partial<ProgramManagerSegment>) => void
  onRemoveManager: (key: string) => void
}

/**
 * 부서 한 곳 + 그 부서가 맡은 사람들 = 카드 한 장.
 *
 * 종전에는 '부서 구성' 목록과 '담당자 배치' 표가 따로 서고 그 아래 부서별 커버리지 요약이 또 한
 * 벌 있었다(2026-09-06 사용자 지적으로 합침). 같은 숫자가 세 자리에 나뉘어 있어서 "경영지원1실
 * 80%"와 "염재민 80%"가 서로의 답이라는 사실을 눈으로 이을 수 없었고, 부서가 둘이 되는 순간
 * 어느 사람이 어느 부서 몫인지는 표의 '부서' 열을 한 줄씩 읽어야 알았다.
 *
 * 부서를 축으로 접으면 그 셋이 한 덩어리가 된다 — **머리에 목표(협업비율), 안에 사람, 발치에
 * 배정 합계.** 목표와 합계가 같은 상자 안에서 마주 보므로 모자란 부서를 눈이 바로 찾고, 사람은
 * 자기 부서 안에서만 고르므로 고르는 순간 이미 어디에 얹히는지가 정해져 있다.
 */
export function StaffingDepartmentCard({
  dept,
  managers,
  placement,
  options,
  phaseStart,
  phaseEnd,
  onPatchDept,
  onSetMain,
  onRemoveDept,
  onAddManager,
  onPatchManager,
  onRemoveManager,
}: Props) {
  const isMain = dept.kind === 'MAIN'
  const slices = coverageSlices(managers, phaseStart, phaseEnd, dept.collaboration_ratio)
  const allOk = slices.length > 0 && slices.every((s) => s.ok)
  const totalTone = allOk ? 'font-medium text-success' : 'font-medium text-danger'

  return (
    <li className="overflow-hidden rounded-radius-md border border-gray-200">
      {/* 부서 줄. 메인/협업 표식이 **맨 앞**에 서는 것이 요점이다 — 카드가 여러 장 쌓였을 때
          어느 것이 메인인지는 왼쪽 끝을 훑어 찾는다. 켜짐/꺼짐은 색이 가른다(채움 = 메인). */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-25 px-2.5 py-1.5">
        <Button
          className="shrink-0"
          variant={isMain ? 'primary' : 'outline'}
          aria-pressed={isMain}
          onClick={onSetMain}
          title="메인 부서로 지정"
        >
          메인
        </Button>
        <Select
          value={dept.department_id}
          onChange={(e) => onPatchDept({ department_id: e.target.value })}
          className="min-w-0 flex-1"
          aria-label="부서"
        >
          <option value="">부서 선택</option>
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
        {/* 단위(%)는 입력과 같은 줄에 서므로 같은 크기로 둔다 — 한 줄 안에서 크기를 갈라 위계를
            만들지 않는다. 폭은 바깥 칸이 갖는다(Input이 w-full 래퍼를 두므로). */}
        <label className="flex shrink-0 items-center gap-1">
          <span className="w-16">
            <Input
              type="number"
              min={1}
              max={100}
              value={dept.collaboration_ratio || ''}
              onChange={(e) =>
                onPatchDept({
                  collaboration_ratio: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                })
              }
              aria-label={`${placement.deptName(dept.department_id)} 협업비율`}
            />
          </span>
          <span className="text-body-sm text-gray-600">%</span>
        </label>
        <IconButton
          variant="ghost"
          danger
          label="부서 제거"
          onClick={onRemoveDept}
          icon={<X className="size-4" aria-hidden />}
        />
      </div>

      <div className="space-y-1.5 p-2.5">
        <StaffingMemberRows
          rows={managers}
          placement={placement}
          onPatch={onPatchManager}
          onRemove={onRemoveManager}
        />

        <StaffingMemberPicker
          deptId={dept.department_id}
          placement={placement}
          taken={new Set(managers.map((m) => m.user_id))}
          onPick={onAddManager}
        />

        {/* 배정 합계는 목표와 **같은 상자 안**에서 마주 본다. 담당자가 아직 없으면 이 줄을 세우지
            않는다 — 0%라고 적어 두면 '아직 안 넣었다'가 '0%로 채웠다'처럼 읽힌다. */}
        {managers.length > 0 && (
          <div className="space-y-0.5 border-t border-gray-100 pt-1.5 text-body-sm">
            {slices.length <= 1 ? (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">배정 합계</span>
                <span className={totalTone}>
                  {slices[0]?.total ?? 0}% / 목표 {dept.collaboration_ratio}%{allOk ? ' 충족' : ''}
                </span>
              </div>
            ) : (
              <>
                {/* 사람마다 수행 기간이 달라 합계가 시기별로 갈리면 갈린 구간을 그대로 편다 —
                    한 숫자로 접으면 어느 시기가 비었는지 화면이 답하지 못한다. */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">배정 합계(기간별)</span>
                  <span className={totalTone}>
                    목표 {dept.collaboration_ratio}%{allOk ? ' 충족' : ''}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {slices.map((s) => (
                    <li key={s.start} className="flex items-center justify-between tabular-nums">
                      <span className="text-gray-600">
                        {s.start} ~ {s.end}
                      </span>
                      <span className={s.ok ? 'text-gray-700' : 'font-medium text-danger'}>
                        {s.total}%
                        {s.ok ? '' : s.total < dept.collaboration_ratio ? ' (부족)' : ' (초과)'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
