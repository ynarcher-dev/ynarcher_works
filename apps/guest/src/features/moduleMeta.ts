import {
  CalendarDays,
  ChartColumn,
  FileText,
  GraduationCap,
  Handshake,
  Link as LinkIcon,
  Megaphone,
  Paperclip,
  PenLine,
  Presentation,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { BadgeTone } from '@ynarcher/ui'

/**
 * 게스트 화면에서의 모듈 표시 메타 — **아이콘과 톤만** 여기 둔다.
 *
 * 이름·상태 라벨·일정 읽기는 `@ynarcher/master-data`의 공통 어휘가 소유한다. 운영자가 WORKS에서
 * 붙인 이름 그대로가 게스트 메뉴에 서야 하므로, 이름을 이 파일이 다시 정하면 같은 행이 두
 * 화면에서 다른 말을 하게 된다. 아이콘은 반대다 — WORKS 카드의 이모지와 게스트 사이드바의
 * 선 아이콘은 서는 자리가 달라 같을 이유가 없다.
 */
export const MODULE_ICON: Record<string, LucideIcon> = {
  RECRUITMENT: Megaphone,
  DOC_REVIEW: FileText,
  ONSITE_EVAL: Presentation,
  ORIENTATION: GraduationCap,
  MENTORING: Users,
  BUSINESS_MATCHING: Handshake,
  DEMO_DAY: Rocket,
  OUTCOMES: ChartColumn,
  POST: PenLine,
  LINK: LinkIcon,
  FILE: Paperclip,
}

/** 메뉴 아이콘(미지의 템플릿은 일정 아이콘으로 떨어진다 — 모든 모듈은 최소한 기간을 가진다). */
export function moduleIcon(moduleType: string): LucideIcon {
  return MODULE_ICON[moduleType] ?? CalendarDays
}

/** 상태 배지 톤(라벨은 공통 어휘의 moduleStatusLabel). */
export const MODULE_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  OPEN: 'success',
  CLOSED: 'info',
  CANCELLED: 'danger',
}

/**
 * 전용 화면이 없는 템플릿의 안내 문구.
 *
 * 게스트에게 열린 메뉴 중에는 운영자용 화면(평가·성과 집계 등)이 원본인 것이 있다. 그런
 * 메뉴에서 게스트가 받을 수 있는 사실은 **일정과 안내**뿐이므로, 빈 화면 대신 그 사실을
 * 말한다. 운영자가 메모를 적어 두었으면 이 문구 대신 메모가 나간다.
 */
export const MODULE_GUEST_NOTICE: Record<string, string> = {
  RECRUITMENT: '모집 신청은 담당자가 안내한 공개 신청 링크에서 진행합니다.',
  DOC_REVIEW: '서면평가가 진행되는 기간입니다. 결과는 담당자가 별도로 안내합니다.',
  ONSITE_EVAL: '대면평가(발표·인터뷰) 일정입니다. 상세 시간은 담당자가 안내합니다.',
  ORIENTATION: '오리엔테이션·공통 세션 일정입니다.',
  DEMO_DAY: '데모데이 일정입니다. 발표 순서는 담당자가 안내합니다.',
  OUTCOMES: '성과 집계 기간입니다. 제출이 필요한 자료는 담당자가 안내합니다.',
}

/** 안내 문구(메모 우선). 둘 다 없으면 기간만으로 충분한 메뉴다. */
export function moduleNotice(moduleType: string, memo: string | undefined): string | null {
  return memo ?? MODULE_GUEST_NOTICE[moduleType] ?? null
}
