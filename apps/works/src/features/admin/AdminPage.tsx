import { PageHeader } from '@ynarcher/ui'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AdminMergePanel } from '@/features/admin/AdminMergePanel'
import { ApprovalFormAdminPanel } from '@/features/admin/ApprovalFormAdminPanel'
import { AuditLogMonitor } from '@/features/admin/AuditLogMonitor'
import { BoardAdminPanel } from '@/features/admin/BoardAdminPanel'
import { CreatorTransferPanel } from '@/features/admin/CreatorTransferPanel'
import { DownloadLogView } from '@/features/admin/DownloadLogView'
import { MeetingRoomAdminPanel } from '@/features/admin/MeetingRoomAdminPanel'
import { ModuleAdminPanel } from '@/features/admin/ModuleAdminPanel'
import { PermissionConsole } from '@/features/admin/PermissionConsole'
import { SensitivePanel } from '@/features/admin/SensitivePanel'
import { TagAdminWorkspace } from '@/features/admin/TagAdminWorkspace'
import { DEFAULT_TAG_CONFIG, tagConfigOf } from '@/features/admin/tagConfig'

const HEADINGS: Record<string, string> = {
  permissions: '권한 제어 콘솔',
  boards: '게시판 관리',
  rooms: '회의실 관리',
  'approval-forms': '결재 양식 관리',
  modules: '모듈 관리',
  tags: '태그 관리',
  sensitive: '민감정보 관리',
  merge: '중복 병합 검증',
  creators: '생성자 교체',
  audit: '감사 로그 모니터',
  downloads: '다운로드 사유 로그',
}

/** ADMIN 1차 사이드바가 직접 소유하는 탭들. 이 중 어디에도 없으면 권한 콘솔로 폴백한다. */
const PRIMARY_TABS = new Set([
  'audit',
  'downloads',
  'boards',
  'rooms',
  'approval-forms',
  'modules',
  'tags',
  'sensitive',
  'merge',
  'creators',
])

/**
 * ADMIN 워크스페이스: 권한·보안 / 운영 설정 / 기준정보 / 데이터 관리 / 감사·로그.
 * 섹션 전환은 그룹명이 붙은 앱 사이드바 메뉴(?tab)이며, 태그 종류는 콘텐츠 안쪽 2차
 * 사이드바(?tag)에서 고른다. 목록은 TAG_CONFIGS에서 파생되어 항목을 추가하면 메뉴·헤딩·패널이
 * 함께 따라온다. 인사 기준정보(직책·직급·호봉)도 여기서 관리하며,
 * 지사 관리는 조직 축이라 MANAGEMENT가 소유한다.
 */
export function AdminPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'permissions'
  const legacyTagConfig = tagConfigOf(tab)
  const selectedTagConfig = tagConfigOf(params.get('tag') ?? '') ?? DEFAULT_TAG_CONFIG

  if (tab === 'guest-accounts') return <Navigate to="/guest-accounts" replace />
  // 종전 플라이아웃의 태그별 URL은 새 단일 진입점으로 정규화한다. 북마크는 버리지 않는다.
  if (legacyTagConfig) {
    return <Navigate to={`/admin?tab=tags&tag=${legacyTagConfig.tab}`} replace />
  }

  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        title={tab === 'tags' ? selectedTagConfig.heading : HEADINGS[tab] ?? HEADINGS.permissions}
      />
      {tab === 'audit' && <AuditLogMonitor />}
      {tab === 'downloads' && <DownloadLogView />}
      {tab === 'boards' && <BoardAdminPanel />}
      {tab === 'rooms' && <MeetingRoomAdminPanel />}
      {tab === 'approval-forms' && <ApprovalFormAdminPanel />}
      {tab === 'modules' && <ModuleAdminPanel />}
      {tab === 'tags' && (
        <TagAdminWorkspace
          config={selectedTagConfig}
          onSelect={(tag) => navigate(`/admin?tab=tags&tag=${tag}`)}
        />
      )}
      {tab === 'sensitive' && <SensitivePanel />}
      {tab === 'merge' && <AdminMergePanel />}
      {tab === 'creators' && <CreatorTransferPanel />}
      {!PRIMARY_TABS.has(tab) && <PermissionConsole />}
    </div>
  )
}
