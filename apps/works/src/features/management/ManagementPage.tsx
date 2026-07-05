import { PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { ApprovalPanel } from '@/features/management/panels/ApprovalPanel'
import { AssetsPanel } from '@/features/management/panels/AssetsPanel'
import { FinancePanel } from '@/features/management/panels/FinancePanel'
import { HrPanel } from '@/features/management/panels/HrPanel'

const HEADINGS: Record<string, string> = {
  approval: '전자결재',
  hr: '인사 관리',
  finance: '재무·KPI',
  assets: '자산 관리',
}

/** MANAGEMENT 워크스페이스: 전자결재 / 인사 / 재무·KPI / 자산. 섹션 전환은 사이드바(?tab). */
export function ManagementPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'approval'

  return (
    <div className="space-y-5">
      <PageHeader title={HEADINGS[tab] ?? HEADINGS.approval} />
      {tab === 'hr' && <HrPanel />}
      {tab === 'finance' && <FinancePanel />}
      {tab === 'assets' && <AssetsPanel />}
      {tab !== 'hr' && tab !== 'finance' && tab !== 'assets' && <ApprovalPanel />}
    </div>
  )
}
