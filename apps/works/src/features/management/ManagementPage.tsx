import { Button, Input, PageHeader } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AssetsPanel } from '@/features/management/panels/AssetsPanel'
import { DashboardPanel } from '@/features/management/panels/DashboardPanel'
import { DepartmentsPanel } from '@/features/management/panels/DepartmentsPanel'
import { FinancePanel } from '@/features/management/panels/FinancePanel'
import { HrPanel } from '@/features/management/panels/HrPanel'
import { KpiPanel } from '@/features/management/panels/KpiPanel'
import { TagAdminPanel } from '@/features/admin/TagAdminPanel'
import { TAG_CONFIGS } from '@/features/admin/tagConfig'

const HEADINGS: Record<string, string> = {
  dashboard: '경영 현황',
  departments: '조직 관리',
  branches: '지사 관리',
  hr: '인사 관리',
  positions: TAG_CONFIGS.positions.heading,
  ranks: TAG_CONFIGS.ranks.heading,
  pay_steps: TAG_CONFIGS.paySteps.heading,
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
      {tab === 'branches' && (
        <p className="rounded border border-dashed border-gray-300 py-12 text-center text-body text-gray-400">
          지사 관리는 준비 중입니다.
        </p>
      )}
      {tab === 'hr' && <HrPanel keyword={keyword} />}
      {tab === 'positions' && <TagAdminPanel config={TAG_CONFIGS.positions} />}
      {tab === 'ranks' && <TagAdminPanel config={TAG_CONFIGS.ranks} />}
      {tab === 'pay_steps' && <TagAdminPanel config={TAG_CONFIGS.paySteps} />}
      {tab === 'assets' && <AssetsPanel />}
      {tab === 'finance' && <FinancePanel />}
      {tab === 'kpi' && <KpiPanel />}
      {(tab === 'dashboard' || !HEADINGS[tab]) && <DashboardPanel />}
    </div>
  )
}
