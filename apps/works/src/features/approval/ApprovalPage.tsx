import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ApprovalTable } from './ApprovalTable'

/** 페이지 골격만 있는 준비 중 메뉴(탭 → 제목). */
const TITLES: Record<string, string> = {
  approval: '전자결재',
  clients: '거래처 정보',
}

/**
 * 전자결재 워크스페이스: OFFICE에서 분리한 전자결재·거래처 정보.
 * 좌측 사이드바(?tab)로 섹션을 전환하며, 현재는 페이지 골격만 제공한다(세부 기능은 후속 작업).
 */
export function ApprovalPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab')

  // 탭 미지정 시 전자결재로 정규화(사이드바 활성 상태와 URL 동기화).
  if (!tab) return <Navigate to="/approval?tab=approval" replace />

  const title = TITLES[tab] ?? '전자결재'
  return (
    <div className="space-y-5">
      <PageHeader title={title} />
      {tab === 'approval' ? (
        <ApprovalTable />
      ) : (
        <p className="rounded border border-dashed border-gray-300 py-10 text-center text-body text-gray-400">
          {title} 화면은 준비 중입니다.
        </p>
      )}
    </div>
  )
}
