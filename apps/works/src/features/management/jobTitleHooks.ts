import { useMemo } from 'react'
import { useTags } from '@/features/admin/hooks'
import {
  jobTitleLabel,
  toDisplayMode,
  type DisplayModeMap,
  type JobTitleModes,
} from '@/features/management/jobTitle'

/**
 * 이름 옆 호칭을 만드는 함수를 돌려준다 — 직급·직책 태그 원장의 표기 방식을 읽어 `jobTitleLabel`에
 * 물려 준다. 임직원 원장에는 태그의 id가 아니라 이름 문자열이 저장되므로 이름으로 맞춘다.
 *
 * 태그 원장은 수십 건짜리 기준정보라 화면마다 통째로 읽어도 무리가 없고, 캐시 키가 태그 관리
 * 화면과 같아 관리자가 표기 방식을 바꾸면 같은 무효화를 타고 호칭도 함께 갱신된다.
 */
export function useJobTitleLabel() {
  const { data: rankTags } = useTags('rank_tags', undefined, true, true)
  const { data: positionTags } = useTags('position_tags', undefined, true, true)

  const modes = useMemo<JobTitleModes>(
    () => ({
      rank: toModeMap(rankTags),
      position: toModeMap(positionTags),
    }),
    [rankTags, positionTags],
  )

  return useMemo(
    () => (rank?: string | null, position?: string | null) => jobTitleLabel(rank, position, modes),
    [modes],
  )
}

function toModeMap(tags?: { name: string; display_mode?: string | null }[]): DisplayModeMap {
  const m: DisplayModeMap = new Map()
  for (const t of tags ?? []) {
    const mode = toDisplayMode(t.display_mode)
    // 기본은 담지 않는다 — 없는 이름과 같은 뜻이라 지도를 키울 이유가 없다.
    if (mode !== 'DEFAULT') m.set(t.name, mode)
  }
  return m
}
