import {
  Bell,
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  FolderOpen,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Newspaper,
  Pin,
  ShieldCheck,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface BoardIconOption {
  key: string
  label: string
  Icon: LucideIcon
}

/** 게시판 생성 시 선택 가능한 아이콘 목록. */
export const BOARD_ICON_OPTIONS: BoardIconOption[] = [
  { key: 'clipboard', label: '기본', Icon: ClipboardList },
  { key: 'megaphone', label: '공지', Icon: Megaphone },
  { key: 'folder', label: '자료', Icon: FolderOpen },
  { key: 'lightbulb', label: '인사이트', Icon: Lightbulb },
  { key: 'bell', label: '알림', Icon: Bell },
  { key: 'file', label: '문서', Icon: FileText },
  { key: 'news', label: '뉴스', Icon: Newspaper },
  { key: 'book', label: '가이드', Icon: BookOpen },
  { key: 'message', label: '토론', Icon: MessageSquare },
  { key: 'calendar', label: '일정', Icon: Calendar },
  { key: 'pin', label: '고정', Icon: Pin },
  { key: 'shield', label: '보안', Icon: ShieldCheck },
  { key: 'star', label: '중요', Icon: Star },
  { key: 'users', label: '팀', Icon: Users },
]

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  BOARD_ICON_OPTIONS.map((o) => [o.key, o.Icon]),
)

export const DEFAULT_BOARD_ICON = 'clipboard'

/** 아이콘 키 → 컴포넌트. 미지정/미매칭 시 기본 아이콘. */
export function boardIcon(key?: string): LucideIcon {
  return (key ? ICON_MAP[key] : undefined) ?? ClipboardList
}
