import { Select, TokenMultiSelect } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  MINUTE_LINK_TARGETS,
  MINUTE_LINK_TARGET_TYPES,
  type MinuteLink,
  type MinuteLinkTargetType,
} from '@/features/office/minutes/minuteLinks'
import { useMinuteLinkPool } from '@/features/office/minutes/minuteLinkSearch'

interface Props {
  /** 선택된 연동 대상(라벨 포함). */
  value: MinuteLink[]
  onChange: (next: MinuteLink[]) => void
}

/** 대상 키(종류:id) — 중복 방지·React key. */
const linkKey = (l: { targetType: string; targetId: string }) => `${l.targetType}:${l.targetId}`

/**
 * 회의록 연동 대상 선택기. 좌측 드롭다운으로 종류(AC/M&A/PROJECT/STARTUP)를 고르고,
 * 우측 필드에서 검색해 태그로 추가한다 — 내부 참석자 피커(TokenMultiSelect)와 동일한 UX:
 * 선택 항목이 필드 안 인라인 칩으로 남고, 후보 드롭다운은 검색어를 입력할 때만 열린다.
 * 후보 풀은 종류별 접근 가능 원장(useMinuteLinkPool)이며, 저장 시 set_minute_links RPC가
 * 서버측에서 접근 권한을 재검증한다. 아무것도 고르지 않으면 일반 회의록이 된다.
 */
export function MinuteLinkPicker({ value, onChange }: Props) {
  const [kind, setKind] = useState<MinuteLinkTargetType>('program')
  const { data: pool } = useMinuteLinkPool(kind)

  // 현재 종류의 후보를 TokenMultiSelect 옵션(MinuteLink)으로 변환한다.
  const options = useMemo<MinuteLink[]>(
    () =>
      (pool ?? []).map((c) => ({
        targetType: c.targetType,
        targetId: c.targetId,
        label: c.label,
        code: c.code,
      })),
    [pool],
  )

  return (
    <div className="space-y-1.5">
      <p className="text-caption text-gray-500">
        연동 콘텐츠 선택 / 검색 (선택) — 관련 사업·스타트업을 연결하면 상호 참조됩니다. 비워 두면 일반
        회의록입니다.
      </p>
      <div className="flex items-start gap-2">
        {/* 종류 선택 드롭다운 */}
        <div className="w-32 shrink-0">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as MinuteLinkTargetType)}
            aria-label="연동 콘텐츠 종류"
          >
            {MINUTE_LINK_TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {MINUTE_LINK_TARGETS[t].kindLabel}
              </option>
            ))}
          </Select>
        </div>

        {/* 검색 + 인라인 태그 필드(내부 참석자 피커와 동일). 후보는 검색어 입력 시에만 표시. */}
        <div className="min-w-0 flex-1">
          <TokenMultiSelect<MinuteLink>
            selected={value}
            onChange={onChange}
            options={options}
            getKey={linkKey}
            getLabel={(l) =>
              `${MINUTE_LINK_TARGETS[l.targetType].kindLabel} · ${l.label ?? l.targetId}`
            }
            getMeta={(l) => l.code ?? undefined}
            getSearchText={(l) => `${l.label ?? ''} ${l.code ?? ''}`}
            placeholder={`${MINUTE_LINK_TARGETS[kind].kindLabel} 검색 후 선택`}
          />
        </div>
      </div>
    </div>
  )
}
