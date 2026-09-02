import { MODULE_STATUS_BAR_CLASS, MODULE_STATUS_LABEL, MODULE_STATUS_TONE } from '@ynarcher/master-data'
import type { BadgeTone } from '@ynarcher/ui'
import {
  Link as LinkIcon,
  Megaphone,
  Paperclip,
  PenLine,
  type LucideIcon,
} from 'lucide-react'

/** 모듈 카드 표시 메타(아이콘·기본 설명·진입 방식). 라벨은 `@ynarcher/master-data`가 원천. */
export interface ModuleMeta {
  icon: LucideIcon
  /** 템플릿 선택 화면 타일·설명 패널에 노출할 이모지. */
  emoji: string
  /** 메모 미입력 시 카드에 노출할 기본 설명(한 줄). */
  description: string
  /** 템플릿 선택 화면의 설명 패널에 노출할 상세 안내(여러 문장). */
  detail: string
  /**
   * 카드 클릭 시 이동할 상세 페이지 탭 키. 모든 템플릿이 전체 화면으로 진입한다.
   * (2026-09-01 URL첨부·파일첨부의 모달 진입 폐지 — WORKS와 GUEST가 같은 화면 구성을
   * 공유하고 편집 가능 여부만 다르도록, 작성하는 자리도 같은 골격의 페이지로 통일했다.)
   */
  tab: string
}

/**
 * 모듈 카드 표시 메타.
 *
 * 2026-09-03 — 정형 운영 모듈 7종(서면·대면평가, OT, 멘토링, 매칭, 데모데이, 성과)을
 * 걷고 네 종류만 남겼다. 그 7종은 세부 기능이 기획 협의 없이 구현된 것이라 처음부터
 * 다시 설계하며, 원장·화면과 함께 여기서도 자리를 비운다.
 */
export const MODULE_META: Record<string, ModuleMeta> = {
  RECRUITMENT: {
    icon: Megaphone,
    emoji: '📢',
    description: '신청서 폼 구성과 지원 접수를 관리합니다.',
    detail:
      '공개 랜딩페이지 기반의 참여 기업 모집을 운영합니다. 신청서 폼을 직접 구성하고, 공개 URL로 지원을 접수하며, 접수된 신청 내역과 첨부서류를 한곳에서 검토합니다.',
    tab: 'recruitment',
  },
  POST: {
    icon: PenLine,
    emoji: '📝',
    description: '게시판처럼 글을 쓰고 읽고 고칩니다.',
    detail:
      '회의록·활동 기록·공지 등 사업 운영 중 남길 글을 게시판처럼 관리합니다. 리치텍스트 에디터로 작성하고, 목록에서 골라 읽거나 언제든 수정할 수 있습니다. 무엇을 넣을지 정하지 못했다면 이 템플릿으로 시작하세요.',
    tab: 'post',
  },
  LINK: {
    icon: LinkIcon,
    emoji: '🔗',
    description: '관련 링크를 모아 두고 눌러서 엽니다.',
    detail:
      '설문 폼·외부 자료·협업 문서 등 사업과 관련된 주소를 여러 개 모아 둡니다. 각 링크에 설명을 달아 두면, 모듈을 누를 때 어디로 갈지 고르는 버튼 목록이 바로 열립니다.',
    tab: 'link',
  },
  FILE: {
    icon: Paperclip,
    emoji: '📎',
    description: '파일을 모아 두고 미리보기·다운로드합니다.',
    detail:
      '양식·산출물 등 나눠 줄 파일을 여러 개 올려 둡니다. 모듈을 누르면 파일 목록이 열려 바로 미리보기하거나 내려받을 수 있습니다. 여기 올린 파일은 이 사업의 자료 관리에도 같은 파일로 나타납니다.',
    tab: 'file',
  },
}

/** 상태 라벨·톤은 공통 어휘(master-data)가 소유하고, 여기서는 배지가 쓸 한 벌로 묶기만 한다. */
export const MODULE_STATUS_META: Record<string, { label: string; tone: BadgeTone }> =
  Object.fromEntries(
    Object.entries(MODULE_STATUS_LABEL).map(([key, label]) => [
      key,
      { label, tone: MODULE_STATUS_TONE[key] ?? 'neutral' },
    ]),
  )

const FALLBACK_STATUS = { label: '준비', tone: 'neutral' as BadgeTone }

/** 상태 메타 안전 조회(미지의 상태값은 준비로 표시). */
export function moduleStatusMeta(status: string): { label: string; tone: BadgeTone } {
  return MODULE_STATUS_META[status] ?? FALLBACK_STATUS
}

/**
 * 캘린더 기간 바 색상(모듈 상태별) — 값은 공통 어휘가 소유한다. GUEST 일정안내가 같은 상태를
 * 같은 색으로 그려야 하므로 표를 앱에 두면 한쪽만 고치는 날 두 화면의 색이 갈린다.
 */
export const MODULE_BAR_CLASS = MODULE_STATUS_BAR_CLASS

/**
 * 일정·메모의 읽기 규약은 `@ynarcher/master-data`가 소유한다 — GUEST 사이드바가 같은 행의
 * 같은 값을 읽으므로, 규약이 두 벌이면 한쪽만 고치는 날 두 화면의 일정이 갈린다.
 */
export { readModuleSettings, formatModulePeriod } from '@ynarcher/master-data'
export type { ModuleSettings } from '@ynarcher/master-data'
