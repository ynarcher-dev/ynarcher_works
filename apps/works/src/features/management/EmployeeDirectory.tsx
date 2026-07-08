import { DataTable, Spinner, useToast, type Column } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { maskEmail, maskPhone } from '@/lib/mask'
import { useSensitiveStore } from '@/features/admin/sensitiveStore'
import {
  useDeactivateEmployee,
  useDepartments,
  useEmployeesPage,
  useOrgLevels,
  type Employee,
} from '@/features/management/hooks'
import { buildTiers, resolveByTier, toNodes } from '@/features/management/panels/departmentsMock'

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
  /** 조회 전용 모드(OFFICE 임직원 정보): 비활성화 액션을 숨긴다. */
  readOnly?: boolean
  /** 행 클릭 시 이동할 상세 경로 prefix. 기본은 인사 관리 상세('/management/hr'). */
  detailBasePath?: string
}

/**
 * 임직원 풀 리스트뷰(독립 컴포넌트). 전문가 풀과 구성은 유사하나 공용 MasterListView에
 * 의존하지 않고 DataTable을 직접 구성한다(HR 전용 컬럼·정렬 요구를 공용 컴포넌트에 얹지 않기 위함).
 * 소속은 회사/부서/팀으로 세분화하고, 부서/팀은 2단 조직도(상위=부서·하위=팀)에서 파생한다.
 * 회사·직책/직급·연락처 및 집계 지표(관리기업/운영사업/M&A/프로젝트/펀드)는 데이터 연결 전이라 '-'.
 * 인사 관리(MANAGEMENT)와 임직원 정보(OFFICE)가 동일 구조로 재사용하며, OFFICE는 readOnly로 조회만 한다.
 */
export function EmployeeDirectory({
  keyword,
  readOnly = false,
  detailBasePath = '/management/hr',
}: EmployeeDirectoryProps) {
  const navigate = useNavigate()
  const toast = useToast()
  // 관리자 민감정보 표시 토글. 목록은 기본 마스킹, 토글이 켜졌을 때만 원문을 노출한다.
  const show = useSensitiveStore((s) => s.show)
  const [page, setPage] = useState(0)
  const deactivate = useDeactivateEmployee()

  // 검색어 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => {
    setPage(0)
  }, [keyword])

  const { data: depts } = useDepartments()
  const { data: levels = [] } = useOrgLevels()
  const { data, isLoading } = useEmployeesPage(keyword, page, PAGE_SIZE)

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
    {
      key: 'pay_step',
      header: '호봉',
      render: (r) => str(r.profile?.pay_step) || DASH,
      className: 'w-20',
    },
    {
      key: 'email',
      header: '이메일',
      render: (r) => (show.email ? r.email ?? '-' : maskEmail(r.email ?? null)),
      className: 'w-36',
    },
    {
      key: 'phone',
      header: '연락처',
      render: (r) =>
        r.phone ? (show.phone ? r.phone : maskPhone(r.phone)) : DASH,
      className: 'w-28',
    },
    { key: 'managed_cos', header: '관리기업', render: () => DASH, align: 'right', className: 'w-20' },
    { key: 'businesses', header: '운영사업', render: () => DASH, align: 'right', className: 'w-20' },
    { key: 'mna', header: 'M&A', render: () => DASH, align: 'right', className: 'w-20' },
    { key: 'projects', header: '프로젝트', render: () => DASH, align: 'right', className: 'w-20' },
    { key: 'fund_managed', header: '펀드(관리)', render: () => DASH, align: 'right', className: 'w-20' },
    { key: 'fund_operated', header: '펀드(운용)', render: () => DASH, align: 'right', className: 'w-20' },
  ]

  if (isLoading) return <Spinner />

  return (
    <DataTable
      columns={columns}
      rows={data?.rows ?? []}
      rowKey={(r) => r.id}
      layout="fixed"
      selectable
      showAuthor={false}
      updatedAtAlign="right"
      onRowClick={(r) => navigate(`${detailBasePath}/${r.id}`)}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: data?.total ?? 0,
        totalAll: data?.totalAll ?? 0,
        onChange: setPage,
      }}
      meta={{
        // 작성자명 연동 전까지 임시 표기(작성자 컬럼은 showAuthor=false로 숨김).
        copyText: (r) => {
          const path = resolveFor(r.department_id)
          const orgLines = tiers.map((t) => `${t.label}: ${path[t.tier] === '-' ? '' : path[t.tier]}`)
          return [`이름: ${r.name}`, ...orgLines, `이메일: ${r.email ?? ''}`].join('\n')
        },
        // 조회 전용(OFFICE)에서는 비활성화 액션을 제공하지 않는다.
        onDeactivate: readOnly
          ? undefined
          : (r) =>
              deactivate.mutate(r.id, {
                onSuccess: () => toast.show('임직원을 비활성화했습니다.', 'success'),
                onError: () =>
                  toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger'),
              }),
      }}
      emptyText="등록된 임직원이 없습니다."
    />
  )
}
