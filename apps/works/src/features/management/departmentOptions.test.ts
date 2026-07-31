import { describe, expect, it } from 'vitest'
import {
  affiliationLabel,
  buildDepartmentOptions,
  deptPathLabel,
  nearestScopedAncestor,
} from '@/features/management/departmentOptions'
import type { Department } from '@/features/management/orgHooks'

/**
 * 실제 조직도가 겪던 문제를 그대로 사례로 박아 둔다 — 본부마다 '1팀'이 있어서, 이름만 나열하면
 * 드롭다운에서 어느 것을 고르는지 알 수 없었다. 라벨은 그래서 이름이 아니라 전체 경로다.
 */
function dept(id: string, name: string, parent: string | null, sort = 0): Department {
  return {
    id,
    name,
    parent_id: parent,
    level_id: null,
    sort_order: sort,
    version_id: 'v1',
    lineage_id: id,
    hr_hidden: false,
    deleted_at: null,
  }
}

const ORG: Department[] = [
  dept('root', '와이앤아처', null, 0),
  dept('ac', 'AC본부', 'root', 1),
  dept('scale', '스케일업그룹', 'ac', 0),
  dept('ac-1', '1팀', 'scale', 0),
  dept('inv', '투자지원실', 'root', 0),
  dept('inv-1', '1팀', 'inv', 0),
]

describe('buildDepartmentOptions', () => {
  it('라벨은 루트→자신 전체 경로다(선택해도 상위가 남는다)', () => {
    const byId = new Map(buildDepartmentOptions(ORG).map((o) => [o.id, o.label]))
    expect(byId.get('ac-1')).toBe('와이앤아처 > AC본부 > 스케일업그룹 > 1팀')
    expect(byId.get('inv-1')).toBe('와이앤아처 > 투자지원실 > 1팀')
    expect(byId.get('root')).toBe('와이앤아처')
  })

  it('같은 이름의 말단도 경로로 갈린다', () => {
    const labels = buildDepartmentOptions(ORG)
      .filter((o) => o.name === '1팀')
      .map((o) => o.label)
    expect(new Set(labels).size).toBe(2)
  })

  it('조직도 순서(DFS)로 나열하고 형제는 sort_order 순이다', () => {
    expect(buildDepartmentOptions(ORG).map((o) => o.id)).toEqual([
      'root',
      'inv',
      'inv-1',
      'ac',
      'scale',
      'ac-1',
    ])
  })

  it('부모가 목록에 없는 부서도 선택지에서 빠지지 않는다', () => {
    const orphan = dept('lost', '로컬라이즈그룹', 'gone')
    const options = buildDepartmentOptions([...ORG, orphan])
    expect(options.map((o) => o.id)).toContain('lost')
    expect(options.find((o) => o.id === 'lost')?.label).toBe('로컬라이즈그룹')
  })

  it('삭제된 부서는 선택지에 넣지 않는다', () => {
    const gone = { ...dept('old', '구 사업본부', 'root'), deleted_at: '2026-01-01T00:00:00Z' }
    expect(buildDepartmentOptions([...ORG, gone]).map((o) => o.id)).not.toContain('old')
  })
})

