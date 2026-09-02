/**
 * @ynarcher/ui — 순수 UI 레이어 공개 API.
 *
 * 디자인 토큰 기반 Atom/레이아웃 컴포넌트만 export 합니다.
 * 데이터 결합(@supabase/supabase-js, @tanstack/react-query 등)은 금지합니다.
 */
export const UI_PACKAGE_NAME = '@ynarcher/ui'

// utils
export { cn } from './utils/cn'

// 밀도 맥락 — 모든 컴포넌트 크기의 단일 축(일반 UI / 카드섹션 / 데이터 테이블)
export { DensityProvider, useDensity, byDensity } from './density'
export type { Density } from './density'
// 글자 위계 규격 — 앱이 카드·표 안에서 같은 규격을 재선언하지 않도록 열어 둔다.
// 치수 스케일(controlScale 등)은 컴포넌트가 쓰는 내부 매핑이므로 계속 닫아 둔다.
//
// `tableText`·`tableGrid`·`columnWidth`는 **카드 안에 든 표**의 값이다. 페이지에 바로 놓인 표는
// 한 단 큰 규격을 쓰지만(2026-08-20), 그 자리는 `DataTable`이 스스로 알아 고르므로 화면이 고를
// 일이 없다 — 화면이 쓰는 자리는 밀도 맥락을 내려받지 못하는 수제 목록뿐이고 그것들은 전부
// 카드 안에 있다. 자리별 두 벌이 필요한 곳은 `DataTable` 내부이며 그 스케일은 닫아 둔다.
export { cardText, tableText, formText } from './densityScale'
// 툴팁 규격 — 안내 문구가 사는 자리의 값. 말풍선은 `Tooltip`이 그리므로 화면이 쓰는 것은
// 도움말 표식을 자기 트리거로 감쌀 때의 간격(`gap`)뿐이다.
export { tooltipScale } from './densityScale'
// 단 전체(`tableTextScale`)는 2026-08-26에 열었다. 전자결재 문서는 카드 안에 들었지만 카드가
// 말하는 주제의 **부속이 아니라 그 자체가 읽을거리**(종이 결재 양식)라 카드 단(12px)이 아닌
// 페이지 단(14px)을 쓴다. 다만 화면이 단을 직접 고르면 자리마다 크기가 갈리므로, 고르는 일은
// 도메인별로 한 곳에서만 한다(전자결재는 `features/approval/config.ts`의 `approvalText`).
export { tableTextScale } from './densityScale'
export type { TableStage, TableTextSet } from './densityScale'
// 열 폭 스케일 — 컬럼 정의(화면 코드)가 직접 고르는 값이라 열어 둔다.
// 폭을 감으로 붙이지 않게 하는 것이 목적이므로 `w-24` 같은 원시 값을 대신 쓰지 않는다.
export { columnWidth } from './densityScale'
// 표 격자(행 높이·셀 좌우 여백) — 카드 안 소형 표처럼 `DataTable`을 거치지 않는 표가 격자를
// 자체 값으로 재선언하지 않도록 열어 둔다. 재선언하면 같은 화면에서 행 높이와 여백이 갈린다.
export { tableGrid } from './densityScale'

// 기초 컴포넌트
export { Button } from './components/Button'
export type { ButtonProps, ButtonVariant } from './components/Button'
export { Input } from './components/Input'
export type { InputProps } from './components/Input'
export { TextArea } from './components/TextArea'
export type { TextAreaProps } from './components/TextArea'
export { Field } from './components/Field'
export type { FieldProps } from './components/Field'
export { Select } from './components/Select'
export type { SelectProps } from './components/Select'
export { Checkbox } from './components/Checkbox'
export type { CheckboxProps } from './components/Checkbox'
export { Radio } from './components/Radio'
export type { RadioProps } from './components/Radio'
export { Switch } from './components/Switch'
export type { SwitchProps } from './components/Switch'
export { Avatar } from './components/Avatar'
export type { AvatarProps } from './components/Avatar'
export { Badge, badgeToneBorder, badgeToneFill, badgeToneText } from './components/Badge'
export type { BadgeTone } from './components/Badge'
// 빈 값 표기 — 값 없는 칸의 글자(`-`)와 색을 한곳에 모아 둔다.
export { EmptyValue } from './components/EmptyValue'
export { TagChip } from './components/TagChip'
export type { TagChipProps } from './components/TagChip'
export { SegmentedToggle } from './components/SegmentedToggle'
export type { SegmentedOption, SegmentedToggleProps } from './components/SegmentedToggle'
export { Card } from './components/Card'
export type { CardProps } from './components/Card'
export { CardShell } from './components/CardShell'
export type { CardShellProps } from './components/CardShell'
// 제목 옆 건수(`[3]`)의 소유자 — 카드 밖 소제목 줄에서도 같은 규격을 쓰도록 열어 둔다.
export { CardHeading } from './components/CardHeading'
export type { CardHeadingProps } from './components/CardHeading'
export { Tabs } from './components/Tabs'
export type { TabItem, TabsProps } from './components/Tabs'
export { IconButton } from './components/IconButton'
export type { IconButtonProps, IconButtonVariant } from './components/IconButton'
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
export type { Column, ColumnType, DataTableProps, DataTableMeta } from './components/DataTable'
// 셀 규격 — 종류(`ColumnType`)가 폭을 정하고, 그 폭 안에서 값을 어떻게 세우는지는 이 둘이 정한다.
// 화면이 두 줄 접기나 태그 나열을 직접 조립하면 표마다 규격이 갈린다.
export { PeriodCell } from './components/PeriodCell'
export type { PeriodCellProps } from './components/PeriodCell'
export { TagCell } from './components/TagCell'
export type { TagCellProps } from './components/TagCell'
export { PersonCell } from './components/PersonCell'
export type { PersonCellProps } from './components/PersonCell'
// 머리글 규격 — 단위는 값이 아니라 열 이름 옆에 12px로 병기한다.
export { ColumnUnit } from './components/ColumnUnit'
export type { ColumnUnitProps } from './components/ColumnUnit'
export { pinMark } from './components/pinMark'
export { Pagination } from './components/Pagination'

