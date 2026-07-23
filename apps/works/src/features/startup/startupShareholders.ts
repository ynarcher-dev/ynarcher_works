import type { EntityRow } from '@/features/networks/hooks'

/** 주주 1인. */
export interface Shareholder {
  /** 주주명 */
  name: string
  /** 보유 주식 수 */
  shares?: number | null
  /** 지분율(%) — 별도 입력값(주식 종류·전환 물량 등으로 단순 계산과 다를 수 있어 수동 관리). */
  percentage?: number | null
}

/**
 * 변경 시점별 주주 구성 스냅샷(startups.shareholders 배열 원소).
 * 캡테이블은 라운드마다 바뀌므로 시점(date)별로 이력을 쌓는다.
 */
export interface ShareholderSnapshot {
  /** 변경 시점(YYYY-MM-DD). */
  date: string
  /** 해당 시점의 주주 목록. */
  holders: Shareholder[]
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function isSnapshot(v: unknown): v is ShareholderSnapshot {
  return typeof v === 'object' && v != null && 'holders' in (v as Record<string, unknown>)
}

/**
 * 주주 구성 이력을 시점 내림차순(최신 우선)으로 읽는다.
 * 구(舊) 평면 배열([{ name, ... }])은 날짜 없는 단일 스냅샷으로 감싸 하위 호환한다.
 */
export function readShareholderHistory(record: EntityRow): ShareholderSnapshot[] {
  const raw = asArray(record.shareholders)
  if (raw.length === 0) return []
  // 신 형식: [{ date, holders }]
  if (raw.every(isSnapshot)) {
    return (raw as ShareholderSnapshot[])
      .map((s) => ({ date: s.date ?? '', holders: asArray(s.holders) as Shareholder[] }))
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }
  // 구 형식: 평면 주주 배열 → 날짜 없는 단일 스냅샷.
  return [{ date: '', holders: raw as Shareholder[] }]
}
