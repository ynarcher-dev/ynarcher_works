export type EntityKey = 'startups' | 'experts' | 'partners'

export interface EntityField {
  name: string
  label: string
  required?: boolean
}

export interface EntityConfig {
  key: EntityKey
  label: string
  table: EntityKey
  /** 폼/컬럼 대상 스칼라 필드(JSONB 부속 필드는 상세에서 별도 처리). */
  fields: EntityField[]
}

/** NETWORKS 3대 마스터 엔티티 정의(등록 폼·목록 컬럼 공통 원천). */
export const ENTITIES: Record<EntityKey, EntityConfig> = {
  startups: {
    key: 'startups',
    label: '스타트업',
    table: 'startups',
    fields: [
      { name: 'name', label: '기업명', required: true },
      { name: 'biz_reg_no', label: '사업자등록번호' },
      { name: 'representative', label: '대표자' },
      { name: 'industry', label: '산업' },
      { name: 'stage', label: '성장 단계' },
    ],
  },
  experts: {
    key: 'experts',
    label: '전문가',
    table: 'experts',
    fields: [
      { name: 'name', label: '이름', required: true },
      { name: 'email', label: '이메일' },
      { name: 'phone', label: '연락처' },
      { name: 'affiliation', label: '소속' },
    ],
  },
  partners: {
    key: 'partners',
    label: '협력사',
    table: 'partners',
    fields: [
      { name: 'name', label: '협력사명', required: true },
      { name: 'partner_type', label: '유형' },
      { name: 'memo', label: '메모' },
    ],
  },
}

export const ENTITY_ORDER: EntityKey[] = ['startups', 'experts', 'partners']
