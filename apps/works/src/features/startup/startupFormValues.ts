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
  representative_gender: string
  company_form: string
  founded_on: string
  biz_reg_no: string
  stage: string
  management_status: string
  pool_status: string
  discovery_source: string
  location: string
  /**
   * 주소 목록(2026-09-10). 한 칸이던 상세주소가 '어느 자리의 주소인가'를 함께 지는
   * 목록이 됐다 — 본사 하나만 담기던 동안 지사·연구소는 한 칸에 이어 붙이거나 적히지
   * 않았다. 배열이지만 폼 값으로 두는 것은 팀원·자문단과 같은 이유다(줄 추가·삭제가
   * useFieldArray로 서고, 저장은 통째 교체다).
   */
  addresses: { kind: string; detail: string }[]
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
