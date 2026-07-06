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
export { Checkbox } from './components/Checkbox'
export { Switch } from './components/Switch'
export { Avatar } from './components/Avatar'
export { Badge } from './components/Badge'
export type { BadgeTone, BadgeSize } from './components/Badge'

// 데이터 테이블
export { DataTable } from './components/DataTable'
export type { Column, DataTableProps, DataTableMeta } from './components/DataTable'
export { Pagination } from './components/Pagination'

// 오버레이
export { Modal } from './components/Modal'
export type { ModalSize } from './components/Modal'
export { Drawer } from './components/Drawer'
export { Dropdown, DropdownItem } from './components/Dropdown'

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
