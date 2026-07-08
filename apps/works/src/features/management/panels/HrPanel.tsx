import { EmployeeDirectory } from '@/features/management/EmployeeDirectory'

interface HrPanelProps {
  /** 상위(ManagementPage) PageHeader 검색 슬롯에서 내려오는 이름 검색어. */
  keyword: string
}

/** 인사 관리(임직원 풀). 목록 리스트뷰는 독립 컴포넌트 EmployeeDirectory가 담당한다. */
export function HrPanel({ keyword }: HrPanelProps) {
  return <EmployeeDirectory keyword={keyword} />
}