describe('deptPathLabel', () => {
  it('최상위(법인)만 빼고 경로를 전부 적는다', () => {
    // 중간 상위를 접으면 본부마다 있는 동명 말단이 다시 겹친다 — 그래서 경로는 다 남긴다.
    expect(deptPathLabel(ORG, 'ac-1')).toBe('AC본부 > 스케일업그룹 > 1팀')
    expect(deptPathLabel(ORG, 'inv-1')).toBe('투자지원실 > 1팀')
  })

  it('최상위 부서 자체면 뺄 것이 없으므로 그대로 적는다', () => {
    expect(deptPathLabel(ORG, 'root')).toBe('와이앤아처')
  })

  it('인사 미노출(hr_hidden)이어도 건너뛰지 않는다', () => {
    // 사업의 부서 구성은 인사 관점이 아니라 조직 그대로다 — 지정한 부서를 그대로 적는다.
    const org = ORG.map((d) => (d.id === 'scale' ? { ...d, hr_hidden: true } : d))
    expect(deptPathLabel(org, 'ac-1')).toBe('AC본부 > 스케일업그룹 > 1팀')
  })

  it('부모가 원장에 없으면 거기서 끊고, 그 부서가 최상위가 된다', () => {
    const orphan = dept('lost', '로컬라이즈그룹', 'gone')
    expect(deptPathLabel([...ORG, orphan], 'lost')).toBe('로컬라이즈그룹')
  })

  it('소속이 없거나 원장에 없는 id면 빈 문자열', () => {
    expect(deptPathLabel(ORG, null)).toBe('')
    expect(deptPathLabel(ORG, 'nope')).toBe('')
  })

  it('parent_id가 순환해도 멎지 않는다', () => {
    const cyclic = ORG.map((d) => (d.id === 'root' ? { ...d, parent_id: 'ac-1' } : d))
    expect(deptPathLabel(cyclic, 'ac-1')).toContain('1팀')
  })
})

describe('nearestScopedAncestor', () => {
  it('지정 부서에 직접 배치된 사람은 그 부서', () => {
    expect(nearestScopedAncestor(ORG, 'scale', new Set(['scale']))).toBe('scale')
  })

  it('하위 팀에 배치돼 있어도 그 사람을 포함하는 지정 부서로 접힌다', () => {
    // 사업이 'AC본부'를 지정했고 사람은 'AC본부 > 스케일업그룹 > 1팀'이면 AC본부 사람이다.
    expect(nearestScopedAncestor(ORG, 'ac-1', new Set(['ac']))).toBe('ac')
  })

  it('가장 가까운 지정 부서 하나로 못박는다', () => {
    // 상위·하위가 모두 지정돼 있으면 더 구체적인 쪽이다 — 아니면 법인 전체가 걸린다.
    expect(nearestScopedAncestor(ORG, 'ac-1', new Set(['root', 'ac', 'scale']))).toBe('scale')
  })

  it('지정 부서 밖(형제 조직)이면 null', () => {
    expect(nearestScopedAncestor(ORG, 'inv-1', new Set(['ac']))).toBeNull()
  })

  it('소속이 없거나 지정 부서가 비었으면 null', () => {
    expect(nearestScopedAncestor(ORG, null, new Set(['ac']))).toBeNull()
    expect(nearestScopedAncestor(ORG, 'ac-1', new Set())).toBeNull()
  })

  it('parent_id가 순환해도 멎지 않는다', () => {
    const cyclic = ORG.map((d) => (d.id === 'root' ? { ...d, parent_id: 'ac-1' } : d))
    expect(nearestScopedAncestor(cyclic, 'ac-1', new Set(['inv']))).toBeNull()
  })
})

describe('affiliationLabel', () => {
  it('사람 옆에는 가장 구체적인 2개만 상위 · 하위로 적는다', () => {
    // 법인(와이앤아처)까지 붙이지 않는다 — 이름 옆에 붙는 표기라 길면 이름이 밀린다.
    expect(affiliationLabel(ORG, 'ac-1')).toBe('스케일업그룹 · 1팀')
  })

  it('노출 부서가 하나뿐이면 그것만 적는다', () => {
    // 법인 루트를 인사 미노출로 두면 실 소속 하나만 남는다(실제 조직도의 운용 방식).
    const org = ORG.map((d) => (d.id === 'root' ? { ...d, hr_hidden: true } : d))
    expect(affiliationLabel(org, 'inv')).toBe('투자지원실')
  })

  it('인사 미노출(hr_hidden) 부서는 건너뛴다', () => {
    const org = ORG.map((d) => (d.id === 'scale' ? { ...d, hr_hidden: true } : d))
    expect(affiliationLabel(org, 'ac-1')).toBe('AC본부 · 1팀')
  })

  it('소속이 없거나 원장에 없는 id면 빈 문자열', () => {
    expect(affiliationLabel(ORG, null)).toBe('')
    expect(affiliationLabel(ORG, 'nope')).toBe('')
  })
})
