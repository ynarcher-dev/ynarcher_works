import { Button, Input, PageHeader } from '@ynarcher/ui'
import { Maximize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AssetsPanel } from '@/features/management/assets/AssetsPanel'
import { DashboardPanel } from '@/features/management/panels/DashboardPanel'
import { DepartmentsPanel } from '@/features/management/panels/DepartmentsPanel'
import { FinancePanel } from '@/features/management/panels/FinancePanel'
import { HrDirectoryFullscreen } from '@/features/management/panels/HrDirectoryFullscreen'
import { HrPanel } from '@/features/management/panels/HrPanel'
import { KpiPanel } from '@/features/management/panels/KpiPanel'
import { BranchAdminPanel } from '@/features/management/panels/BranchAdminPanel'

const HEADINGS: Record<string, string> = {
  dashboard: '경영 현황',
  departments: '조직 관리',
  branches: '지사 관리',
  hr: '인사 관리',
  assets: '자산 관리',
  finance: '재무 관리',
  kpi: 'KPI 관리',
}

/**
 * MANAGEMENT 워크스페이스: 대시보드 / 조직·지사 / 인사 / 자산 / 재무 / KPI.
 * 섹션 전환은 사이드바(?tab). 지사 원장은 조직 축이므로 ADMIN에서 이관해 여기서 소유하고,
 * 반대로 인사 기준정보 태그(직책·직급·호봉)는 쓰기 권한이 ADMIN 하나뿐이라 ADMIN이 소유한다.
 */
export function ManagementPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'dashboard'
  const [keyword, setKeyword] = useState('')
  // 임직원 목록 크게보기(전체화면) 여부.
  const [hrExpanded, setHrExpanded] = useState(false)

  // 섹션(탭) 전환 시 이전 검색어를 비운다(NETWORKS 디렉토리와 동일 UX).
  useEffect(() => {
    setKeyword('')
    setHrExpanded(false)
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

  // 크게보기·등록 액션은 인사 관리 리스트뷰에서만 노출한다.
  // 문구는 `{대상 명사} 등록` 규칙을 따른다 — 하는 일은 로그인 계정 발급이지만, 이 화면이
  // 다루는 원장은 임직원이고 다른 목록도 모두 '~ 등록'으로 부른다(구 '계정 생성').
  // 대용량 업로드 버튼은 두지 않는다 — 임직원 등록은 원장 INSERT가 아니라 인증 계정 발급이라
  // CSV 한 장으로 일괄 처리할 경로가 없다.
  const actions =
    tab === 'hr' ? (
      <>
        <Button variant="outline" onClick={() => setHrExpanded(true)}>
          <Maximize2 size={14} /> 크게보기
        </Button>
        <Button onClick={() => navigate('/management/hr/new')}>임직원 등록</Button>
      </>
    ) : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title={HEADINGS[tab] ?? HEADINGS.dashboard}
        search={searchField}
        actions={actions}
      />
      {tab === 'departments' && <DepartmentsPanel />}
      {tab === 'branches' && <BranchAdminPanel />}
      {tab === 'hr' && <HrPanel keyword={keyword} />}
      {tab === 'assets' && <AssetsPanel />}
      {tab === 'finance' && <FinancePanel />}
      {tab === 'kpi' && <KpiPanel />}
      {/* 모르는 탭(이관된 직책·직급·호봉의 옛 링크 포함)은 이 워크스페이스의 첫 화면으로 받는다. */}
      {(tab === 'dashboard' || !HEADINGS[tab]) && <DashboardPanel />}

      <HrDirectoryFullscreen
        open={tab === 'hr' && hrExpanded}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onClose={() => setHrExpanded(false)}
      />
    </div>
  )
}
