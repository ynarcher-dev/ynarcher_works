/**
 * @ynarcher/ui — 순수 UI 레이어 공개 API.
 *
 * 디자인 토큰 기반 Atom/레이아웃 컴포넌트만 export 합니다.
 * 데이터 결합(@supabase/supabase-js, @tanstack/react-query 등)은 금지합니다.
 */
export const UI_PACKAGE_NAME = '@ynarcher/ui'

// utils
export { cn } from './utils/cn'

// 기초 컴포넌트
export { Button } from './components/Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button'
export { Input } from './components/Input'
export type { InputProps } from './components/Input'
export { TextArea } from './components/TextArea'
export type { TextAreaProps } from './components/TextArea'
export { Select } from './components/Select'
export type { SelectProps } from './components/Select'
export { InlineSelect } from './components/InlineSelect'
export type { InlineSelectProps } from './components/InlineSelect'
export { InlineButton } from './components/InlineButton'
export type { InlineButtonProps, InlineButtonTone } from './components/InlineButton'
export { Checkbox } from './components/Checkbox'
export { Switch } from './components/Switch'
export { Avatar } from './components/Avatar'
export { Badge } from './components/Badge'
export type { BadgeTone, BadgeSize } from './components/Badge'
export { Card } from './components/Card'
export type { CardProps } from './components/Card'
export { Tabs } from './components/Tabs'
export type { TabItem, TabsProps } from './components/Tabs'
export { IconButton } from './components/IconButton'
export type {
  IconButtonProps,
  IconButtonVariant,
  IconButtonSize,
} from './components/IconButton'
export { PhotoBox } from './components/PhotoBox'
export type { PhotoBoxProps, PhotoBoxSize } from './components/PhotoBox'
export { TextAction } from './components/TextAction'
export type { TextActionProps } from './components/TextAction'
export { BackButton } from './components/BackButton'
export type { BackButtonProps } from './components/BackButton'
export { DashedAddButton } from './components/DashedAddButton'
export type { DashedAddButtonProps } from './components/DashedAddButton'

// 데이터 테이블
export { DataTable } from './components/DataTable'
export type { Column, DataTableProps, DataTableMeta } from './components/DataTable'
export { Pagination } from './components/Pagination'

// 오버레이
export { Modal } from './components/Modal'
export type { ModalSize } from './components/Modal'
export { Drawer } from './components/Drawer'
export { Dropdown, DropdownItem } from './components/Dropdown'
export { Tooltip } from './components/Tooltip'
export type { TooltipProps, TooltipSide } from './components/Tooltip'

// 피드백
export { Banner } from './components/Banner'
export type { BannerTone } from './components/Banner'
export { Spinner } from './components/Spinner'
export { Skeleton } from './components/Skeleton'
export { EmptyState } from './components/EmptyState'
export { ToastProvider } from './components/toast/ToastProvider'
export { useToast } from './components/toast/ToastContext'
export type { ToastTone } from './components/toast/ToastContext'

// 레이아웃
export { AppShell } from './layout/AppShell'
export { Sidebar } from './layout/Sidebar'
export { SidebarItem } from './layout/SidebarItem'
export { SidebarDivider } from './layout/SidebarDivider'
export type { SidebarDividerProps } from './layout/SidebarDivider'
export { Topbar } from './layout/Topbar'
export { WorkspaceSwitcher } from './layout/WorkspaceSwitcher'
export type { WorkspaceOption } from './layout/WorkspaceSwitcher'
export { PageHeader } from './layout/PageHeader'
export type { PageHeaderProps } from './layout/PageHeader'

// 화면 패턴(순수 UI 컴포지션) — 상세·목록·보드 화면의 공통 뼈대.
// 데이터 조회는 하지 않고 슬롯(ReactNode)만 배치하므로 워크스페이스 간 재사용이 가능하다.
export { InfoField, InfoGrid } from './patterns/InfoGrid'
export type { InfoFieldProps, InfoGridProps } from './patterns/InfoGrid'
export { EntityHeaderCard, EntityHeaderSection } from './patterns/EntityHeaderCard'
export type {
  EntityHeaderCardProps,
  EntityHeaderSectionProps,
} from './patterns/EntityHeaderCard'
export { PanelCard } from './patterns/PanelCard'
export type { PanelCardProps } from './patterns/PanelCard'
export { DetailTopBar } from './patterns/DetailTopBar'
export type { DetailTopBarProps } from './patterns/DetailTopBar'
export { StatTileGrid, StatTilePlaceholderGrid } from './patterns/StatTileGrid'
export type {
  StatTile,
  StatTileGridProps,
  StatTilePlaceholderGridProps,
} from './patterns/StatTileGrid'
export { ListToolbar } from './patterns/ListToolbar'
export type { ListToolbarProps } from './patterns/ListToolbar'
export { FilterButton, FilterResetButton } from './patterns/FilterButton'
export type { FilterButtonProps, FilterResetButtonProps } from './patterns/FilterButton'
export { MultiSelectFilter } from './patterns/MultiSelectFilter'
export type { FilterOption, MultiSelectFilterProps } from './patterns/MultiSelectFilter'
export { DateRangeFilter } from './patterns/DateRangeFilter'
export type { DateRangeFilterProps } from './patterns/DateRangeFilter'
export { ViewToggleGroup } from './patterns/ViewToggleGroup'
export type { ViewToggleOption, ViewToggleGroupProps } from './patterns/ViewToggleGroup'
export { FullscreenPanel, ExpandToggleButton } from './patterns/FullscreenPanel'
export type {
  FullscreenPanelProps,
  ExpandToggleButtonProps,
} from './patterns/FullscreenPanel'
export { BoardItemCard, BoardEmptyRow } from './patterns/BoardItemCard'
export type { BoardItemCardProps } from './patterns/BoardItemCard'
export { MonthCalendar, CalendarDayDetail } from './patterns/MonthCalendar'
export type { MonthCalendarProps, CalendarDayMeta } from './patterns/MonthCalendar'
