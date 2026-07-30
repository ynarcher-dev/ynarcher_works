/**
 * 민감정보 마스킹 대상 필드.
 * 필드는 화면이 실제로 렌더하는 개인정보 축이며, 콘텐츠(목록 화면)마다 보유 여부가 다르다.
 */
export type SensitiveField = 'name' | 'email' | 'phone'

export const SENSITIVE_FIELDS: readonly SensitiveField[] = ['name', 'email', 'phone']

export const SENSITIVE_FIELD_LABEL: Record<SensitiveField, string> = {
  name: '이름',
  email: '이메일',
  phone: '연락처',
}

/**
 * 필드별 기본 마스킹 여부(정책 미설정 시 적용).
 * 이름은 업무 식별의 기본 축이라 기본 공개, 연락 수단(이메일·연락처)은 기본 마스킹이다
 * — 근거: docs_dev/4_security_privacy_policy.md(개인정보 목록 마스킹 의무).
 */
export const DEFAULT_MASK: Record<SensitiveField, boolean> = {
  name: false,
  email: true,
  phone: true,
}

/**
 * 정책 단위인 '콘텐츠' = 외부 인물·기업의 개인정보를 담는 화면 하나.
 *
 * 마스킹 대상은 **외부 인물과 외부 기업**뿐이다 — 네트워크 인물, 스타트업 대표자,
 * 사업에 신청한 기업의 담당자, 피투자사 대표자. 내부 임직원(담당자·등록자·운용인력·작성자)은
 * 업무 식별의 기본 축이라 어느 화면에서도 가리지 않는다(사용자 확정, 2026-07-29).
 *
 * `fields`에는 그 화면이 실제로 렌더하는 개인정보 필드만 담는다 — 화면에 없는 필드의 스위치를
 * 관리 화면에 띄우면 "켰는데 아무 일도 안 일어나는" 죽은 설정이 된다.
 */
export interface SensitiveContent {
  /** `${워크스페이스}.${화면}` 형식. 화면에서 이 값을 그대로 넘긴다. */
  key: string
  /** 사이드바 메뉴 라벨(또는 패널 이름)과 일치시킨다. */
  label: string
  fields: readonly SensitiveField[]
  /** 목록에 덧붙이는 짧은 설명(어떤 값이 가려지는지). */
  hint?: string
}

/** 워크스페이스 단위 묶음(관리 화면의 카드 하나). */
export interface SensitiveContentGroup {
  key: string
  label: string
  contents: readonly SensitiveContent[]
}

/** 외부 인물 원장(이름·이메일·연락처를 모두 표시하는 화면) 공통 필드. */
const PERSON: readonly SensitiveField[] = ['name', 'email', 'phone']
/** 외부 기업의 대표자명만 표시하는 화면 공통 필드. */
const NAME_ONLY: readonly SensitiveField[] = ['name']

/** 기업 원장(목록은 대표자명, 상세는 이메일·연락처까지) 공통 설명. */
const COMPANY_HINT = '대표자명 · 기업 이메일 · 연락처'

/** FUND 포트폴리오(피투자사) 콘텐츠 키. */
export const FUND_PORTFOLIO_CONTENT_KEY = 'fund.portfolio'

/** 사업 워크스페이스(AC/M&A/PROJECT)의 신청 기업 정보 콘텐츠 키. */
export function applicantContentKey(workspaceKey: string): string {
  return `${workspaceKey}.applicants`
}

/** 사업 워크스페이스는 화면(features/program)을 공유하므로 콘텐츠 구성도 같다. */
function programContents(ws: string, noun: string): SensitiveContent[] {
  return [
    {
      key: applicantContentKey(ws),
      label: `신청 기업 정보(${noun} 신청 현황)`,
      fields: PERSON,
      hint: '신청서의 대표자명 · 이메일 · 연락처',
    },
  ]
}

/**
 * 민감정보 정책 카탈로그. ADMIN '민감정보 관리' 화면과 각 목록 화면이 함께 참조하는 단일 원천이다.
 * 화면이 늘어나면 이 파일에 항목을 추가하고 해당 화면에 `contentKey`를 넘기면 된다.
 */
export const SENSITIVE_CONTENT_GROUPS: readonly SensitiveContentGroup[] = [
  {
    key: 'startup',
    label: 'STARTUP',
    contents: [
      { key: 'startup.mine', label: '내 기업 관리', fields: PERSON, hint: COMPANY_HINT },
      { key: 'startup.invested', label: '투자기업', fields: PERSON, hint: COMPANY_HINT },
      { key: 'startup.incubated', label: '보육기업', fields: PERSON, hint: COMPANY_HINT },
      { key: 'startup.discovered', label: '발굴기업', fields: PERSON, hint: COMPANY_HINT },
      { key: 'startup.etc', label: '기타기업', fields: PERSON, hint: COMPANY_HINT },
    ],
  },
  {
    key: 'networks',
    label: 'NETWORKS',
    contents: [
      { key: 'networks.mine', label: '내 네트워크 관리', fields: PERSON },
      { key: 'networks.experts', label: '전문가 네트워크', fields: PERSON },
      { key: 'networks.investors', label: '투자사 네트워크', fields: PERSON },
      { key: 'networks.van', label: 'BAN 네트워크', fields: PERSON },
      { key: 'networks.exp', label: 'EXP 네트워크', fields: PERSON },
      { key: 'networks.corporates', label: '기업 네트워크', fields: PERSON },
      { key: 'networks.institutions', label: '기관 네트워크', fields: PERSON },
      { key: 'networks.universities', label: '대학 네트워크', fields: PERSON },
      { key: 'networks.etc', label: '기타 네트워크', fields: PERSON },
      { key: 'networks.global', label: '글로벌 네트워크', fields: PERSON },
      { key: 'networks.others', label: '미분류 데이터베이스', fields: PERSON },
    ],
  },
  { key: 'ac', label: 'AC', contents: programContents('ac', '사업') },
  { key: 'mna', label: 'M&A', contents: programContents('mna', '딜') },
  { key: 'project', label: 'PROJECT', contents: programContents('project', '프로젝트') },
  {
    key: 'fund',
    label: 'FUND',
    contents: [
      {
        key: FUND_PORTFOLIO_CONTENT_KEY,
        label: '포트폴리오(피투자사)',
        fields: NAME_ONLY,
        hint: '피투자사 대표자',
      },
    ],
  },
]

/** 모든 콘텐츠를 평탄화한 목록(정책 조회·마이그레이션용). */
export const SENSITIVE_CONTENTS: readonly SensitiveContent[] = SENSITIVE_CONTENT_GROUPS.flatMap(
  (g) => g.contents,
)

const CONTENT_BY_KEY = new Map(SENSITIVE_CONTENTS.map((c) => [c.key, c]))

/** 콘텐츠 정의 조회. 카탈로그에 없는 키면 undefined(정책은 필드 기본값으로 폴백한다). */
export function sensitiveContentOf(key: string): SensitiveContent | undefined {
  return CONTENT_BY_KEY.get(key)
}

/** 정책 저장 키. 콘텐츠와 필드를 한 문자열로 묶는다. */
export function policyKey(contentKey: string, field: SensitiveField): string {
  return `${contentKey}:${field}`
}
