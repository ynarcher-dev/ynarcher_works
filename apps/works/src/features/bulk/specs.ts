/**
 * 원장별 대용량 업로드 명세. "어떤 열을 받아 어느 컬럼에 넣는가"만 여기서 정하고,
 * 파싱·검증·업로드는 features/bulk/bulkImport.ts와 BulkImportPage가 소유한다.
 *
 * 열 구성 원칙 — **등록 폼의 입력 칸을 그대로 옮긴다.** 폼에 있는 칸을 업로드에서 빼면 그 값은
 * 등록 후 한 건씩 다시 열어 채워야 하고, 폼에 없는 칸(구 컬럼)을 업로드에만 두면 업로드로 만든
 * 레코드만 다른 모양이 된다. 다만 상세 폼의 부속 원장(주주·성장지표·LP·모듈 등)은 부모 행이
 * 있어야 성립하므로 CSV 한 장으로는 다루지 않는다 — 붙이는 것은 등록 후 상세 화면의 일이다.
 *
 * 선택값 원칙 — 폼이 선택지에서 고르게 하는 값은 업로드도 선택지로 검증한다(kind 'enum'/'tag').
 * 자유 텍스트로 받으면 오타 한 글자가 조용히 저장되어 그 레코드만 목록 필터에서 사라진다.
 */
import {
  FUND_CHARACTER_LABEL,
  FUND_SOURCE_LABEL,
  FUND_STATUS_LABEL,
  FUND_STRATEGY_LABEL,
  FUND_SUBSCRIPTION_LABEL,
  FUND_TYPE_LABEL,
} from '@/features/fund/fundListHooks'
import {
  MAX_PROGRAM_INDUSTRIES,
  PROGRAM_STATUS_LABEL,
  defaultProgramStatus,
  programStatusOptions,
} from '@/features/program/config'
import { MANAGEMENT_STATUS_LABEL } from '@/features/startup/startupClassification'
import { FUND_BULK_ASSIGNMENT, programBulkAssignment } from '@/features/bulk/bulkAssign'
import type { ProgramWorkspaceConfig } from '@/features/program/workspace'
import type { BulkImportSpec } from '@/features/bulk/bulkImport'

/** 회사 형태 선택지(StartupDetailForm의 COMPANY_FORMS와 같은 고정 3값 — 코드=라벨). */
const COMPANY_FORM_LABEL: Record<string, string> = { 법인: '법인', 개인: '개인', 예비: '예비' }

/** 분야 태그 다중 선택 상한(등록 폼 MAX_INDUSTRIES와 같다). */
const MAX_INDUSTRIES = 3

/**
 * 등록으로 지정할 수 있는 스타트업 구분. **투자기업은 뺀다** — 투자기업 전환은 자사 투자 집행을
 * 근거로 promote_to_invested가 처리하며, 서버도 invested 직접 등록을 막는다(20260731180000).
 * 등록 폼이 '투자' 선택지를 빼 둔 것과 같은 규칙이다.
 */
const STARTUP_UPLOAD_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(MANAGEMENT_STATUS_LABEL).filter(([code]) => code !== 'invested'),
)

