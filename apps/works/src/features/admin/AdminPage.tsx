import { PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { AdminMergePanel } from '@/features/admin/AdminMergePanel'
import { AuditLogMonitor } from '@/features/admin/AuditLogMonitor'
import { BoardAdminPanel } from '@/features/admin/BoardAdminPanel'
import { DownloadLogView } from '@/features/admin/DownloadLogView'
import { PermissionConsole } from '@/features/admin/PermissionConsole'
import { SensitivePanel } from '@/features/admin/SensitivePanel'
import { TagAdminPanel } from '@/features/admin/TagAdminPanel'
import { TAG_CONFIGS } from '@/features/admin/tagConfig'

const HEADINGS: Record<string, string> = {
  permissions: '권한 제어 콘솔',
  boards: '게시판 관리',
  industries: TAG_CONFIGS.industries.heading,
  fields: TAG_CONFIGS.fields.heading,
  categories: TAG_CONFIGS.categories.heading,
  regions: TAG_CONFIGS.regions.heading,
  countries: TAG_CONFIGS.countries.heading,
  sensitive: '민감정보 관리',
  merge: '중복 병합 검증',
  audit: '감사 로그 모니터',
  downloads: '다운로드 사유 로그',
}

/** ADMIN 워크스페이스: 권한 콘솔 / 게시판·태그 관리 / 감사 로그 / 다운로드 로그. 섹션 전환은 사이드바(?tab). */
export function AdminPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'permissions'

  return (
    <div className="space-y-5">
      <PageHeader title={HEADINGS[tab] ?? HEADINGS.permissions} />
      {tab === 'audit' && <AuditLogMonitor />}
      {tab === 'downloads' && <DownloadLogView />}
      {tab === 'boards' && <BoardAdminPanel />}
      {tab === 'industries' && <TagAdminPanel config={TAG_CONFIGS.industries} />}
      {tab === 'fields' && <TagAdminPanel config={TAG_CONFIGS.fields} />}
      {tab === 'categories' && <TagAdminPanel config={TAG_CONFIGS.categories} />}
      {tab === 'regions' && <TagAdminPanel config={TAG_CONFIGS.regions} />}
      {tab === 'countries' && <TagAdminPanel config={TAG_CONFIGS.countries} />}
      {tab === 'sensitive' && <SensitivePanel />}
      {tab === 'merge' && <AdminMergePanel />}
      {tab !== 'audit' &&
        tab !== 'downloads' &&
        tab !== 'boards' &&
        tab !== 'industries' &&
        tab !== 'fields' &&
        tab !== 'categories' &&
        tab !== 'regions' &&
        tab !== 'countries' &&
        tab !== 'sensitive' &&
        tab !== 'merge' && <PermissionConsole />}
    </div>
  )
}
