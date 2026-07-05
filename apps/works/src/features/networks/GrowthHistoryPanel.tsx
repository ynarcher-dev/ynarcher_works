import { Banner } from '@ynarcher/ui'

/**
 * 성장 지표 히스토리(멘토링 5대 지표 레이더 차트).
 * 지표 데이터(mentoring_* / evaluation_targets)는 AC Phase에서 생성되므로,
 * 해당 테이블 도입 후 레이더 차트를 연결한다. (현재는 안내 표기)
 */
export function GrowthHistoryPanel() {
  return (
    <Banner tone="info">
      성장 지표 레이더 차트는 AC 멘토링 5대 지표 데이터(후속 Phase 생성) 연동 후 제공됩니다.
    </Banner>
  )
}
