import { Button, Input, PageHeader } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AssetsPanel } from '@/features/management/panels/AssetsPanel'
import { DashboardPanel } from '@/features/management/panels/DashboardPanel'
import { DepartmentsPanel } from '@/features/management/panels/DepartmentsPanel'
import { FinancePanel } from '@/features/management/panels/FinancePanel'
import { HrPanel } from '@/features/management/panels/HrPanel'
import { KpiPanel } from '@/features/management/panels/KpiPanel'

const HEADINGS: Record<string, string> = {
  dashboard: '대시보드',
  departments: '조직 관리',
  hr: '인사 관리',
  assets: '자산 관리',
  finance: '재무 관리',
  kpi: 'KPI 관리',
}

/** MANAGEMENT 워크스페이스: 대시보드 / 부서 / 인사 / 자산 / 재무 / KPI. 섹션 전환은 사이드바(?tab). */
export function ManagementPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'dashboard'
  const [keyword, setKeyword] = useState('')

  // 섹션(탭) 전환 시 이전 검색어를 비운다(NETWORKS 디렉토리와 동일 UX).
  useEffect(() => {
    setKeyword('')
  }, [tab])

  // 검색 필드는 인사 관리(리스트뷰)에서만 노출한다. NETWORKS와 동일하게 헤더 슬롯에 둔다.
  const searchField =
    tab === 'hr' ? (
      <Input
        placeholder="임직원 이름 검색"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
    ) : undefined

  // 계정 생성 액션은 인사 관리 리스트뷰에서만 노출한다.
  const actions =
    tab === 'hr' ? (
      <Button onClick={() => navigate('/management/hr/new')}>계정 생성</Button>
    ) : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title={HEADINGS[tab] ?? HEADINGS.dashboard}
        search={searchField}
        actions={actions}
      />
      {tab === 'departments' && <DepartmentsPanel />}
      {tab === 'hr' && <HrPanel keyword={keyword} />}
      {tab === 'assets' && <AssetsPanel />}
      {tab === 'finance' && <FinancePanel />}
      {tab === 'kpi' && <KpiPanel />}
      {(tab === 'dashboard' || !HEADINGS[tab]) && <DashboardPanel />}
    </div>
  )
}
