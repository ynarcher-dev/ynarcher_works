import { DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  activeOrgVersionId,
  useDepartments,
  useEmployeesPage,
  useOrgLevels,
  useOrgVersions,
  type Employee,
} from '@/features/management/hooks'
import { buildTiers, resolveByTier, toNodes } from '@/features/management/panels/departmentsMock'
import { useEmployeeBranchNames } from '@/features/office/branches/branchMembers'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

/** 값이 없거나 집계 미연동 컬럼의 공통 플레이스홀더. */
const DASH = <span className="text-gray-400">-</span>

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

interface EmployeeDirectoryProps {
  /** 상위(PageHeader 검색 슬롯)에서 내려오는 이름 검색어. */
  keyword: string
  /** 행 클릭 시 이동할 상세 경로 prefix. 기본은 인사 관리 상세('/management/hr'). */
  detailBasePath?: string
  /** 호봉 컬럼 노출. 인사 관리(MANAGEMENT)만 true, OFFICE 임직원 정보는 false로 내린다. */
  showPayStep?: boolean
}

/**
 * 임직원 풀 리스트뷰(독립 컴포넌트). 전문가 풀과 구성은 유사하나 공용 MasterListView에
 * 의존하지 않고 DataTable을 직접 구성한다(HR 전용 컬럼·정렬 요구를 공용 컴포넌트에 얹지 않기 위함).
 * 소속은 회사/부서/팀으로 세분화하고, 부서/팀은 2단 조직도(상위=부서·하위=팀)에서 파생한다.
 * 회사·직책/직급·연락처 및 집계 지표(관리기업/운영사업/M&A/프로젝트/펀드)는 데이터 연결 전이라 '-'.
 * 인사 관리(MANAGEMENT)와 임직원 정보(OFFICE)가 동일 구조로 재사용하며, 목록은 양쪽 모두 조회 전용이다.
 * 비활성화(소프트 삭제)는 NETWORKS·STARTUP과 같이 상세 페이지 상단바가 소유한다 — 목록에 관리 컬럼을 두지 않는다.
 */
export function EmployeeDirectory({
  keyword,
  detailBasePath = '/management/hr',
  showPayStep = true,
}: EmployeeDirectoryProps) {
  const navigate = useNavigate()
  // 임직원은 내부 구성원이라 개인정보 마스킹 대상이 아니다(민감정보 정책은 외부 인물·기업만 다룬다).
  const [page, setPage] = useState(0)

  // 검색어 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => {
    setPage(0)
  }, [keyword])

  const { data: versionRows } = useOrgVersions()
  const activeVersionId = useMemo(
    () => (versionRows ? activeOrgVersionId(versionRows) : null),
    [versionRows],
  )
  const { data: depts, isLoading: deptLoading } = useDepartments(false, activeVersionId ?? undefined)
  const { data: levels = [], isLoading: levelLoading } = useOrgLevels(activeVersionId ?? undefined)
  const { data, isLoading } = useEmployeesPage(keyword, page, PAGE_SIZE)
  // 지사는 임직원 원장이 아니라 지사 원장(branch_members)에서 역방향으로 읽는다 — 양쪽에 적지 않는다.
  const { branchNamesOf } = useEmployeeBranchNames()

  const nodes = useMemo(() => toNodes(depts ?? []), [depts])
  // 병렬 레벨은 티어로 합쳐 컬럼 1개(예: '본부 / 실').
  const tiers = useMemo(() => buildTiers(levels), [levels])

  // 임직원 소속 부서를 조상 경로로 펼쳐 티어별 소속명으로 해석(부서당 1회 캐시).
  const resolveFor = useMemo(() => {
    const cache = new Map<string, Record<number, string>>()
    return (deptId: string | null): Record<number, string> => {
      const key = deptId ?? ''
      let v = cache.get(key)
      if (!v) {
        v = resolveByTier(nodes, tiers, deptId)
        cache.set(key, v)
      }
      return v
    }
  }, [nodes, tiers])

  // 회사/부서/팀 하드코딩 → 조직관리에서 정의한 티어를 컬럼으로 동적 생성.
  const levelColumns: Column<Employee>[] = tiers.map((t) => ({
    key: `tier-${t.tier}`,
    header: t.label,
    render: (r) => {
      const v = resolveFor(r.department_id)[t.tier]
      return v && v !== '-' ? v : DASH
    },
    className: 'w-28',
  }))

  const columns: Column<Employee>[] = [
    { key: 'name', header: '이름', render: (r) => r.name, className: 'w-24' },
    ...levelColumns,
    {
      key: 'branch',
      header: '지사',
      // 한 사람이 여러 지사에 배정될 수 있어(원장은 다대다) 쉼표로 잇는다.
      render: (r) => {
        const names = branchNamesOf(r.id)
        return names.length ? names.join(', ') : DASH
      },
      className: 'w-24',
    },
    {
      key: 'position',
      header: '직책',
      render: (r) => str(r.profile?.position) || DASH,
      className: 'w-20',
    },
    {
      key: 'rank',
      header: '직급',
      render: (r) => str(r.profile?.rank) || DASH,
      className: 'w-20',
    },
    // 호봉은 인사 관리 맥락에서만 쓰는 처우 정보다 — OFFICE 임직원 정보에서는 컬럼째 빼둔다.
    ...(showPayStep
      ? [
          {
            key: 'pay_step',
            header: '호봉',
            render: (r: Employee) => str(r.profile?.pay_step) || DASH,
            className: 'w-20',
          },
        ]
      : []),
    {
      key: 'email',
      header: '이메일',
      render: (r) => r.email ?? '-',
      // 회사 도메인(@ynarcher.com) 포함 20자 안팎이 잘리지 않는 폭.
      className: 'w-44',
    },
    {
      key: 'phone',
      header: '연락처',
      render: (r) => r.phone || DASH,
      // 휴대폰 번호(010-0000-0000)가 잘리지 않는 최소 폭.
      className: 'w-32',
    },
    // 집계 지표는 값이 아직 '-'뿐이고 자릿수도 한 자리 수준이라, 우측 정렬보다 가운데가 읽기 쉽다.
    { key: 'managed_cos', header: '관리기업', render: () => DASH, align: 'center', className: 'w-20' },
    { key: 'businesses', header: '운영사업', render: () => DASH, align: 'center', className: 'w-20' },
    { key: 'mna', header: 'M&A', render: () => DASH, align: 'center', className: 'w-20' },
    { key: 'projects', header: '프로젝트', render: () => DASH, align: 'center', className: 'w-20' },
    { key: 'fund_managed', header: '펀드(관리)', render: () => DASH, align: 'center', className: 'w-20' },
    { key: 'fund_operated', header: '펀드(운용)', render: () => DASH, align: 'center', className: 'w-20' },
  ]

  if (isLoading || (deptLoading && !depts) || (levelLoading && !levels.length)) return <Spinner />

  return (
    <DataTable
      columns={columns}
      rows={data?.rows ?? []}
      rowKey={(r) => r.id}
      layout="fixed"
      selectable
      showAuthor={false}
      // 관리 액션이 전부 상세로 옮겨가 빈 열만 남으므로 관리 컬럼 자체를 렌더하지 않는다.
      showManageColumn={false}
      updatedAtAlign="center"
      onRowClick={(r) => navigate(`${detailBasePath}/${r.id}`)}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: data?.total ?? 0,
        totalAll: data?.totalAll ?? 0,
        onChange: setPage,
      }}
      emptyText="등록된 임직원이 없습니다."
    />
  )
}
