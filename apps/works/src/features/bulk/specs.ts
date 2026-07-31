/**
 * 원장별 대용량 업로드 명세. "어떤 열을 받아 어느 컬럼에 넣는가"만 여기서 정하고,
 * 파싱·검증·업로드는 features/bulk/bulkImport.ts와 BulkImportPage가 소유한다.
 *
 * 열 구성 원칙 — 등록 폼의 필수·핵심 항목만 받는다. 상세 폼의 부속 원장(주주·성장지표·인력 배정 등)은
 * 부모 행이 있어야 성립하므로 CSV 한 장으로는 다루지 않는다. 붙이는 것은 등록 후 상세 화면의 일이다.
 */
import {
  FUND_CHARACTER_LABEL,
  FUND_SOURCE_LABEL,
  FUND_STATUS_LABEL,
  FUND_STRATEGY_LABEL,
  FUND_TYPE_LABEL,
} from '@/features/fund/fundListHooks'
import { PROGRAM_STATUS_LABEL } from '@/features/program/config'
import { MANAGEMENT_STATUS_LABEL } from '@/features/startup/startupClassification'
import type { ProgramWorkspaceConfig } from '@/features/program/workspace'
import type { BulkImportSpec } from '@/features/bulk/bulkImport'

/** STARTUP — 스타트업 원장(startups). 구분(management_status)은 4분류 코드다. */
export const STARTUP_BULK_SPEC: BulkImportSpec = {
  noun: '스타트업',
  table: 'startups',
  backTo: '/startup',
  templateName: '스타트업_업로드_템플릿.csv',
  guide:
    '기업명만 필수이고 나머지는 비워 두어도 됩니다. 구분은 화면에서 쓰는 말(발굴기업·보육기업·투자기업·기타기업)을 그대로 적으면 되고, 비워 두면 발굴기업으로 들어갑니다. 주주·성장지표처럼 기업 한 곳에 여러 줄이 붙는 정보는 등록 후 상세 화면에서 입력합니다.',
  fixedValues: { management_status: 'sourced' },
  invalidateKeys: [['startups']],
  fields: [
    { header: '기업명', column: 'name', required: true, example: '와이앤아처' },
    { header: '사업자등록번호', column: 'biz_reg_no', aliases: ['biz_reg_no'], example: '123-45-67890' },
    { header: '대표자', column: 'representative', aliases: ['representative'], example: '홍길동' },
    { header: '산업', column: 'industry', aliases: ['industry'], example: 'SaaS' },
    { header: '단계', column: 'stage', aliases: ['stage'], example: 'Seed' },
    {
      header: '구분',
      column: 'management_status',
      kind: 'enum',
      labels: MANAGEMENT_STATUS_LABEL,
      aliases: ['management_status'],
      example: '발굴기업',
    },
    { header: '설립일', column: 'founded_on', kind: 'date', aliases: ['founded_on'], example: '2021-03-02' },
    { header: '발굴경로', column: 'discovery_source', aliases: ['discovery_source'], example: '데모데이' },
  ],
}

