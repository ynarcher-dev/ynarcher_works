import { Badge, type BadgeTone } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { categoryLabel } from '@/features/networks/config'
import type { ExistingRef } from '@/features/networks/bulkUpload'
import type { ReviewRow } from '@/features/networks/BulkReviewTable'

/** 업로드 행과 기존 레코드가 실제로 겹치는 필드 라벨만 추린다(이름/소속/부서/직책/이메일/연락처). */
function overlapLabels(row: ReviewRow, match: ExistingRef): string[] {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  const eq = (a: string, b: string) => a !== '' && a === b
  const out: string[] = []
  if (eq(norm(row.name), norm(match.name))) out.push('이름')
  if (eq(norm(row.affiliation), norm(match.affiliation))) out.push('소속')
  if (eq(norm(row.department), norm(match.profile.department))) out.push('부서')
  if (eq(norm(row.position), norm(match.profile.position))) out.push('직책')
  if (eq(norm(row.email), norm(match.email))) out.push('이메일')
  if (eq(digits(row.phone), digits(match.phone))) out.push('연락처')
  return out
}

/** 중복 셀의 한 덩이(독립 pill 뱃지). tone으로 경각심 단계, widthCls로 열 정렬용 최소폭을 준다. */
function Seg({
  label,
  value,
  tone = 'neutral',
  widthCls,
}: {
  label: string
  value: ReactNode
  tone?: BadgeTone
  widthCls?: string
}) {
  return (
    <Badge tone={tone} className={widthCls}>
      <span className="opacity-60">{label}</span>
      <span className="font-semibold">{value}</span>
    </Badge>
  )
}

interface Props {
  row: ReviewRow
  match: ExistingRef
  revived: boolean
  /** 비활성 사유를 모달로 연다. 사유가 있을 때만 이 셀이 누를 수 있는 자리가 된다. */
  onShowReason: () => void
}

/**
 * 중복 매칭 셀.
 *
 * - **비활성(미복구)**: `비활성: 염재민` **한 줄 텍스트**. 사유가 있으면 눌러서 모달로 읽는다.
 * - **활성 매칭 or 복구 확정**: 생성자 · 구분 · 중복(앰버) 배지. 최소폭으로 행마다 시작점을 맞춘다.
 *
 * 비활성 쪽만 배지를 걷은 이유는 **사유의 길이를 알 수 없기 때문**이다(2026-09-10). 사유는
 * 담당자가 자유롭게 적는 문장인데 배지는 줄바꿈하지 않으므로, 그 한 칸이 열의 선언폭을 밀어내고
 * 밀린 폭은 같은 표의 다른 열에서 깎여 나갔다 — 연락처가 두 줄로 접히고 셀렉트가 화살표만 남게
 * 눌린 것이 그 결과다. 길이를 모르는 값은 셀에 세우지 않고 모달로 보낸다. 겸해서 사람 이름이
 * 색 상자를 벗는 것도 맞다(색은 상태에만 쓴다 — 5_component_spec_rules §3.4).
 */
export function DupCell({ row, match, revived, onShowReason }: Props) {
  if (match.deleted && !revived) {
    const label = `비활성: ${match.deactivatedBy ?? '미상'}`
    // 사유가 없으면 열어 봐야 빈 모달이라 누를 자리를 만들지 않는다 — 눌리는데 아무 일도
    // 일어나지 않는 글자는 고장으로 읽힌다.
    if (!match.deactivateReason) {
      return <span className="whitespace-nowrap text-caption text-danger">{label}</span>
    }
    return (
      <button
        type="button"
        onClick={onShowReason}
        className="whitespace-nowrap text-caption text-danger underline decoration-danger/40 underline-offset-2 hover:decoration-danger"
        title="비활성화 사유 보기"
      >
        {label}
      </button>
    )
  }
  const dups = overlapLabels(row, match).join(', ')
  return (
    <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap text-caption leading-snug">
      <Seg label="생성자" value={match.contributor ?? '미상'} widthCls="min-w-[6rem]" />
      <Seg label="구분" value={categoryLabel(match.category) || '미지정'} widthCls="min-w-[6.5rem]" />
      {/*
        겹친 필드가 여섯이면 이 칸만 열을 밀어내므로 넘치는 만큼은 잘리고 전체는 title이 답한다.
        `shrink`는 Badge 기본값 `shrink-0`을 덮는 것이다 — 그것이 남아 있으면 min-w-0을 주어도
        배지가 줄어들지 않아 잘림이 일어나지 않는다.
      */}
      <Seg
        label="중복"
        tone="warning"
        value={
          <span className="truncate" title={dups}>
            {dups}
          </span>
        }
        widthCls="min-w-0 shrink"
      />
    </div>
  )
}
