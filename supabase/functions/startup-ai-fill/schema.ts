// [AI 작성하기] Gemini 구조화 출력 스키마(responseSchema) 조립.
//
// 스키마를 프롬프트와 같은 폴더에 두되 파일을 나눈 이유는 둘이 서로 다른 것을 강제하기
// 때문이다 — 프롬프트는 **무엇을 적을지**를, 스키마는 **어떤 모양으로 올지**를 정한다.
// 모양이 어긋나면 파싱 단계에서 통째로 실패하므로 스키마는 최대한 느슨하게 잡고
// (거의 모든 칸이 nullable), 값의 옳고 그름은 validate.ts가 뒤에서 따로 거른다.
//
// **고정 선택지를 enum으로 박지 않는다.** 스키마가 선택지를 강제하면 모델은 어느 값에도
// 맞지 않는 문서에서도 가장 가까운 값을 골라 넣게 되고, 그 순간 "모른다"가 "이것이다"로
// 바뀐다. 대신 STRING으로 받아 validate.ts가 목록 밖 값을 null로 치환하고 원문을 notes에
// 남긴다 — 틀린 값을 지어내는 것보다 빈 칸이 낫다는 이 기능의 계약 그대로다.
//
// **봉투(notes·evidence)는 여기 없다.** 그것은 대상이 무엇이든 같은 일을 하므로 엔진이
// 소유한다(_shared/aiFill/schema.ts) — 특히 evidence는 우리가 발급한 조각 id로 답해야 해서
// 프로파일이 모양을 정할 자리가 아니다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §6.3·§8.2·§16.16

import { arr, BOOL, INT, NUM, obj, STR, type SchemaNode } from '../_shared/aiFill/schema.ts'
import type { CardKey } from './cards.ts'

export const CARD_SCHEMAS: Record<CardKey, SchemaNode> = {
  basics: obj({
    name: STR,
    representative: STR,
    companyForm: STR,
    foundedOn: STR,
    bizRegNo: STR,
    location: STR,
    addressDetail: STR,
  }),
  summary: obj({
    strengths: arr({ type: 'STRING' }),
    improvements: arr({ type: 'STRING' }),
    needs: arr({ type: 'STRING' }),
  }),
  business: obj({
    oneLiner: STR,
    businessModel: STR,
    targetMarket: STR,
    revenueModel: STR,
    salesChannel: STR,
    supplyMode: STR,
  }),
  tech: obj({
    product: STR,
    devStage: STR,
    coreTech: STR,
    devInsourcing: STR,
    differentiator: STR,
  }),
  team: obj({
    founderStrength: STR,
    orgComposition: STR,
    hiringPlan: STR,
    members: arr(
      obj(
        {
          name: { type: 'STRING' },
          role: STR,
          background: STR,
          employment: STR,
          joinedAt: STR,
          hasEquity: BOOL,
        },
        ['name'],
      ),
    ),
    advisors: arr(obj({ name: { type: 'STRING' }, affiliation: STR, role: STR }, ['name'])),
    capabilities: arr({ type: 'STRING' }),
  }),
  ip: obj({
    rights: arr(obj({ kind: STR, title: { type: 'STRING' }, no: STR, status: STR, date: STR }, ['title'])),
    certifications: arr(obj({ name: { type: 'STRING' }, agency: STR, date: STR }, ['name'])),
    govProjects: arr(obj({ name: { type: 'STRING' }, role: STR, period: STR, amount: NUM }, ['name'])),
  }),
  timeline: arr(obj({ date: { type: 'STRING' }, content: { type: 'STRING' } }, ['date', 'content'])),
  traction: obj({
    traction: arr(
      obj({ metric: { type: 'STRING' }, unit: STR, period: { type: 'STRING' }, value: NUM }, ['metric', 'period']),
    ),
    customers: arr(obj({ name: { type: 'STRING' }, kind: STR, date: STR }, ['name'])),
  }),
  revenue: obj({
    revenue: arr(
      obj({ year: { type: 'INTEGER' }, revenue: NUM, operatingProfit: NUM, netIncome: NUM }, ['year']),
    ),
    finance: arr(obj({ year: { type: 'INTEGER' }, assets: NUM, liabilities: NUM, equity: NUM }, ['year'])),
  }),
  employee: arr(obj({ year: { type: 'INTEGER' }, employeeCount: INT }, ['year'])),
  shareholders: arr(
    obj(
      {
        // 기준일은 "월만 아는" 경우를 빈 문자열로 받으므로 필수이되 nullable이 아니다.
        date: { type: 'STRING' },
        holders: arr(obj({ name: { type: 'STRING' }, shares: NUM, percentage: NUM }, ['name'])),
      },
      ['date', 'holders'],
    ),
  ),
  investment: arr(
    obj({ date: { type: 'STRING' }, round: STR, fundingAmount: NUM, valuation: NUM, investor: STR }, ['date']),
  ),
}
