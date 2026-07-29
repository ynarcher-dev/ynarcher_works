import { PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { AdminMergePanel } from '@/features/admin/AdminMergePanel'
import { AuditLogMonitor } from '@/features/admin/AuditLogMonitor'
import { BoardAdminPanel } from '@/features/admin/BoardAdminPanel'
import { DownloadLogView } from '@/features/admin/DownloadLogView'
import { MeetingRoomAdminPanel } from '@/features/admin/MeetingRoomAdminPanel'
import { PermissionConsole } from '@/features/admin/PermissionConsole'
import { SensitivePanel } from '@/features/admin/SensitivePanel'
import { TagAdminPanel } from '@/features/admin/TagAdminPanel'
import { tagConfigOf } from '@/features/admin/tagConfig'

const HEADINGS: Record<string, string> = {
  permissions: '권한 제어 콘솔',
  boards: '게시판 관리',
  rooms: '회의실 관리',
  sensitive: '민감정보 관리',
  merge: '중복 병합 검증',
  audit: '감사 로그 모니터',
  downloads: '다운로드 사유 로그',
}

/** 태그 관리를 제외한 전용 패널 탭들. 이 중 어디에도 없으면 권한 콘솔(기본)로 폴백한다. */
const NON_TAG_TABS = new Set(['audit', 'downloads', 'boards', 'rooms', 'sensitive', 'merge'])

/**
 * ADMIN 워크스페이스: 권한 콘솔 / 게시판·회의실 / 태그 관리 / 감사·다운로드 로그.
 * 섹션 전환은 사이드바(?tab)이며, 태그 탭은 TAG_CONFIGS(owner: 'admin')에서 파생된다 —
 * 항목을 추가하면 메뉴·헤딩·패널이 함께 따라온다. 지사 관리는 MANAGEMENT가 소유한다.
 */
export function AdminPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'permissions'
  const tagConfig = tagConfigOf('admin', tab)

  return (
    <div className="space-y-5">
      <PageHeader title={tagConfig?.heading ?? HEADINGS[tab] ?? HEADINGS.permissions} />
      {tab === 'audit' && <AuditLogMonitor />}
      {tab === 'downloads' && <DownloadLogView />}
      {tab === 'boards' && <BoardAdminPanel />}
      {tab === 'rooms' && <MeetingRoomAdminPanel />}
      {tagConfig && <TagAdminPanel config={tagConfig} />}
      {tab === 'sensitive' && <SensitivePanel />}
      {tab === 'merge' && <AdminMergePanel />}
      {!NON_TAG_TABS.has(tab) && !tagConfig && <PermissionConsole />}
    </div>
  )
}
