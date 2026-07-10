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
  investment_stages: TAG_CONFIGS.investmentStages.heading,
  company_categories: TAG_CONFIGS.companyCategories.heading,
  company_statuses: TAG_CONFIGS.companyStatuses.heading,
  sensitive: '민감정보 관리',
  merge: '중복 병합 검증',
  audit: '감사 로그 모니터',
  downloads: '다운로드 사유 로그',
}

/** 태그 관리 탭(?tab) → 설정. TAG_CONFIGS에 항목을 추가하면 라우팅·헤딩이 자동 반영된다. */
const TAG_CONFIG_BY_TAB = Object.fromEntries(
  Object.values(TAG_CONFIGS).map((c) => [c.tab, c]),
)

/** 태그 관리를 제외한 전용 패널 탭들. 이 중 어디에도 없으면 권한 콘솔(기본)로 폴백한다. */
const NON_TAG_TABS = new Set(['audit', 'downloads', 'boards', 'sensitive', 'merge'])

/** ADMIN 워크스페이스: 권한 콘솔 / 게시판·태그 관리 / 감사 로그 / 다운로드 로그. 섹션 전환은 사이드바(?tab). */
export function AdminPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'permissions'
  const tagConfig = TAG_CONFIG_BY_TAB[tab]

  return (
    <div className="space-y-5">
      <PageHeader title={HEADINGS[tab] ?? HEADINGS.permissions} />
      {tab === 'audit' && <AuditLogMonitor />}
      {tab === 'downloads' && <DownloadLogView />}
      {tab === 'boards' && <BoardAdminPanel />}
      {tagConfig && <TagAdminPanel config={tagConfig} />}
      {tab === 'sensitive' && <SensitivePanel />}
      {tab === 'merge' && <AdminMergePanel />}
      {!NON_TAG_TABS.has(tab) && !tagConfig && <PermissionConsole />}
    </div>
  )
}
