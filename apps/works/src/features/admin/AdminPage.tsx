import { PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { AuditLogMonitor } from '@/features/admin/AuditLogMonitor'
import { DownloadLogView } from '@/features/admin/DownloadLogView'
import { PermissionConsole } from '@/features/admin/PermissionConsole'

const HEADINGS: Record<string, string> = {
  permissions: '권한 제어 콘솔',
  audit: '감사 로그 모니터',
  downloads: '다운로드 사유 로그',
}

/** ADMIN 워크스페이스: 권한 콘솔 / 감사 로그 / 다운로드 로그. 섹션 전환은 사이드바(?tab). */
export function AdminPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'permissions'

  return (
    <div className="space-y-5">
      <PageHeader title={HEADINGS[tab] ?? HEADINGS.permissions} />
      {tab === 'audit' && <AuditLogMonitor />}
      {tab === 'downloads' && <DownloadLogView />}
      {tab !== 'audit' && tab !== 'downloads' && <PermissionConsole />}
    </div>
  )
}
