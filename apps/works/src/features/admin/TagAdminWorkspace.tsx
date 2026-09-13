import { SidePanelNav, SidePanelNavGroup, SidePanelNavRow } from '@ynarcher/ui'
import { sidebarIconByTab } from '@/app/sidebarIcons'
import { TagAdminPanel } from '@/features/admin/TagAdminPanel'
import {
  ADMIN_TAG_CONFIGS,
  TAG_CONFIG_GROUPS,
  type TagConfig,
} from '@/features/admin/tagConfig'

interface TagAdminWorkspaceProps {
  config: TagConfig
  onSelect: (tab: string) => void
}

/**
 * ADMIN 태그 관리: 태그 종류를 고르는 2차 사이드바 + 선택한 태그 원장.
 *
 * 앱 사이드바에는 `태그 관리` 한 줄만 남긴다. 종류가 늘어날 때마다 1차 내비게이션이 길어지지
 * 않으면서도, 콘텐츠 안에서는 게시판·자료실과 같은 `SidePanelNav` 문법으로 전체 종류를 한눈에
 * 보고 오갈 수 있다. 선택한 종류는 `?tag=`에 실어 새로고침과 공유 링크에서도 유지한다.
 */
export function TagAdminWorkspace({ config, onSelect }: TagAdminWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <SidePanelNav>
        {TAG_CONFIG_GROUPS.map((group) => (
          <SidePanelNavGroup key={group} label={group}>
            {ADMIN_TAG_CONFIGS.filter((item) => item.group === group).map((item) => (
              <SidePanelNavRow
                key={item.tab}
                label={item.menuLabel}
                icon={sidebarIconByTab[item.tab]}
                selected={item.tab === config.tab}
                onClick={() => onSelect(item.tab)}
              />
            ))}
          </SidePanelNavGroup>
        ))}
      </SidePanelNav>

      <div className="min-w-0 flex-1">
        {/* 종류가 바뀌면 입력 초안·정렬·부모 탭 같은 로컬 상태도 새 원장 기준으로 초기화한다. */}
        <TagAdminPanel key={config.tab} config={config} />
      </div>
    </div>
  )
}
