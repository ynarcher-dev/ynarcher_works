import { hasWorkspaceRead } from '@/auth/authStore'
import type { AuthUser } from '@/auth/types'
import { WORKSPACE_SUBNAV, type SubNavGroup, type SubNavItem } from '@/config/navigation'
import { WORKSPACES, type WorkspaceNavItem, type WorkspaceSection } from '@/config/workspaces'

/**
 * 사이드바 구성 계산(순수 함수).
 *
 * 스위처 항목 하나가 권한 구획 여럿을 덮을 수 있으므로(`WorkspaceNavItem.sections`), 사이드바
 * 한 줄은 자기가 속한 구획을 알아야 한다 — 어느 경로로 가고, 어느 키로 노출이 갈리며, 어느
 * 글리프를 쓰는지가 전부 그 구획이 답한다. 그 짝을 `BoundNavItem`이 들고 다닌다.
 */
export interface BoundNavItem {
  item: SubNavItem
  section: WorkspaceSection
}

export interface BoundNavGroup {
  group?: string
  items: BoundNavItem[]
  /** 사이드바 스크롤 영역이 아니라 그 아래 고정 영역에 서는 그룹(`SubNavItem.pinBottom`). */
  pinned?: boolean
}

/** 사용자가 읽을 수 있는 구획만 남긴다. */
export function readableSections(
  user: AuthUser | null,
  ws: WorkspaceNavItem,
): WorkspaceSection[] {
  return ws.sections.filter((s) => hasWorkspaceRead(user, s.key))
}

/** 스위처에 노출할 항목 — 덮는 구획 중 하나라도 읽을 수 있으면 선다. */
export function visibleWorkspaces(user: AuthUser | null): WorkspaceNavItem[] {
  return WORKSPACES.filter((w) => readableSections(user, w).length > 0)
}

/** 스위처에서 이 항목을 골랐을 때 도착할 경로(읽을 수 있는 첫 구획). */
export function landingPath(user: AuthUser | null, ws: WorkspaceNavItem): string | undefined {
  return readableSections(user, ws)[0]?.path
}

/**
 * 현재 경로가 서 있는 스위처 항목과 그 안의 구획.
 *
 * 구획까지 함께 돌려주는 이유는 경로·글리프·활성 판정이 항목이 아니라 구획 단위이기 때문이다.
 * 미매칭 시 첫 노출 항목의 첫 구획으로 폴백한다(종전 동작과 같다).
 */
export function resolveWorkspace(
  pathname: string,
  visible: WorkspaceNavItem[],
  user: AuthUser | null,
): { ws?: WorkspaceNavItem; section?: WorkspaceSection } {
  for (const w of visible) {
    const hit = readableSections(user, w).find((s) => pathname.startsWith(s.path))
    if (hit) return { ws: w, section: hit }
  }
  const ws = visible[0]
  return { ws, section: ws ? readableSections(user, ws)[0] : undefined }
}

/**
 * 사이드바 그룹 구성. 구획마다 자기 서브내비를 가져와 줄에 구획을 묶는다.
 *
 * 구획을 둘 이상 덮는 항목의 줄들은 한 그룹에 나란히 선다 — 같은 층의 원장들이라, 사이에
 * 선을 그으면 한 벌이 서로 다른 층의 메뉴로 보인다(DATABASE의 스타트업·네트워크, BUSINESS의
 * 사업 3종·펀드). 구획 하나짜리 항목은 자기 서브내비의 그룹 구성을 그대로 쓴다(종전과 같다).
 *
 * `pinBottom` 줄만은 어느 쪽이든 목록에서 빼내 마지막 그룹(`pinned`)으로 세운다 — 그 줄은
 * 목록의 항목이 아니라 그 아래 별도 자리이고, 셸이 사이드바 하단 고정 영역에 그린다.
 */
export function buildNavGroups(user: AuthUser | null, ws: WorkspaceNavItem): BoundNavGroup[] {
  const sections = readableSections(user, ws)
  const first = sections[0]
  if (!first) return []

  const built: BoundNavGroup[] =
    sections.length === 1
      ? (WORKSPACE_SUBNAV[first.key] ?? []).map((g) => ({
          group: g.group,
          items: g.items.map((item) => ({ item, section: first })),
        }))
      : [
          {
            items: sections.flatMap((section) =>
              (WORKSPACE_SUBNAV[section.key] ?? []).flatMap((g) =>
                g.items.map((item) => ({ item, section })),
              ),
            ),
          },
        ]

  const pinned = built.flatMap((g) => g.items.filter((b) => b.item.pinBottom))
  if (!pinned.length) return built
  const rest = built
    .map((g) => ({ ...g, items: g.items.filter((b) => !b.item.pinBottom) }))
    .filter((g) => g.items.length)
  return [...rest, { items: pinned, pinned: true }]
}

/** 탭 헬퍼(`firstTab`·`allTabs`·`pathTabOf`)에 넘길 순수 그룹 목록. */
export function plainGroups(groups: BoundNavGroup[]): SubNavGroup[] {
  return groups.map((g) => ({ group: g.group, items: g.items.map((b) => b.item) }))
}
