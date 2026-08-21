import { Badge, Button, IconButton, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FUND_LP_TYPE_OPTIONS } from '@/features/fund/fundListHooks'
import { useSetFundLps, type FundLp, type FundLpInput } from '@/features/fund/hooks'

/** 숫자만 남겨 천단위 콤마. */
function formatThousands(s: string): string {
  return s.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** 명부 한 줄의 편집 초안. key는 리액트 렌더 키(클라이언트 전용). */
interface LpDraft {
  key: string
  id?: string
  name: string
  lpType: string
  amount: string
  manager: string
  phone: string
  email: string
  /** 이미 납입이 잡힌 조합원인지 — 줄을 지울 때 경고 문구를 가른다. */
  paidAmount: number
}

let seq = 0
const nextKey = () => `lp${seq++}`

const blankRow = (): LpDraft => ({
  key: nextKey(),
  name: '',
  lpType: 'LIMITED',
  amount: '',
  manager: '',
  phone: '',
  email: '',
  paidAmount: 0,
})

function toDrafts(lps: FundLp[]): LpDraft[] {
  return lps.map((lp) => ({
    key: nextKey(),
    id: lp.id,
    name: lp.name,
    lpType: lp.lp_type,
    amount: lp.commitment_amount > 0 ? formatThousands(String(lp.commitment_amount)) : '',
    manager: lp.contact?.manager ?? '',
    phone: lp.contact?.phone ?? '',
    email: lp.contact?.email ?? '',
    paidAmount: lp.paid_amount,
  }))
}

/** 초안 → RPC 입력값. 조합원명이 빈 줄은 저장하지 않는다(추가만 하고 안 채운 줄). */
function toInputs(drafts: LpDraft[]): FundLpInput[] {
  return drafts
    .filter((d) => d.name.trim() !== '')
    .map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      name: d.name.trim(),
      lp_type: d.lpType,
      commitment_amount: toNum(d.amount),
      // 빈 칸은 키 자체를 넣지 않는다 — 빈 문자열이 쌓이면 "연락처 있음"으로 오독된다.
      contact: {
        ...(d.manager.trim() ? { manager: d.manager.trim() } : {}),
        ...(d.phone.trim() ? { phone: d.phone.trim() } : {}),
        ...(d.email.trim() ? { email: d.email.trim() } : {}),
      },
    }))
}

/** 명부 표의 열 폭 — 머리글과 각 줄이 같은 격자를 쓰도록 한 곳에서 정의한다. */
const COLS = 'grid grid-cols-[minmax(11rem,1.4fr)_8rem_10rem_7rem_9rem_minmax(10rem,1fr)_2rem] gap-2'

/**
 * 출자자(LP) 명부 편집 모달 — 조합원을 한 줄씩 쌓아 올리고 한 번에 저장한다.
 *
 * 조합원은 한 명씩 등록하는 대상이 아니라 명부 단위로 짜는 대상이라(결성 시 구성을 통째로 입력),
 * 단건 폼이 아니라 행 추가형 목록으로 둔다. 저장은 set_fund_lps RPC 한 번으로 원자 교체한다 —
 * 줄마다 따로 쏘면 중간에 실패했을 때 지분율(합 100%)이 깨진 상태로 남는다.
 *
 * 지분율·납입액 칸은 두지 않는다. 각각 약정액과 캐피탈 콜에서 파생되는 값이라 입력칸을 만드는
 * 순간 같은 값을 두 번 입력하는 구조가 된다.
 * (근거: docs_planning/3_5_workspace_fund.md §2.2)
 */
