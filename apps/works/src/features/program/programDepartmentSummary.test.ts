import { describe, expect, it } from 'vitest'
import {
  programDepartmentText,
  summarizeProgramDepartments,
  type DepartmentRef,
} from '@/features/program/programDepartmentSummary'

/** 계보 없이(= 조직도 미도착) 부르는 경우를 흉내낸다. */
const identity = (id: string) => id

function dept(department_id: string, kind: 'MAIN' | 'COLLAB'): DepartmentRef {
  return { department_id, kind }
}

describe('summarizeProgramDepartments', () => {
  it('대표는 메인 부서다(입력 순서와 무관)', () => {
    const s = summarizeProgramDepartments([dept('a', 'COLLAB'), dept('b', 'MAIN')], identity)
    expect(s?.mainDepartmentId).toBe('b')
    expect(s?.restCount).toBe(1)
  })

  it('부서가 하나면 외 N을 붙이지 않는다', () => {
    const s = summarizeProgramDepartments([dept('a', 'MAIN')], identity)
    expect(s?.restCount).toBe(0)
  })

  it('부서 구성이 없으면 null', () => {
    expect(summarizeProgramDepartments([], identity)).toBeNull()
  })

  it('메인이 없으면(구성 미완) 첫 부서를 대표로 세운다', () => {
    const s = summarizeProgramDepartments([dept('a', 'COLLAB'), dept('b', 'COLLAB')], identity)
    expect(s?.mainDepartmentId).toBe('a')
    expect(s?.restCount).toBe(1)
  })

  it('단계(조직 버전)마다 다시 지정된 같은 부서는 한 번만 센다', () => {
    // 개편 전/후 id가 다를 뿐 같은 부서다 — 계보로 접지 않으면 '외 1'이 아니라 '외 3'이 된다.
    const rows = [
      dept('v1-main', 'MAIN'),
      dept('v2-main', 'MAIN'),
      dept('v1-collab', 'COLLAB'),
      dept('v2-collab', 'COLLAB'),
    ]
    const lineageOf = (id: string) => (id.endsWith('main') ? 'L-main' : 'L-collab')
    expect(summarizeProgramDepartments(rows, lineageOf)?.restCount).toBe(1)
  })
})

describe('programDepartmentText', () => {
  const labelOf = () => 'AC본부 > 밸류커넥트그룹 > 3팀'

  it('혼자면 부서 경로만', () => {
    expect(programDepartmentText({ mainDepartmentId: 'a', restCount: 0 }, labelOf)).toBe(
      'AC본부 > 밸류커넥트그룹 > 3팀',
    )
  })

  it('다른 부서가 붙으면 메인 뒤에 외 N만 붙인다', () => {
    expect(programDepartmentText({ mainDepartmentId: 'a', restCount: 1 }, labelOf)).toBe(
      'AC본부 > 밸류커넥트그룹 > 3팀 외 1',
    )
  })
})