/** STARTUP — 스타트업 원장(startups). 구분(management_status)은 4분류 코드다. */
export const STARTUP_BULK_SPEC: BulkImportSpec = {
  noun: '스타트업',
  table: 'startups',
  backTo: '/startup',
  templateName: '스타트업_업로드_템플릿.csv',
  guide:
    '기업명만 필수이고 나머지는 비워 두어도 됩니다. 구분은 화면에서 쓰는 말(발굴기업·보육기업·기타기업)을 그대로 적으면 되고, 비워 두면 발굴기업으로 들어갑니다. 투자기업은 업로드로 만들 수 없습니다 — 투자기업 전환은 FUND 투자 집행이 처리합니다. 분야·단계·소재지는 ADMIN 태그 관리에 등록된 이름만 받으며, 분야는 세미콜론(;)으로 최대 3개까지 적을 수 있습니다. 주주·성장지표처럼 기업 한 곳에 여러 줄이 붙는 정보는 등록 후 상세 화면에서 입력합니다.',
  fixedValues: { management_status: 'sourced' },
  invalidateKeys: [['startups']],
  fields: [
    {
      header: '한 줄 소개',
      // 폼은 비즈니스 개요를 business_profile(jsonb) 한 칸에 모은다. 한 줄 소개는 기업명 아래에
      // 늘 붙어 다니는 값이라 등록 시점에 함께 받는다.
      column: 'business_profile.oneLiner',
      aliases: ['oneLiner', '한줄소개'],
      example: 'AC/VC 업무를 하나로 묶는 운영 플랫폼',
    },
    { header: '기업명', column: 'name', required: true, example: '와이앤아처' },
    { header: '대표자', column: 'representative', aliases: ['representative'], example: '홍길동' },
    {
      header: '회사 형태',
      column: 'company_form',
      kind: 'enum',
      labels: COMPANY_FORM_LABEL,
      aliases: ['company_form', '회사형태'],
      example: '법인',
    },
    { header: '설립일', column: 'founded_on', kind: 'date', aliases: ['founded_on'], example: '2021-03-02' },
    { header: '사업자등록번호', column: 'biz_reg_no', aliases: ['biz_reg_no'], example: '123-45-67890' },
    {
      header: '분야',
      // SSOT는 배열 industries다(목록 열·필터 모두 배열을 읽는다). 스칼라 industry는 대표값 미러.
      column: 'industries',
      kind: 'tags',
      tagTable: 'industry_tags',
      max: MAX_INDUSTRIES,
      mirrorColumn: 'industry',
      // '산업'은 2026-08-03 이전 표기 — 그때 받아 둔 파일이 그대로 올라와도 열을 잃지 않는다.
      aliases: ['산업', 'industries', 'industry'],
      example: 'SaaS;핀테크',
    },
    { header: '단계', column: 'stage', kind: 'tag', tagTable: 'investment_stage_tags', aliases: ['stage'] },
    {
      header: '구분',
      column: 'management_status',
      kind: 'enum',
      labels: STARTUP_UPLOAD_STATUS_LABEL,
      aliases: ['management_status'],
      example: '발굴기업',
    },
    { header: '발굴경로', column: 'discovery_source', aliases: ['discovery_source'], example: '데모데이' },
    { header: '소재지', column: 'location', kind: 'tag', tagTable: 'location_tags', aliases: ['location'] },
    { header: '상세주소', column: 'address_detail', aliases: ['address_detail'] },
    { header: '이메일', column: 'email', aliases: ['email'], example: 'contact@example.com' },
    { header: '연락처', column: 'phone', kind: 'phone', aliases: ['phone'], example: '010-1234-5678' },
  ],
}

/**
 * FUND — 펀드(조합) 원장(funds). 펀드코드는 DB 트리거가 부여하므로 열로 받지 않는다.
 * 결성연도(vintage_year)·결성일(formed_on)은 존속기간이 대체한 구 컬럼이라 받지 않는다
 * (3_5_workspace_fund.md §2.1, 20260731240000).
 */
export const FUND_BULK_SPEC: BulkImportSpec = {
  noun: '펀드',
  table: 'funds',
  backTo: '/fund',
  templateName: '펀드_업로드_템플릿.csv',
  guide:
    '펀드명만 필수입니다. 재원·성격·구분·펀드유형·출자·상태는 화면에서 쓰는 말(모태 · 벤처투자조합 · AC · 블라인드 · 일시납 · 운용 중)을 그대로 적으면 됩니다. 금액은 원 단위 숫자로 적고 콤마는 있어도 됩니다. 펀드코드는 등록 시 자동으로 부여되므로 적지 않습니다. 대표펀드매니저는 아래에서 한 번 지정해 파일 전체에 적용합니다. 조합원(LP)·캐피탈 콜·목적 비중은 등록 후 상세 화면에서 입력합니다.',
  invalidateKeys: [['fund']],
  assignment: FUND_BULK_ASSIGNMENT,
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
      header: '출자',
      column: 'subscription_type',
      kind: 'enum',
      labels: FUND_SUBSCRIPTION_LABEL,
      aliases: ['subscription_type'],
      example: '일시납',
    },
    {
      header: '상태',
      column: 'status',
      kind: 'enum',
      labels: FUND_STATUS_LABEL,
      aliases: ['status'],
      example: '운용 중',
    },
    // 결성일(formed_on)은 존속기간 시작일과 같은 날이라 받지 않는다(20260731240000).
    { header: '존속기간 시작', column: 'term_start', kind: 'date', aliases: ['term_start'], example: '2026-01-15' },
    { header: '존속기간 종료', column: 'term_end', kind: 'date', aliases: ['term_end'], example: '2034-01-14' },
    {
      header: '운용기간 시작',
      column: 'operation_start',
      kind: 'date',
      aliases: ['operation_start'],
      example: '2026-01-15',
    },
    {
      header: '운용기간 종료',
      column: 'operation_end',
      kind: 'date',
      aliases: ['operation_end'],
      example: '2030-01-14',
    },
    {
      header: '약정총액',
      column: 'total_commitment',
      kind: 'number',
      // 등록 폼은 같은 값을 '결성액'으로 부른다 — 어느 쪽 이름으로 만든 파일이든 받는다.
      aliases: ['total_commitment', '결성액'],
      example: '3000000000',
    },
    {
      header: '실출자금액',
      column: 'paid_in_amount',
      kind: 'number',
      aliases: ['paid_in_amount'],
      example: '1500000000',
    },
  ],
}