// 오버레이
export { Modal } from './components/Modal'
export type { ModalSize } from './components/Modal'
export { Drawer } from './components/Drawer'
export { SlideOver } from './patterns/SlideOver'
export type { SlideOverProps } from './patterns/SlideOver'
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
export { MiniPager, usePaged } from './patterns/MiniPager'
export { PanelCard } from './patterns/PanelCard'
export type { PanelCardProps } from './patterns/PanelCard'
// 설정 한 줄(제목·설명 + 오른쪽 토글)의 소유자.
export { SettingRow } from './patterns/SettingRow'
export type { SettingRowProps } from './patterns/SettingRow'
export { DetailTopBar } from './patterns/DetailTopBar'
export type { DetailTopBarProps } from './patterns/DetailTopBar'
export { StatStrip } from './patterns/StatStrip'
export type { StripTile, StatStripProps } from './patterns/StatStrip'
export { SummaryTile } from './patterns/SummaryTile'
export type { SummaryTileMetric, SummaryTileProps, SummaryTileTone } from './patterns/SummaryTile'
export { ListToolbar } from './patterns/ListToolbar'
export type { ListToolbarProps } from './patterns/ListToolbar'
export { FilterButton, FilterResetButton } from './patterns/FilterButton'
export type { FilterButtonProps, FilterResetButtonProps } from './patterns/FilterButton'
export { MultiSelectFilter } from './patterns/MultiSelectFilter'
export type { FilterOption, MultiSelectFilterProps } from './patterns/MultiSelectFilter'
export { TokenMultiSelect } from './patterns/TokenMultiSelect'
export type { TokenMultiSelectProps } from './patterns/TokenMultiSelect'
export { DateRangeFilter } from './patterns/DateRangeFilter'
export type { DateRangeFilterProps } from './patterns/DateRangeFilter'
export { NumberRangeFilter } from './patterns/NumberRangeFilter'
export type { NumberRangeFilterProps } from './patterns/NumberRangeFilter'
export { ViewToggleGroup } from './patterns/ViewToggleGroup'
export type { ViewToggleOption, ViewToggleGroupProps } from './patterns/ViewToggleGroup'
export { FullscreenPanel, ExpandToggleButton } from './patterns/FullscreenPanel'
export type {
  FullscreenPanelProps,
  ExpandToggleButtonProps,
} from './patterns/FullscreenPanel'
export { BoardItemCard, BoardEmptyRow } from './patterns/BoardItemCard'
export type { BoardItemCardProps } from './patterns/BoardItemCard'
// 첨부 파일 1건 행 — WORKS 자료 관리와 GUEST 파일 목록이 같은 표시 규격을 쓴다.
export { AttachmentRow } from './patterns/AttachmentRow'
export type { AttachmentRowProps } from './patterns/AttachmentRow'
export { MonthCalendar, CalendarDayDetail } from './patterns/MonthCalendar'
export type { MonthCalendarProps, CalendarDayMeta } from './patterns/MonthCalendar'
// 간트(기간 막대) 공용 부품 — WORKS 모듈 운영 기간과 WORKS·GUEST 사업 일정안내가 함께 쓴다.
export { GanttChart } from './patterns/GanttChart'
export type { GanttChartProps, GanttRow } from './patterns/GanttChart'
// 공휴일 조회는 간트·캘린더의 음영 판정에 쓰이므로 UI 패키지가 소유한다(두 앱이 함께 읽는다).
export { koreanHolidayName } from './utils/koreanHolidays'
// 일정안내 보드(캘린더·칸반·간트) — WORKS 일정안내 탭과 GUEST 일정안내 메뉴가 함께 쓴다.
export { ScheduleBoard } from './patterns/ScheduleBoard'
export type {
  ScheduleBoardProps,
  ScheduleColumn,
  ScheduleEvent,
  ScheduleView,
} from './patterns/ScheduleBoard'
