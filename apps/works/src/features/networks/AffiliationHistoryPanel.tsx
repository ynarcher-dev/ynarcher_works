import { tableText } from '@ynarcher/ui'

/** profile.affiliation_history 한 항목. 원장 트리거(app.track_affiliation_history)가 남기는 형태. */
export interface AffiliationRecord {
  affiliation?: string | null
  department?: string | null
  position?: string | null
  /** 이 조합이 밀려난 경로: manual(직접 수정) · upload(대량 업로드) · merge(중복 병합 흡수). */
  source?: string | null
  note?: string | null
  /** 이력으로 보존된 시각(ISO). */
  at?: string | null
  /** 갱신한 사람 이름(표시용 스냅샷). 마이그레이션 이전 항목·병합 흡수분은 비어 있을 수 있다. */
  by?: string | null
}

/** profile.affiliation_history를 항목 배열로 정규화(누락·비배열은 빈 배열). */
export function parseAffiliationHistory(profile: unknown): AffiliationRecord[] {
  const raw = (profile as Record<string, unknown> | null | undefined)?.affiliation_history
  return Array.isArray(raw) ? (raw as AffiliationRecord[]) : []
}

/** 표시용: 소속 · 부서 · 직책을 비어있지 않은 것만 ' · '로 결합. */
function formatCombo(r: AffiliationRecord): string {
  return [r.affiliation, r.department, r.position]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' · ')
}

/** 출처 코드 → 사람이 읽는 라벨. 변동 이력 패널의 어투와 맞춘다. */
const SOURCE_LABEL: Record<string, string> = {
  manual: '직접 입력',
  upload: '대용량 업로드',
  merge: '병합 흡수',
}

interface Props {
  /** `record.profile` 원본 jsonb. */
  profile: unknown
}

/**
 * 이력 패널(읽기 전용). 동일인으로 확인된 뒤 소속·부서·직책이 바뀔 때, 현재값(부제)에서 밀려난
 * 직전 조합들을 최신순으로 보여 준다. 현재값은 화면 부제가 소유하므로 여기서는 과거 조합만 다룬다.
 */
export function AffiliationHistoryPanel({ profile }: Props) {
  // 트리거는 오래된 순으로 append하므로, 표시만 최신순으로 뒤집는다.
  const list = [...parseAffiliationHistory(profile)].reverse()

  if (list.length === 0) {
    return <p className="text-body text-gray-600">기록된 소속 변경 이력이 없습니다.</p>
  }

  return (
    // 목록 행은 표의 한 행이므로 크기를 tableText 하나로 세우고 위계는 색으로만 만든다(변동 이력과 동일 규격).
    // 소속·부서·직책(현재값에서 밀려난 조합)을 앞세우고, 그 뒤에 '날짜 · 수정 이름 · 출처 · 사유'를
    // 메타로 이어 붙인다 — 무엇이 바뀌었나(굵게)를 먼저 읽고 언제·누가·어떻게(연하게)를 뒤에 둔다.
    <ul className="divide-y divide-gray-100">
      {list.map((r, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5 first:pt-0">
          <span className={tableText.primary}>{formatCombo(r) || '-'}</span>
          <span className={`tabular-nums ${tableText.meta}`}>
            {[
              r.at ? String(r.at).slice(0, 10) : '-',
              // '수정'은 갱신 행위 말머리 — 뒤의 이름과 붙여 누가 바꿨는지 한 덩이로 읽힌다.
              r.by ? `수정 ${r.by}` : null,
              SOURCE_LABEL[r.source ?? ''] ?? '직접 입력',
              r.note || null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}
