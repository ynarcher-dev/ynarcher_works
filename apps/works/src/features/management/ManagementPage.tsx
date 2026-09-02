import { Button, Input, PageHeader } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApprovalAggregatePanel } from '@/features/approval/ApprovalAggregatePanel'
import { AssetsPanel } from '@/features/management/assets/AssetsPanel'
import { AttendancePanel } from '@/features/management/attendance/AttendancePanel'
import { DashboardPanel } from '@/features/management/panels/DashboardPanel'
import { DepartmentsPanel } from '@/features/management/panels/DepartmentsPanel'
import { FinancePanel } from '@/features/management/panels/FinancePanel'
import { HrPanel } from '@/features/management/panels/HrPanel'
import { KpiPanel } from '@/features/management/panels/KpiPanel'
import { PartnersPanel } from '@/features/management/partners/PartnersPanel'
import { BranchAdminPanel } from '@/features/management/panels/BranchAdminPanel'

const HEADINGS: Record<string, string> = {
  dashboard: '경영 현황',
  departments: '조직 관리',
  branches: '지사 관리',
  hr: '인사 관리',
  attendance: '근태 관리',
  assets: '자산 관리',
  finance: '재무 관리',
  partners: '거래처 정보',
  'approval-stats': '결재 금액 집계',
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

  // 섹션(탭) 전환 시 이전 검색어를 비운다(NETWORKS 디렉토리와 동일 UX).
  useEffect(() => {
    setKeyword('')
  }, [tab])

  // 검색 필드가 서는 자리는 그 목록에 필터가 있는지가 정한다(2026-09-03).
  // 필터가 없는 목록(인사 관리)은 NETWORKS와 같이 헤더 슬롯에 두고, 필터가 있는 목록
  // (자산·거래처)은 패널이 검색을 조건 줄에 함께 세운다 — 검색어와 필터는 "무엇을 보여줄지"를
  // 정하는 같은 층의 조건이라, 줄을 갈라 두면 헤더와 본문 사이에 조건이 두 군데로 흩어진다.
  const searchField =
    tab === 'hr' ? (
      <Input
        placeholder="임직원 이름 검색"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
    ) : undefined

  // 등록 액션은 인사 관리 리스트뷰에서만 노출한다.
  // 문구는 `{대상 명사} 등록` 규칙을 따른다 — 하는 일은 로그인 계정 발급이지만, 이 화면이
  // 다루는 원장은 임직원이고 다른 목록도 모두 '~ 등록'으로 부른다(구 '계정 생성').
  // 대용량 업로드 버튼은 두지 않는다 — 임직원 등록은 원장 INSERT가 아니라 인증 계정 발급이라
  // CSV 한 장으로 일괄 처리할 경로가 없다.
  // '크게보기'(전체화면)도 두지 않는다 — 집계 열이 빠져 본문 폭에 표가 들어오므로 볼 이유가 없다.
  const actions =
    tab === 'hr' ? (
      <Button onClick={() => navigate('/management/hr/new')}>임직원 등록</Button>
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
      {tab === 'attendance' && <AttendancePanel />}
      {tab === 'assets' && <AssetsPanel />}
      {tab === 'finance' && <FinancePanel />}
      {/* 거래처 원장: 지급 상대(코드·상호·구분·등록번호·계좌·증빙)의 단일 세팅 지점.
          NETWORKS 외주/거래 마스터와는 다른 원장이다 — 저쪽은 누구와 일하는가, 여기는
          누구에게 어느 계좌로 보내는가를 담는다. */}
      {tab === 'partners' && <PartnersPanel />}
      {/* 결재 금액 집계: 승인된 결재 문서의 금액을 항목·문서·월로 모은다. 결재 자체는 OFFICE가
          담당하고, 그 돈을 집계해 읽는 일은 재무 관리와 같은 축이라 여기가 자리다. */}
      {tab === 'approval-stats' && <ApprovalAggregatePanel />}
      {tab === 'kpi' && <KpiPanel />}
      {/* 모르는 탭(이관된 직책·직급·호봉의 옛 링크 포함)은 이 워크스페이스의 첫 화면으로 받는다. */}
      {(tab === 'dashboard' || !HEADINGS[tab]) && <DashboardPanel />}
    </div>
  )
}
