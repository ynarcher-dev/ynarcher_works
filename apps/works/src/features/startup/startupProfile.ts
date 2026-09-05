import type { EntityRow } from '@/features/master/entityHooks'

/**
 * 역량 밴드(비즈니스·제품기술·팀조직·지식재산) 4종의 저장 규약과 읽기.
 *
 * 상세페이지의 세로 축은 **다시 재는가**로 갈린다 — 기간마다 다시 재는 값(매출·트랙션·고용)은
 * 실적이고, 쌓이거나 지금의 상태로 존재하는 값(제품·팀·특허)은 역량이다. 그래서 특허는 취득일이
 * 있어도 역량이고 고용 인원은 사람 이야기여도 실적이다. 이 파일은 그 중 역량 쪽 4종을 소유한다
 * (실적 쪽은 `startupGrowth.ts`).
 *
 * 카드는 넷이지만 원장 컬럼도 넷이다(business_profile / tech_profile / team_profile / ip_profile).
 * 카드 하나에 컬럼 하나를 맞춘 이유는 저장이 통째 교체 모델이어서다 — 한 컬럼에 두 카드가 살면
 * 한 카드만 고쳐도 다른 카드 값을 함께 써야 하고, 그 왕복에서 빠뜨린 키가 조용히 지워진다.
 */

/** 비즈니스 정성 정보(startups.business_profile). 요약 3축(strengths 등)은 StartupSummaryCards가 읽는다. */
export interface BusinessProfile {
  oneLiner?: string
  businessModel?: string
  targetMarket?: string
  /** 수익 구조 — 어떻게 버는가(과금 방식·단가·마진). 비즈니스 모델과 다른 질문이다. */
  revenueModel?: string
  /** 판매·유통 채널 — 직판/대리점/온라인/B2G. */
  salesChannel?: string
  /** 생산·공급 방식 — 자체 생산/OEM·ODM/외주. 제조 기업의 원가와 납기 리스크를 결정한다. */
  supplyMode?: string
}

/** 제품·기술(startups.tech_profile). */
export interface TechProfile {
  /** 제품·서비스 — 무엇을 만드는가. */
  product?: string
  /** 개발 단계(고정 선택지). */
  devStage?: string
  /** 핵심 기술 — 무엇이 자체 기술인가. */
  coreTech?: string
  /** 개발 내재화(고정 선택지) — 기술이 회사 자산인지 거래처 자산인지를 가르는 한 칸. */
  devInsourcing?: string
  /** 차별 역량 — '남보다 낫다'가 아니라 '우리만 가진 것'(구 competitiveEdge). */
  differentiator?: string
}

/** 핵심 팀원 1인. */
export interface TeamMember {
  name: string
  role: string
  background: string
  /** 재직 형태(전업/겸업). 초기 기업 심사에서 가장 자주 확인하는 값이라 자유 텍스트에서 칸으로 올렸다. */
  employment?: string
  /** 합류 시점(YYYY-MM). */
  joinedAt?: string
  /** 지분 보유 여부. */
  hasEquity?: boolean
}

/** 자문·어드바이저 1인. */
export interface Advisor {
  name: string
  affiliation?: string
  role?: string
}

/** 팀·조직 역량(startups.team_profile). */
export interface TeamProfile {
  founderStrength?: string
  members?: TeamMember[]
  capabilities?: string[]
  /** 조직 구성 — 부서별 인원. 총원 추이는 실적 밴드의 고용 표가 답하므로 여기 적지 않는다. */
  orgComposition?: string
  /** 채용 계획·주요 결원. */
  hiringPlan?: string
  advisors?: Advisor[]
}

/** 지식재산권 1건(특허·상표·디자인·SW저작권). */
export interface IpRight {
  kind: string
  title: string
  no?: string
  /** 출원 / 등록. */
  status?: string
  /** 출원·등록 시점(YYYY-MM). */
  date?: string
}

/** 인증 1건. */
export interface Certification {
  name: string
  agency?: string
  date?: string
}

/** 정부 R&D·TIPS 과제 1건. */
export interface GovProject {
  name: string
  /** 주관 / 참여. */
  role?: string
  period?: string
  /** 과제비(원). 표시 단위는 카드가 정한다. */
  amount?: number | null
}

/** 지식재산·인증(startups.ip_profile). 건수는 저장하지 않고 목록에서 센다. */
export interface IpProfile {
  rights: IpRight[]
  certifications: Certification[]
  govProjects: GovProject[]
}

/** 개발 단계 고정 선택지(제품이 어디까지 왔는가). */
export const DEV_STAGE_OPTIONS = ['아이디어', '프로토타입', 'MVP', '정식 출시', '양산'] as const

/**
 * 개발 내재화 고정 선택지.
 * 전면 외주면 기술이 회사 자산이 아니라 거래처 자산이라, 같은 제품이라도 평가가 달라진다.
 */
export const DEV_INSOURCING_OPTIONS = ['자체 개발', '일부 외주', '전면 외주'] as const

/** 재직 형태 고정 선택지. */
export const EMPLOYMENT_OPTIONS = ['전업', '겸업'] as const

/** 지식재산권 종류·상태 고정 선택지. */
export const IP_KIND_OPTIONS = ['특허', '상표', '디자인', 'SW저작권'] as const
export const IP_STATUS_OPTIONS = ['출원', '등록'] as const

/** 정부과제 참여 형태 고정 선택지. */
export const GOV_ROLE_OPTIONS = ['주관', '참여'] as const

/** jsonb 컬럼을 안전하게 객체로 읽는다. */
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** 문자열 키를 빈 문자열 기본값으로 읽는다. */
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  return v == null ? '' : String(v)
}

export function readBusiness(record: EntityRow): BusinessProfile {
  const o = asObject(record.business_profile)
  return {
    oneLiner: str(o, 'oneLiner'),
    businessModel: str(o, 'businessModel'),
    targetMarket: str(o, 'targetMarket'),
    revenueModel: str(o, 'revenueModel'),
    salesChannel: str(o, 'salesChannel'),
    supplyMode: str(o, 'supplyMode'),
  }
}

/**
 * 제품·기술을 읽는다. `differentiator`는 옛 `business_profile.competitiveEdge`를 흡수한다 —
 * 마이그레이션(20260906140000)이 값을 옮기지만, 그 배포 전에 저장된 브라우저 캐시나 되돌린
 * 백업 행이 옛 키만 갖고 있어도 화면에서 값이 사라지지 않게 한다.
 */
export function readTech(record: EntityRow): TechProfile {
  const o = asObject(record.tech_profile)
  const legacy = str(asObject(record.business_profile), 'competitiveEdge')
  return {
    product: str(o, 'product'),
    devStage: str(o, 'devStage'),
    coreTech: str(o, 'coreTech'),
    devInsourcing: str(o, 'devInsourcing'),
    differentiator: str(o, 'differentiator') || legacy,
  }
}

export function readTeam(record: EntityRow): TeamProfile {
  const o = asObject(record.team_profile)
  return {
    founderStrength: str(o, 'founderStrength'),
    members: asArray<TeamMember>(o.members),
    capabilities: asArray<string>(o.capabilities),
    orgComposition: str(o, 'orgComposition'),
    hiringPlan: str(o, 'hiringPlan'),
    advisors: asArray<Advisor>(o.advisors),
  }
}

export function readIp(record: EntityRow): IpProfile {
  const o = asObject(record.ip_profile)
  return {
    rights: asArray<IpRight>(o.rights),
    certifications: asArray<Certification>(o.certifications),
    govProjects: asArray<GovProject>(o.govProjects),
  }
}