/**
 * AC·M&A·PROJECT 공용 사업 원장 명세. 원장 테이블·명사·경로·사업구분이 워크스페이스마다 다르므로
 * ProgramWorkspaceConfig에서 조립한다(사업 공용 모듈의 config 주입 규칙과 같은 축).
 *
 * 기간(시작일·종료일)은 필수다. 담당자 배치 단계가 이 기간에서 산출되므로, 폼도 같은 이유로
 * 제안 단계에서까지 기간을 필수로 받는다.
 */
export function programBulkSpec(config: ProgramWorkspaceConfig): BulkImportSpec {
  const categoryLabels = Object.fromEntries(config.categories.map((c) => [c.value, c.label]))
  // 등록으로 지정할 수 있는 상태 = 워크스페이스 수명주기 그대로. 구 상태값(모집·심사·데모데이)은
  // 표시 전용이라 빠지고, 제안 단계를 쓰지 않는 워크스페이스에서는 운영 4종만 남는다(config.ts).
  const statusLabels: Record<string, string> = Object.fromEntries(
    programStatusOptions(config.hasProposalStage).map((code) => [
      code,
      PROGRAM_STATUS_LABEL[code] ?? code,
    ]),
  )
  const defaultStatus = defaultProgramStatus(config.hasProposalStage)
  return {
    noun: config.entityNoun,
    table: config.tables.programs,
    backTo: config.basePath,
    templateName: `${config.entityNoun}_업로드_템플릿.csv`,
    guide: `${config.entityNoun}명과 기간(시작일·종료일)이 필수입니다. 기간은 담당자 배치 단계를 나누는 기준이라 비울 수 없습니다. 상태${config.categories.length ? '와 구분' : ''}은 화면에서 쓰는 말을 그대로 적으면 되고, 상태를 비워 두면 ${config.hasProposalStage ? "제안 단계의 '시도'" : "운영 단계의 '준비'"}로 들어갑니다. 담당자는 아래에서 한 번 지정해 파일 전체에 적용하며, 부서별 협업비율·투입률 조정과 운영 모듈은 등록 후 상세 화면에서 다룹니다.`,
    invalidateKeys: [[config.key, 'programs']],
    // 신규 등록 기본 상태는 등록 폼과 같이 수명주기의 첫 칸이다(제안을 쓰면 '시도', 아니면 '준비').
    // 폼과 어긋나면 업로드로 만든 사업만 다른 자리에서 출발한다.
    fixedValues: { status: defaultStatus },
    assignment: programBulkAssignment(config),
    fields: [
      { header: `${config.entityNoun}명`, column: 'title', required: true, aliases: ['title', '사업명'] },
      {
        header: '상태',
        column: 'status',
        kind: 'enum',
        labels: statusLabels,
        aliases: ['status'],
        example: PROGRAM_STATUS_LABEL[defaultStatus],
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
      {
        header: '시작일',
        column: 'start_date',
        kind: 'date',
        required: true,
        aliases: ['start_date'],
        example: '2026-03-01',
      },
      {
        header: '종료일',
        column: 'end_date',
        kind: 'date',
        required: true,
        aliases: ['end_date'],
        example: '2026-12-31',
      },
      {
        // 분야: 등록 폼과 같은 태그 원장·같은 상한을 쓴다(스타트업 업로드의 '분야' 열과 동일 규격).
        // 사업 원장에는 대표값을 읽는 레거시 소비자가 없으므로 미러 컬럼을 두지 않는다.
        header: '분야',
        column: 'industries',
        kind: 'tags',
        tagTable: 'industry_tags',
        max: MAX_PROGRAM_INDUSTRIES,
        // '산업'은 2026-08-03 이전 표기 — 그때 받아 둔 파일이 그대로 올라와도 열을 잃지 않는다.
        aliases: ['산업', 'industries', 'industry'],
        example: 'SaaS;핀테크',
      },
      // 주관. 화면(목록 열·등록 폼)과 같은 이름·같은 판정을 쓴다 — 운용하지 않는 워크스페이스에는
      // 열 자체를 주지 않는다(빈 열을 주면 뭘 적을지 묻게 된다). '주관기관'은 종전 표기라 별칭으로 남긴다.
      ...(config.hasHostOrganization
        ? [
            {
              header: '주관',
              column: 'host_organization',
              aliases: ['주관기관', 'host_organization'],
              example: '중소벤처기업부',
            },
          ]
        : []),
      { header: '협력기관', column: 'partner_organization', aliases: ['partner_organization'] },
      { header: '설명', column: 'description', aliases: ['description'] },
    ],
  }
}
