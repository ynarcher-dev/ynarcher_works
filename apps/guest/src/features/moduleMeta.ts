import {
  CalendarDays,
  Link as LinkIcon,
  Megaphone,
  Paperclip,
  PenLine,
  type LucideIcon,
} from 'lucide-react'

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
  POST: PenLine,
  LINK: LinkIcon,
  FILE: Paperclip,
}

/** 메뉴 아이콘(미지의 템플릿은 일정 아이콘으로 떨어진다 — 모든 모듈은 최소한 기간을 가진다). */
export function moduleIcon(moduleType: string): LucideIcon {
  return MODULE_ICON[moduleType] ?? CalendarDays
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
}

/** 안내 문구(메모 우선). 둘 다 없으면 기간만으로 충분한 메뉴다. */
export function moduleNotice(moduleType: string, memo: string | undefined): string | null {
  return memo ?? MODULE_GUEST_NOTICE[moduleType] ?? null
}

/**
 * 내용이 열리지 않는 상태 — 준비(DRAFT)와 취소(CANCELLED).
 *
 * 메뉴 줄은 사이드바에 그대로 서고 배지가 '준비'·'취소'라 말하지만 **몸통은 열지 않는다.**
 * 아직 확정되지 않은 자료나 없던 일이 된 자료를 참여자가 먼저 받아 가면, 나중에 바뀐
 * 내용과 어긋난 채로 일이 진행된다. 완료(CLOSED)는 닫지 않는다 — 끝난 메뉴의 자료를
 * 되돌아보는 것은 정당한 용도다.
 *
 * 판정은 화면 혼자 하지 않는다 — RLS의 `app.guest_open_module_ids()`가 같은 규칙으로
 * 글·링크·파일·매칭·멘토링을 내주지 않는다. 여기 있는 것은 그 사실을 참여자에게 말해 주는
 * 안내일 뿐이며, 이 함수를 고칠 때는 그 함수도 함께 고쳐야 한다.
 */
const LOCKED_MODULE_STATUS = ['DRAFT', 'CANCELLED']

/** 이 메뉴는 머리(이름·안내·기간)만 서고 몸통은 잠긴다. */
export function isModuleLocked(status: string | null | undefined): boolean {
  return LOCKED_MODULE_STATUS.includes(status ?? 'DRAFT')
}