export function FundLpRosterModal({
  fundId,
  open,
  onClose,
  lps,
}: {
  fundId: string
  open: boolean
  onClose: () => void
  lps: FundLp[]
}) {
  const toast = useToast()
  const save = useSetFundLps(fundId)
  const [rows, setRows] = useState<LpDraft[]>([])

  // 열 때마다 서버 명부로 초안을 다시 짠다(닫고 다시 열면 편집이 되돌아간다).
  useEffect(() => {
    if (!open) return
    const seeded = toDrafts(lps)
    setRows(seeded.length > 0 ? seeded : [blankRow()])
    // 열리는 순간의 명부만 시드한다 — 편집 중 재조회로 입력이 덮이면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (key: string, part: Partial<LpDraft>) =>
    setRows((prev) => prev.map((d) => (d.key === key ? { ...d, ...part } : d)))

  const remove = (row: LpDraft) => {
    if (row.paidAmount > 0) {
      const ok = window.confirm(
        `${row.name}은(는) 납입액 ${row.paidAmount.toLocaleString()}원이 집계돼 있습니다. ` +
          '저장하면 캐피탈 콜 납입 현황에서도 함께 빠집니다. 계속할까요?',
      )
      if (!ok) return
    }
    setRows((prev) => prev.filter((d) => d.key !== row.key))
  }

  // 합계는 저장 전에도 실시간으로 — 약정총액이 목표와 맞는지 여기서 바로 확인한다.
  const total = rows.reduce((a, d) => a + toNum(d.amount), 0)
  const named = rows.filter((d) => d.name.trim() !== '').length
  const removedCount = lps.filter((lp) => !rows.some((d) => d.id === lp.id)).length

  const onSubmit = async () => {
    const inputs = toInputs(rows)
    if (inputs.length === 0 && lps.length === 0) {
      toast.show('조합원명을 한 줄 이상 입력하세요.', 'warning')
      return
    }
    try {
      await save.mutateAsync(inputs)
      toast.show('출자자 명부를 저장했습니다.', 'success')
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title="출자자(LP) 명부"
      footer={
        <>
          <span className="mr-auto text-body-sm text-gray-500">
            조합원 {named}명 · 약정총액{' '}
            <b className="tabular-nums text-gray-800">{total.toLocaleString()}</b>원
            {removedCount > 0 && (
              <span className="text-danger"> · 제외 {removedCount}명</span>
            )}
          </span>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={save.isPending}>
            저장
          </Button>
        </>
      }
    >
      {/* 줄이 늘어나도 머리글은 한 번만 — 라벨을 줄마다 반복하면 명부가 아니라 폼 더미가 된다. */}
      <div className="min-w-[60rem]">
        <div className={`${COLS} px-1 pb-1 text-caption font-semibold text-gray-500`}>
          <span>조합원명</span>
          <span>조합원유형</span>
          <span className="text-right">약정액(원)</span>
          <span>담당자</span>
          <span>연락처</span>
          <span>이메일</span>
          <span />
        </div>

        <div className="space-y-1.5">
          {rows.map((d) => (
            <div key={d.key} className={`${COLS} items-center`}>
              <Input
                value={d.name}
                onChange={(e) => patch(d.key, { name: e.target.value })}
                placeholder="예: 한국벤처투자(모태)"
              />
              <Select value={d.lpType} onChange={(e) => patch(d.key, { lpType: e.target.value })}>
                {FUND_LP_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Input
                inputMode="numeric"
                value={d.amount}
                onChange={(e) => patch(d.key, { amount: formatThousands(e.target.value) })}
                className="text-right tabular-nums"
                placeholder="0"
              />
              <Input value={d.manager} onChange={(e) => patch(d.key, { manager: e.target.value })} />
              <Input
                value={d.phone}
                onChange={(e) => patch(d.key, { phone: e.target.value })}
                placeholder="02-000-0000"
              />
              <Input
                type="email"
                value={d.email}
                onChange={(e) => patch(d.key, { email: e.target.value })}
              />
              <IconButton
                variant="ghost"
                danger
                label={`${d.name || '빈 줄'} 삭제`}
                onClick={() => remove(d)}
                icon={<X className="size-4" />}
              />
            </div>
          ))}
        </div>

        <Button
          variant="ghost"
          density="card"
          onClick={() => setRows((prev) => [...prev, blankRow()])}
          className="mt-2 gap-1"
        >
          <Plus className="size-4" />
          조합원 추가
        </Button>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-100 pt-3 text-body-sm text-gray-500">
          <Badge tone="neutral">파생</Badge>
          지분율은 약정액 ÷ 약정총액으로 자동 계산되고, 납입액은 캐피탈 콜에서 집계됩니다. 줄을 지우고
          저장하면 그 조합원의 납입 현황도 함께 빠집니다.
        </p>
      </div>
    </Modal>
  )
}
