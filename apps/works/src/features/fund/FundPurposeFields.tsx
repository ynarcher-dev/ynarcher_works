import { Button, Input, TextArea } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { FUND_PURPOSE_KIND_LABEL } from '@/features/fund/fundListHooks'
import type { FundPurpose, FundPurposeInput, FundPurposeKind } from '@/features/fund/hooks'

/** 편집 폼용 목적 초안(문자열 입력 상태). key는 리액트 렌더 키(클라이언트 전용). */
export interface PurposeDraft {
  key: string
  id?: string
  kind: FundPurposeKind
  label: string
  /** 목표비율(%) 입력 문자열. 빈 값은 미지정. */
  target_pct: string
}

let seq = 0
const nextKey = () => `p${seq++}`

/** FundPurpose[] → 편집 초안. sort_order 순서 유지. */
export function toPurposeDrafts(purposes: FundPurpose[] | undefined): PurposeDraft[] {
  return (purposes ?? []).map((p) => ({
    key: nextKey(),
    id: p.id,
    kind: p.kind,
    label: p.label,
    target_pct: p.target_pct == null ? '' : String(p.target_pct),
  }))
}

/** 편집 초안 → RPC 입력값. 라벨이 빈 행은 제외하고, 표시 순서를 sort_order로 굳힌다. */
export function toPurposeInputs(drafts: PurposeDraft[]): FundPurposeInput[] {
  return drafts
    .filter((d) => d.label.trim() !== '')
    .map((d, i) => {
      const pct = d.target_pct.trim() === '' ? null : Number(d.target_pct.replace(/,/g, ''))
      return {
        ...(d.id ? { id: d.id } : {}),
        kind: d.kind,
        label: d.label.trim(),
        target_pct: pct == null || Number.isNaN(pct) ? null : pct,
        sort_order: i,
      }
    })
}

/**
 * 펀드 목적관리 필드(컨트롤드). 주목적·특수목적을 각각 N개 추가하며, 각 항목은 텍스트 조건과
 * 목표비율(약정총액 대비 %)을 가진다. 비율은 **목적별 독립 달성 기준선**이다 — 서로 합산되지 않고
 * (예: 주목적 A 60% · B 70%), 한 투자가 여러 목적에 동시 부합할 수 있어 합이 100%를 넘을 수 있다.
 * 어디에도 부합하지 않는 투자는 '일반'으로 집계된다(별도 입력 없음). 저장 시 상위(FundForm)가
 * set_fund_purposes로 원자 교체한다.
 */
export function FundPurposeFields({
  value,
  onChange,
}: {
  value: PurposeDraft[]
  onChange: (next: PurposeDraft[]) => void
}) {
  const add = (kind: FundPurposeKind) =>
    onChange([...value, { key: nextKey(), kind, label: '', target_pct: '' }])
  const patch = (key: string, part: Partial<PurposeDraft>) =>
    onChange(value.map((d) => (d.key === key ? { ...d, ...part } : d)))
  const remove = (key: string) => onChange(value.filter((d) => d.key !== key))

  return (
    <div className="space-y-4">
      {/* 의무투자는 규약상 단일 항목(하나만). 규칙(조건·목표비율)은 주목적과 동일하다. */}
      <PurposeGroup
        kind="MANDATORY"
        rows={value.filter((d) => d.kind === 'MANDATORY')}
        singleton
        onPatch={patch}
        onRemove={remove}
        onAdd={() => add('MANDATORY')}
      />
      <PurposeGroup
        kind="MAIN"
        rows={value.filter((d) => d.kind === 'MAIN')}
        onPatch={patch}
        onRemove={remove}
        onAdd={() => add('MAIN')}
      />
      <PurposeGroup
        kind="SPECIAL"
        rows={value.filter((d) => d.kind === 'SPECIAL')}
        onPatch={patch}
        onRemove={remove}
        onAdd={() => add('SPECIAL')}
      />

      <p className="border-t border-gray-100 pt-3 text-body-sm text-gray-500">
        비율은 목적별 <b className="text-gray-700">독립 달성 기준선</b>입니다(약정총액 대비, 서로 합산되지 않음).
      </p>
    </div>
  )
}

/** 한 구분(의무투자/주목적/특수목적)의 항목 목록 + 추가 버튼. singleton은 1건까지만 허용한다. */
function PurposeGroup({
  kind,
  rows,
  singleton = false,
  onPatch,
  onRemove,
  onAdd,
}: {
  kind: FundPurposeKind
  rows: PurposeDraft[]
  singleton?: boolean
  onPatch: (key: string, part: Partial<PurposeDraft>) => void
  onRemove: (key: string) => void
  onAdd: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-body font-medium text-gray-800">{FUND_PURPOSE_KIND_LABEL[kind]}</p>
      {rows.length === 0 ? (
        <p className="text-body-sm text-gray-500">등록된 {FUND_PURPOSE_KIND_LABEL[kind]}이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <div key={d.key} className="flex items-start gap-2">
              {/* 조건은 길어질 수 있어, 내용 길이에 맞춰 칸 높이가 자동으로 늘어나는 다중 줄 입력. */}
              <AutoGrowTextArea
                value={d.label}
                onChange={(v) => onPatch(d.key, { label: v })}
                placeholder="투자 조건(예: 초기 창업기업 대상 — 길게 여러 줄로 작성 가능)"
              />
              <div className="relative w-24 shrink-0">
                <Input
                  inputMode="numeric"
                  value={d.target_pct}
                  onChange={(e) => onPatch(d.key, { target_pct: e.target.value })}
                  placeholder="비율"
                  className="pr-6 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-body-sm text-gray-400">
                  %
                </span>
              </div>
              <button
                type="button"
                aria-label="목적 삭제"
                onClick={() => onRemove(d.key)}
                className="mt-1 grid size-8 shrink-0 place-items-center rounded-radius-md text-gray-400 transition-colors duration-fast hover:bg-gray-50 hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 의무투자(singleton)는 1건이 차면 추가 버튼을 감춘다. */}
      {!(singleton && rows.length >= 1) && (
        <Button variant="ghost" density="card" onClick={onAdd} className="gap-1">
          <Plus className="size-4" />
          {FUND_PURPOSE_KIND_LABEL[kind]} 추가
        </Button>
      )}
    </div>
  )
}

/**
 * 내용 길이에 맞춰 높이가 자동으로 늘어나는 텍스트 입력. 매 렌더(값 변경)마다 height를 auto로
 * 되돌린 뒤 scrollHeight로 맞춰 한 줄~여러 줄을 자연스럽게 확장한다(수동 리사이즈·스크롤바 없음).
 */
function AutoGrowTextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <TextArea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className="min-h-[2.75rem] flex-1 resize-none overflow-hidden"
    />
  )
}
