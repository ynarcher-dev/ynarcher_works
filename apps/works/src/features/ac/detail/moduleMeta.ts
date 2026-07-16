import type { BadgeTone } from '@ynarcher/ui'
import {
  ChartColumn,
  FileText,
  GraduationCap,
  Handshake,
  Megaphone,
  Presentation,
  Puzzle,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react'

/** 모듈 카드 표시 메타(아이콘·기본 설명·이동 탭). 라벨은 config.ts MODULE_TYPES가 원천. */
export interface ModuleMeta {
  icon: LucideIcon
  /** 메모 미입력 시 카드에 노출할 기본 설명. */
  description: string
  /** 카드 클릭 시 이동할 상세 페이지 탭 키. */
  tab: string
}

export const MODULE_META: Record<string, ModuleMeta> = {
  RECRUITMENT: {
    icon: Megaphone,
    description: '신청서 폼 구성과 지원 접수를 관리합니다.',
    tab: 'recruitment',
  },
  DOC_REVIEW: {
    icon: FileText,
    description: '평가자가 제출 자료를 평가표로 검토합니다.',
    tab: 'docreview',
  },
  ONSITE_EVAL: {
    icon: Presentation,
    description: '발표·인터뷰 일정과 연결된 현장 평가입니다.',
    tab: 'onsite',
  },
  ORIENTATION: {
    icon: GraduationCap,
    description: '오리엔테이션·공통 세션과 출석을 관리합니다.',
    tab: 'orientation',
  },
  MENTORING: {
    icon: Users,
    description: 'N:N 멘토-멘티 매핑과 상담일지를 관리합니다.',
    tab: 'mentoring',
  },
  BUSINESS_MATCHING: {
    icon: Handshake,
    description: '전문가·스타트업 1:1 상담 매칭. 예약·배치·상담일지·출석.',
    tab: 'matching',
  },
  DEMO_DAY: {
    icon: Rocket,
    description: '피칭 세션과 투자자 관심 표시를 운영합니다.',
    tab: 'demoday',
  },
  OUTCOMES: {
    icon: ChartColumn,
    description: '모듈 교차 KPI와 성과 대장을 집계합니다.',
    tab: 'outcomes',
  },
  CUSTOM_ACTIVITY: {
    icon: Puzzle,
    description: '정형 모듈 외 커스텀 활동·회의록·액션아이템.',
    tab: 'custom',
  },
}

/** module_status enum(DRAFT/OPEN/CLOSED/CANCELLED) → 표시 라벨·톤. */
export const MODULE_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: '준비', tone: 'neutral' },
  OPEN: { label: '진행', tone: 'success' },
  CLOSED: { label: '완료', tone: 'info' },
  CANCELLED: { label: '취소', tone: 'danger' },
}

const FALLBACK_STATUS = { label: '준비', tone: 'neutral' as BadgeTone }

/** 상태 메타 안전 조회(미지의 상태값은 준비로 표시). */
export function moduleStatusMeta(status: string): { label: string; tone: BadgeTone } {
  return MODULE_STATUS_META[status] ?? FALLBACK_STATUS
}

/** 캘린더 기간 바 색상(모듈 상태별). Badge 팔레트와 동일 계열. */
export const MODULE_BAR_CLASS: Record<string, string> = {
  DRAFT: 'bg-gray-300',
  OPEN: 'bg-success',
  CLOSED: 'bg-info',
  CANCELLED: 'bg-danger/50',
}

/** program_modules.settings(jsonb)에 담는 운영 설정(일정·메모). */
export interface ModuleSettings {
  start_date?: string
  end_date?: string
  memo?: string
}

/** settings jsonb에서 일정·메모를 방어적으로 읽는다(다른 키는 보존 대상). */
export function readModuleSettings(settings: unknown): ModuleSettings {
  if (!settings || typeof settings !== 'object') return {}
  const rec = settings as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined)
  return {
    start_date: str(rec.start_date),
    end_date: str(rec.end_date),
    memo: str(rec.memo),
  }
}
