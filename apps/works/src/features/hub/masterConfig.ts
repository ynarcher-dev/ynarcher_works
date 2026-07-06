import { ENTITIES, type EntityKey } from '@/features/networks/config'
import type { MasterColumn } from '@/features/master/types'
import { NETWORK_PROFILE_COLUMNS } from '@/features/master/networkProfileColumns'

/** HUB 마스터 정보 탭. 일부 탭은 여러 NETWORKS 네트워크를 묶어 조회한다. */
export type HubMasterTabKey = 'managers' | 'startups' | 'experts' | 'orgs'

/** 탭 내부에서 실제로 조회하는 단위(하나의 테이블 = 하나의 리스트). */
export interface HubEntityConfig {
  /** 조회/리스트 키(managers는 특수, 그 외는 테이블명과 동일). */
  key: string
  label: string
  table: string
  columns: MasterColumn[]
  /** 정본/임시(is_provisional) 상태 배지 노출 여부. */
  hasStatus: boolean
}

/** 마스터 정보 탭 구성(탭 제목 + 소속 네트워크 목록). */
export interface HubMasterTab {
  key: HubMasterTabKey
  label: string
  entities: HubEntityConfig[]
  /** 복수 네트워크 병합 조회 시 목록 컬럼 재정의(미지정 시 구분 배지 + 이름). */
  listColumns?: MasterColumn[]
}

/** NETWORKS 엔티티 정의를 HUB 조회용 구성으로 변환(컬럼·마스킹 SSOT 공유). */
function fromEntity(key: EntityKey): HubEntityConfig {
  const e = ENTITIES[key]
  return {
    key,
    label: e.label,
    table: e.table,
    columns: e.fields.map((f) => ({ name: f.name, label: f.label, mask: f.mask })),
    hasStatus: true,
  }
}

/** 임직원(users) — NETWORKS 마스터가 아니라 별도 규칙(역할 필터 + 마스킹). */
const MANAGERS_ENTITY: HubEntityConfig = {
  key: 'managers',
  label: '임직원',
  table: 'users',
  columns: [
    { name: 'name', label: '이름' },
    { name: 'user_type', label: '역할' },
    { name: 'email', label: '이메일', mask: 'email' },
  ],
  hasStatus: false,
}

/**
 * HUB 마스터 정보 4탭.
 * - 임직원 정보: 내부 임직원(users)
 * - 스타트업 네트워크: 스타트업
 * - 투자/전문가 네트워크: 전문가 + VAN + 투자사
 * - 협력사 네트워크: 기관 + 기업 + 대학 + 기타(나머지 전부)
 * 복수 네트워크를 묶는 탭은 목록에서 행별 구분 배지(태그)로 소속 네트워크를 표시한다.
 */
export const HUB_MASTER_TABS: Record<HubMasterTabKey, HubMasterTab> = {
  managers: {
    key: 'managers',
    label: '임직원 정보',
    entities: [MANAGERS_ENTITY],
  },
  startups: {
    key: 'startups',
    label: '스타트업 네트워크',
    entities: [fromEntity('startups')],
  },
  experts: {
    key: 'experts',
    label: '투자/전문가 네트워크',
    entities: [fromEntity('experts'), fromEntity('van'), fromEntity('investors')],
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  orgs: {
    key: 'orgs',
    label: '협력사 네트워크',
    entities: [
      fromEntity('institutions'),
      fromEntity('corporates'),
      fromEntity('universities'),
      fromEntity('others'),
    ],
  },
}
