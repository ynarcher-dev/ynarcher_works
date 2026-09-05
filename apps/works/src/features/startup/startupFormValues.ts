/**
 * 통합 수정 폼(등록·수정 공용)의 react-hook-form 값 타입.
 *
 * 폼 파일이 아니라 별도 모듈에 두는 이유는 순환 참조 때문이다 — 입력 섹션들이 이 타입을 쓰고
 * 폼이 그 섹션들을 쓰므로, 타입이 폼 파일에 살면 서로를 import하게 된다.
 *
 * 배열형 값(주주·성장지표·미디어·지식재산)은 여기 없다. 통째 교체 저장이라 폼 값이 아니라
 * 상태로 들고 저장 시 jsonb로 반영한다(핵심 팀원·자문단만 useFieldArray로 폼 안에 있다).
 */
export interface StartupDetailFormValues {
  name: string
  representative: string
  company_form: string
  founded_on: string
  biz_reg_no: string
  stage: string
  management_status: string
  pool_status: string
  discovery_source: string
  location: string
  address_detail: string
  email: string
  phone: string
  // 비즈니스(business_profile)
  oneLiner: string
  businessModel: string
  targetMarket: string
  revenueModel: string
  salesChannel: string
  supplyMode: string
  // 제품·기술(tech_profile)
  product: string
  devStage: string
  coreTech: string
  devInsourcing: string
  differentiator: string
  // 팀·조직(team_profile)
  founderStrength: string
  orgComposition: string
  hiringPlan: string
  members: {
    name: string
    role: string
    background: string
    employment: string
    joinedAt: string
    hasEquity: boolean
  }[]
  advisors: { name: string; affiliation: string; role: string }[]
}
