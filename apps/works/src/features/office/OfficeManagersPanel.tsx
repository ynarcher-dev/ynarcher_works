import { Input, PageHeader } from '@ynarcher/ui'
import { useState } from 'react'
import { EmployeeDirectory } from '@/features/management/EmployeeDirectory'

/**
 * OFFICE 임직원 정보(조회 전용). 인사 관리(MANAGEMENT)와 동일한 임직원 데이터·테이블 구조를
 * 재사용하되, 수정/비활성화 없이 조회만 제공한다. 행 클릭 시 OFFICE 상세(읽기 전용)로 이동한다.
 * 데이터 원장은 MANAGEMENT이며, 여기서는 정보 확인 용도로만 노출한다.
 */
export function OfficeManagersPanel() {
  const [keyword, setKeyword] = useState('')

  return (
    <div className="space-y-5">
      <PageHeader
        title="임직원 정보"
        search={
          <Input
            placeholder="임직원 이름 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />
      <EmployeeDirectory keyword={keyword} readOnly detailBasePath="/office/managers" />
    </div>
  )
}