/** FUND — 펀드(조합) 원장(funds). 펀드코드는 DB 트리거가 부여하므로 열로 받지 않는다. */
export const FUND_BULK_SPEC: BulkImportSpec = {
  noun: '펀드',
  table: 'funds',
  backTo: '/fund',
  templateName: '펀드_업로드_템플릿.csv',
  guide:
    '펀드명만 필수입니다. 재원·성격·구분·펀드유형·상태는 화면에서 쓰는 말(모태 · 벤처투자조합 · AC · 블라인드 · 운용 중)을 그대로 적으면 됩니다. 금액은 원 단위 숫자로 적고 콤마는 있어도 됩니다. 펀드코드는 등록 시 자동으로 부여되므로 적지 않습니다. 조합원(LP)·캐피탈 콜·목적 비중은 등록 후 상세 화면에서 입력합니다.',
  invalidateKeys: [['fund']],
  fields: [
    { header: '펀드명', column: 'name', required: true, example: '와이앤아처 개인투자조합 1호' },
    {
      header: '재원',
      column: 'source_type',
      kind: 'enum',
      labels: FUND_SOURCE_LABEL,
      aliases: ['source_type'],
      example: '모태',
    },
    {
      header: '성격',
      column: 'character_type',
      kind: 'enum',
      labels: FUND_CHARACTER_LABEL,
      aliases: ['character_type'],
      example: '개인투자조합',
    },
    {
      header: '구분',
      column: 'strategy_type',
      kind: 'enum',
      labels: FUND_STRATEGY_LABEL,
      aliases: ['strategy_type'],
      example: 'AC',
    },
    {
      header: '펀드유형',
      column: 'fund_type',
      kind: 'enum',
      labels: FUND_TYPE_LABEL,
      aliases: ['fund_type'],
      example: '블라인드',
    },
    {
      header: '상태',
      column: 'status',
      kind: 'enum',
      labels: FUND_STATUS_LABEL,
      aliases: ['status'],
      example: '운용 중',
    },
    { header: '결성일', column: 'formed_on', kind: 'date', aliases: ['formed_on'], example: '2026-01-15' },
    { header: '존속기간 시작', column: 'term_start', kind: 'date', aliases: ['term_start'], example: '2026-01-15' },
    { header: '존속기간 종료', column: 'term_end', kind: 'date', aliases: ['term_end'], example: '2034-01-14' },
    {
      header: '약정총액',
      column: 'total_commitment',
      kind: 'number',
      aliases: ['total_commitment'],
      example: '3000000000',
    },
    {
      header: '실출자금액',
      column: 'paid_in_amount',
      kind: 'number',
      aliases: ['paid_in_amount'],
      example: '1500000000',
    },
    { header: '결성연도', column: 'vintage_year', kind: 'number', aliases: ['vintage_year'], example: '2026' },
  ],
}

/**
 * AC·M&A·PROJECT 공용 사업 원장 명세. 원장 테이블·명사·경로·사업구분이 워크스페이스마다 다르므로
 * ProgramWorkspaceConfig에서 조립한다(사업 공용 모듈의 config 주입 규칙과 같은 축).
 */
export function programBulkSpec(config: ProgramWorkspaceConfig): BulkImportSpec {
  const categoryLabels = Object.fromEntries(config.categories.map((c) => [c.value, c.label]))
  return {
    noun: config.entityNoun,
    table: config.tables.programs,
    backTo: config.basePath,
    templateName: `${config.entityNoun}_업로드_템플릿.csv`,
    guide: `${config.entityNoun}명만 필수입니다. 상태와 ${config.categories.length ? '구분은 ' : ''}화면에서 쓰는 말을 그대로 적으면 되고, 비워 두면 준비 상태로 들어갑니다. 담당 부서·투입률·운영 모듈은 원장에 행을 만든 뒤에야 붙일 수 있어 등록 후 상세 화면에서 지정합니다.`,
    invalidateKeys: [[config.key, 'programs']],
    fields: [
      { header: `${config.entityNoun}명`, column: 'title', required: true, aliases: ['title', '사업명'] },
      {
        header: '상태',
        column: 'status',
        kind: 'enum',
        labels: PROGRAM_STATUS_LABEL,
        aliases: ['status'],
        example: '준비',
      },
      // 분류를 운용하지 않는 워크스페이스에서는 구분 열 자체를 빼둔다(빈 열을 주면 뭘 적을지 묻게 된다).
      ...(config.categories.length
        ? [
            {
              header: '구분',
              column: 'category',
              kind: 'enum' as const,
              labels: categoryLabels,
              aliases: ['category', '사업구분'],
              example: config.categories[0]?.label,
            },
          ]
        : []),
      { header: '시작일', column: 'start_date', kind: 'date', aliases: ['start_date'], example: '2026-03-01' },
      { header: '종료일', column: 'end_date', kind: 'date', aliases: ['end_date'], example: '2026-12-31' },
      { header: '주관기관', column: 'host_organization', aliases: ['host_organization'] },
      { header: '협력기관', column: 'partner_organization', aliases: ['partner_organization'] },
      { header: '설명', column: 'description', aliases: ['description'] },
    ],
  }
}
