import {
  Badge,
  Button,
  InfoField,
  Input,
  Modal,
  TokenMultiSelect,
  useToast,
  type BadgeTone,
} from '@ynarcher/ui'
import { Check, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TagSelect } from '@/features/admin/TagSelect'
import { useEmployees } from '@/features/management/hooks'
import {
  MANAGEMENT_STATUS_TONE,
  managementStatusLabel,
  type ManagementStatus,
} from '@/features/startup/startupClassification'
import {
  usePromoteToInvested,
  useStartupManagers,
} from '@/features/startup/startupPoolHooks'
import {
  useCreateInvestment,
  useFundPurposes,
  useSetInvestmentPurposes,
  useUpdateInvestment,
  useStartupOptions,
  type FundPurpose,
  type FundPurposeKind,
  type Investment,
  type StartupOption,
} from '@/features/fund/hooks'
import { FUND_PURPOSE_KIND_LABEL } from '@/features/fund/fundListHooks'

/** 빈 문자열 → null, 그 외 콤마 제거 후 숫자. 파싱 실패 시 null. */
function numOrNull(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

/** 금액 입력 표기: 숫자만 남겨 천단위 콤마를 넣는다(자릿수 무제한, Number 변환 없이 정밀 보존). */
function formatThousands(s: string): string {
  const digits = s.replace(/[^\d]/g, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** YYYY-MM-DD 앞 10자리. 없으면 '-'. */
function shortDate(v: string | null): string {
  return v ? v.slice(0, 10) : '-'
}

/**
 * 자사 펀드 투자 집행 등록·수정 모달.
 *
 * 화면을 세 갈래로 나눈다.
 *  1) **피투자사(검색 → 상속)** — 기업명을 검색해 고르면 회사개요(대표자·설립일·소재지·업종·한줄소개·
 *     구분·관리현황)가 startups 마스터에서 읽기 전용으로 딸려 온다.
 *  2) **투자 정보(직접 입력)** — 투자일·라운드·투자방식·기업 가치(Pre/Post)·집행액.
 *  3) **투자기업 담당·현황** — 딜메이커(리드 담당자)·지원 담당자·관리현황.
 *
 * 등록하면 투자 레코드를 만든 뒤 promote_to_invested RPC 로 이 스타트업을 **투자기업으로 전환**하고
 * 딜메이커를 담당자로 지정한다. 전환은 이 흐름(자사 투자 집행)에서만 서버가 허용한다(20260724190000).
 * 딜메이커가 지정되면 그 사람과 관리자만 이후 이 투자기업 정보를 수정·삭제할 수 있다.
 */
export function InvestmentFormModal({
  fundId,
  fundName,
  open,
  onClose,
  editing,
}: {
  fundId: string
  /** 이 투자가 속한 펀드명. 맥락 표시용(읽기 전용, 선택 불가). */
  fundName: string
  open: boolean
  onClose: () => void
  /** 수정 대상. 없으면 신규 등록. */
  editing?: Investment | null
}) {
  const toast = useToast()
  const { data: startups } = useStartupOptions()
  const { data: employees } = useEmployees()
  const create = useCreateInvestment(fundId)
  const update = useUpdateInvestment(fundId)
  const promote = usePromoteToInvested()
  const { data: purposes } = useFundPurposes(fundId)
  const setInvPurposes = useSetInvestmentPurposes(fundId)

  const [startupId, setStartupId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [investedAt, setInvestedAt] = useState('')
  const [round, setRound] = useState('')
  const [method, setMethod] = useState('')
  const [valuation, setValuation] = useState('')
  const [postValuation, setPostValuation] = useState('')
  const [amount, setAmount] = useState('')
  const [leadId, setLeadId] = useState('')
  const [supportIds, setSupportIds] = useState<string[]>([])
  const [poolStatus, setPoolStatus] = useState('')
  // 이 투자가 부합하는 규약 목적(fund_purposes.id 목록).
  const [purposeIds, setPurposeIds] = useState<string[]>([])

  // 선택된 스타트업의 기존 담당자(투자기업이면 존재). 딜메이커 프리필에 쓴다.
  const { data: existingManagers } = useStartupManagers(startupId || undefined)

  // 모달을 열 때(신규/수정) 현재 대상 값으로 초기화한다.
  useEffect(() => {
    if (!open) return
    setStartupId(editing?.startup_id ?? '')
    setKeyword('')
    setInvestedAt(editing?.invested_at?.slice(0, 10) ?? '')
    setRound(editing?.stage ?? '')
    setMethod(editing?.investment_method ?? '')
    setValuation(editing?.valuation != null ? formatThousands(String(editing.valuation)) : '')
    setPostValuation(
      editing?.post_valuation != null ? formatThousands(String(editing.post_valuation)) : '',
    )
    setAmount(editing?.amount != null ? formatThousands(String(editing.amount)) : '')
    setLeadId('')
    setSupportIds([])
    setPoolStatus(editing?.startup_pool_status ?? '')
    setPurposeIds(editing?.purpose_ids ?? [])
  }, [open, editing])

  // 기존 담당자가 있으면(=이미 투자기업) 딜메이커/지원 담당자를 그 값으로 채운다.
  // 담당자가 없는(미투자) 스타트업이면 건드리지 않아 사용자의 선택을 유지한다.
  useEffect(() => {
    if (!existingManagers || existingManagers.length === 0) return
    const lead = existingManagers.find((m) => m.is_lead)
    setLeadId(lead?.user_id ?? '')
    setSupportIds(existingManagers.filter((m) => !m.is_lead).map((m) => m.user_id))
  }, [existingManagers])

  // 선택된 피투자사의 회사개요(상속 표시용). 목록 로딩 전이거나 비활성 대상이면 수정 데이터로 폴백한다.
  const selected: StartupOption | null = useMemo(() => {
    if (!startupId) return null
    const found = (startups ?? []).find((s) => s.id === startupId)
    if (found) return found
    if (editing && editing.startup_id === startupId) {
      return {
        id: startupId,
        name: editing.startup_name ?? '-',
        one_liner: editing.startup_one_liner,
        representative: editing.startup_representative,
        founded_on: editing.startup_founded_on,
        location: editing.startup_location,
        industries: editing.startup_industries,
        management_status: editing.startup_management_status,
        pool_status: editing.startup_pool_status,
        dealmaker_name: editing.dealmaker_name,
      }
    }
    return null
  }, [startupId, startups, editing])

  // 이름 부분일치 후보(최대 50).
  const candidates = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return (startups ?? [])
      .filter((s) => kw === '' || s.name.toLowerCase().includes(kw))
      .slice(0, 50)
  }, [startups, keyword])

  const busy = create.isPending || update.isPending || promote.isPending || setInvPurposes.isPending

  // 임직원 id → 이름(칩 표시용). 목록에 없으면 기존 담당자 임베드에서 폴백한다.
  const empName = (id: string) =>
    (employees ?? []).find((e) => e.id === id)?.name ??
    existingManagers?.find((m) => m.user_id === id)?.user?.name ??
    '(이름 없음)'

  // TokenMultiSelect(칩이 입력 필드 안에 남는 다중 선택기)용 임직원 최소 형태·헬퍼.
  const personOpts: PersonOpt[] = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
  }))
  // 선택된 id를 칩으로 되살릴 때 — 이름은 empName 폴백을 거친다(목록 밖 기존 담당자 대응).
  const personObj = (id: string): PersonOpt => ({ id, name: empName(id), email: null })

  // 피투자사를 바꾸면 담당자·현황 선택을 초기화한다(새 스타트업 기준으로 다시 채운다).
  const pickStartup = (id: string) => {
    setStartupId(id)
    setKeyword('')
    setLeadId('')
    setSupportIds([])
    setPoolStatus((startups ?? []).find((s) => s.id === id)?.pool_status ?? '')
  }

  // 담당자·현황이 기존값과 달라졌는지(수정 시 promote 재호출 여부 판정).
  const ownershipChanged = useMemo(() => {
    const curLead = (existingManagers ?? []).find((m) => m.is_lead)?.user_id ?? ''
    const curSupports = new Set((existingManagers ?? []).filter((m) => !m.is_lead).map((m) => m.user_id))
    const supSet = new Set(supportIds.filter((id) => id && id !== leadId))
    const supportsDiff =
      curSupports.size !== supSet.size || [...supSet].some((id) => !curSupports.has(id))
    return (
      curLead !== leadId ||
      supportsDiff ||
      (poolStatus || null) !== ((selected?.pool_status ?? '') || null)
    )
  }, [existingManagers, supportIds, leadId, poolStatus, selected])

  const onSubmit = async () => {
    if (!startupId) {
      toast.show('피투자사를 선택하세요.', 'warning')
      return
    }
    const amt = numOrNull(amount)
    if (amt == null || amt <= 0) {
      toast.show('집행액을 입력하세요.', 'warning')
      return
    }
    // 신규 등록은 전환과 동시에 딜메이커 지정이 필수(서버 RLS도 리드 필수). 수정은 강제하지 않는다.
    if (!editing && !leadId) {
      toast.show('딜메이커(리드 담당자)를 지정하세요.', 'warning')
      return
    }
    const values = {
      startup_id: startupId,
      invested_at: investedAt || null,
      stage: round.trim() || null,
      investment_method: method || null,
      valuation: numOrNull(valuation),
      post_valuation: numOrNull(postValuation),
      amount: amt,
    }
    const supports = supportIds.filter((id) => id && id !== leadId)
    // 라운드(투자단계)를 투자기업 단계(startups.stage)로 전파. 승격 RPC 인자로 함께 넘긴다.
    const stage = round.trim() || null
    const stageChanged = stage !== ((editing?.stage ?? '') || null)
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        // 딜메이커가 지정돼 있고 담당자·현황·단계가 바뀐 경우에만 승격 RPC로 동기화(투자 필드만 고쳤으면 건너뛴다).
        if (leadId && (ownershipChanged || stageChanged)) {
          await promote.mutateAsync({
            startupId,
            leadUserId: leadId,
            supportUserIds: supports,
            poolStatus: poolStatus || null,
            stage,
          })
        }
        // 규약 목적 부합 매핑 교체(비었으면 전체 해제).
        await setInvPurposes.mutateAsync({ investmentId: editing.id, purposeIds })
        toast.show('투자를 수정했습니다.', 'success')
      } else {
        // 투자 레코드를 먼저 만든 뒤(커밋) 승격 → 서버가 '자사 투자 집행 존재'를 확인하고 전환을 허용한다.
        const invId = await create.mutateAsync(values)
        await promote.mutateAsync({
          startupId,
          leadUserId: leadId,
          supportUserIds: supports,
          poolStatus: poolStatus || null,
          stage,
        })
        await setInvPurposes.mutateAsync({ investmentId: invId, purposeIds })
        toast.show('투자를 등록하고 투자기업으로 전환했습니다.', 'success')
      }
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? '투자 집행 수정' : '투자 집행 등록'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {editing ? '수정' : '등록'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 1) 피투자사 — 검색해 고르면 회사개요가 상속되어 딸려 온다(읽기 전용). */}
        <section className="space-y-2">
          <h4 className="text-body-sm font-semibold text-gray-500">
            피투자사 <span className="font-normal">— 기업을 검색하면 회사개요가 함께 불러와집니다</span>
          </h4>
          {selected ? (
            <SelectedCompany company={selected} onChange={() => pickStartup('')} />
          ) : (
            <CompanySearch
              keyword={keyword}
              onKeyword={setKeyword}
              candidates={candidates}
              onPick={pickStartup}
            />
          )}
        </section>

        {/* 2) 투자 정보 — 사용자가 직접 입력하는 값. */}
        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h4 className="text-body-sm font-semibold text-gray-500">투자 정보 (직접 입력)</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="투자펀드" className="sm:col-span-2">
              {/* 이 모달이 속한 펀드로 고정 — 선택 불가(비활성). */}
              <Input value={fundName} disabled readOnly className="bg-gray-50 text-gray-600" />
            </Field>
            <Field label="투자일">
              <Input type="date" value={investedAt} onChange={(e) => setInvestedAt(e.target.value)} />
            </Field>
            <Field label="라운드">
              {/* 선택지는 ADMIN 태그(investment_stage_tags)에서 채운다. 이 값이 투자기업의 단계로 전파된다. */}
              <TagSelect
                table="investment_stage_tags"
                value={round}
                onChange={setRound}
                placeholder="선택"
              />
            </Field>
            <Field label="투자방식">
              {/* 선택지는 ADMIN 태그(investment_method_tags)에서 실시간으로 채운다. */}
              <TagSelect
                table="investment_method_tags"
                value={method}
                onChange={setMethod}
                placeholder="선택"
              />
            </Field>
            <Field label="집행액">
              <Input
                inputMode="numeric"
                className="text-right tabular-nums"
                value={amount}
                onChange={(e) => setAmount(formatThousands(e.target.value))}
              />
            </Field>
            <Field label="기업 가치(Pre)">
              <Input
                inputMode="numeric"
                className="text-right tabular-nums"
                value={valuation}
                onChange={(e) => setValuation(formatThousands(e.target.value))}
              />
            </Field>
            <Field label="기업 가치(Post)">
              <Input
                inputMode="numeric"
                className="text-right tabular-nums"
                value={postValuation}
                onChange={(e) => setPostValuation(formatThousands(e.target.value))}
              />
            </Field>
          </div>
        </section>

        {/* 3) 규약 목적 부합 — 이 기업이 부합하는 주목적/특수목적을 체크한다(N:N). */}
        <section className="space-y-2 border-t border-gray-100 pt-4">
          <h4 className="text-body-sm font-semibold text-gray-500">
            규약 목적 부합 <span className="font-normal">— 이 기업이 부합하는 목적을 선택하세요</span>
          </h4>
          <PurposeChecklist
            purposes={purposes ?? []}
            selected={purposeIds}
            onToggle={(pid) =>
              setPurposeIds((prev) =>
                prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
              )
            }
          />
        </section>

        {/* 4) 투자기업 담당·현황 — 딜메이커 지정 = 편집 권한 부여. */}
        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h4 className="text-body-sm font-semibold text-gray-500">투자기업 담당 · 현황</h4>
          <p className="text-body-sm text-gray-500">
            등록하면 이 기업이 <b>투자기업으로 전환</b>되고, 지정한 딜메이커와 관리자만 이후 정보를 수정·삭제할
            수 있습니다.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="딜메이커 (리드 담당자)">
              {/* 단일 선택(max 1): 칩이 입력 필드 안에 남고, 지우면 다시 검색 가능. */}
              <TokenMultiSelect<PersonOpt>
                selected={leadId ? [personObj(leadId)] : []}
                onChange={(next) => setLeadId(next.at(-1)?.id ?? '')}
                options={personOpts}
                getKey={(e) => e.id}
                getLabel={(e) => e.name ?? '(이름 없음)'}
                getMeta={(e) => e.email ?? undefined}
                getSearchText={(e) => `${e.name ?? ''} ${e.email ?? ''}`}
                max={1}
                placeholder="이름으로 검색"
              />
            </Field>
            <Field label="관리현황">
              <TagSelect
                table="company_status_tags"
                value={poolStatus}
                onChange={setPoolStatus}
                placeholder="선택"
              />
            </Field>
            <Field label="지원 담당자" className="sm:col-span-2">
              {/* 다중 선택: 칩이 입력 필드 안에 인라인으로 쌓이고, 딜메이커는 후보에서 제외. */}
              <TokenMultiSelect<PersonOpt>
                selected={supportIds.filter((id) => id !== leadId).map(personObj)}
                onChange={(next) => setSupportIds(next.map((e) => e.id))}
                options={personOpts.filter((e) => e.id !== leadId)}
                getKey={(e) => e.id}
                getLabel={(e) => e.name ?? '(이름 없음)'}
                getMeta={(e) => e.email ?? undefined}
                getSearchText={(e) => `${e.name ?? ''} ${e.email ?? ''}`}
                placeholder="이름으로 검색해 추가"
              />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  )
}

/**
 * 규약 목적 부합 체크리스트. 펀드의 의무투자·주목적·특수목적을 구분별로 묶어 체크박스로 나열한다.
 * 한 기업이 여러 목적에 동시 부합할 수 있으므로 다중 선택이다. 목적이 없으면 안내 문구.
 */
function PurposeChecklist({
  purposes,
  selected,
  onToggle,
}: {
  purposes: FundPurpose[]
  selected: string[]
  onToggle: (purposeId: string) => void
}) {
  if (purposes.length === 0) {
    return (
      <p className="text-body-sm text-gray-500">
        이 펀드에 등록된 목적이 없습니다. 펀드 편집의 목적관리에서 먼저 추가하세요.
      </p>
    )
  }
  const groups: FundPurposeKind[] = ['MANDATORY', 'MAIN', 'SPECIAL']
  return (
    <div className="space-y-3">
      {groups.map((kind) => {
        const rows = purposes.filter((p) => p.kind === kind)
        if (rows.length === 0) return null
        return (
          <div key={kind} className="space-y-1.5">
            <p className="text-body-sm font-medium text-gray-600">{FUND_PURPOSE_KIND_LABEL[kind]}</p>
            {/* 항목마다 카드(테두리 박스)로 감싼 단일 세로 목록. 선택 시 브랜드색으로 강조. */}
            <div className="space-y-1.5">
              {rows.map((p) => {
                const checked = selected.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-radius-md border px-3 py-2 text-body-sm transition-colors duration-fast ${
                      checked
                        ? 'border-brand bg-brand-25'
                        : 'border-gray-200 bg-gray-25 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(p.id)}
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                    />
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-gray-800">
                      {p.label}
                    </span>
                    {p.target_pct != null && (
                      <span className="mt-px shrink-0 tabular-nums text-gray-500">{p.target_pct}%</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 라벨 + 입력 한 쌍. */
function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="text-body font-medium text-gray-800">{label}</label>
      {children}
    </div>
  )
}

/**
 * 검색 입력 + 후보 오버레이 공용 콤보박스. 처음엔 접혀 있고 포커스·입력 시에만 열린다.
 * 오버레이는 모달의 스크롤 컨테이너에 잘리지 않도록 **포털(document.body)에 fixed 로** 그려
 * 입력창 위치에 맞춰 띄운다(스크롤·리사이즈 시 재정렬). 목록 내용은 renderList 로 주입한다.
 */
function Combobox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  renderList,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel: string
  /** close: 항목 선택 후 오버레이를 닫는 콜백. */
  renderList: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const reposition = useCallback(() => {
    if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect())
  }, [])

  // 열려 있는 동안 스크롤·리사이즈를 따라 위치를 다시 잡는다(capture=true 로 모달 내부 스크롤도 포착).
  useEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  return (
    // 컨테이너 밖으로 포커스가 나가면 닫는다(포털 항목 클릭은 onMouseDown preventDefault로 포커스를 유지).
    <div
      ref={anchorRef}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-gray-400" />
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-9"
      />
      {open &&
        rect &&
        createPortal(
          <div
            // fixed 로 뷰포트 기준 배치 → 모달 overflow 에 잘리지 않는다. 모달보다 위(z 큰 값).
            style={{
              position: 'fixed',
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
              zIndex: 9999,
            }}
            // 항목 클릭이 blur 보다 먼저 나가 목록이 사라지는 것을 막는다(포커스 유지).
            onMouseDown={(e) => e.preventDefault()}
            className="rounded-radius-md border border-gray-200 bg-white shadow-lg"
          >
            {renderList(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** 기업명 검색 입력 + 후보 오버레이. 행을 누르면 선택된다. */
function CompanySearch({
  keyword,
  onKeyword,
  candidates,
  onPick,
}: {
  keyword: string
  onKeyword: (v: string) => void
  candidates: StartupOption[]
  onPick: (id: string) => void
}) {
  return (
    <Combobox
      value={keyword}
      onChange={onKeyword}
      placeholder="기업명으로 검색"
      ariaLabel="피투자사 검색"
      renderList={(close) =>
        candidates.length === 0 ? (
          <p className="px-3 py-4 text-body-sm text-gray-500">일치하는 기업이 없습니다.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto">
            {candidates.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(s.id)
                    close()
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-fast hover:bg-gray-50"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-gray-900">
                    <span className="font-medium">{s.name}</span>
                    {s.one_liner && <span className="text-gray-500"> · {s.one_liner}</span>}
                  </span>
                  {s.dealmaker_name && (
                    <span className="shrink-0 text-body-sm text-gray-400">{s.dealmaker_name}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )
      }
    />
  )
}

/** TokenMultiSelect(칩이 입력 필드 안에 남는 다중 선택)용 임직원 최소 형태. */
type PersonOpt = { id: string; name: string | null; email: string | null }

/** 선택된 피투자사의 회사개요(startups 상속값) 읽기 전용 표시 + 변경 버튼. */
function SelectedCompany({
  company,
  onChange,
}: {
  company: StartupOption
  onChange: () => void
}) {
  const categoryLabel = managementStatusLabel(company.management_status)
  const categoryTone: BadgeTone = company.management_status
    ? MANAGEMENT_STATUS_TONE[company.management_status as ManagementStatus] ?? 'neutral'
    : 'neutral'

  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full border border-brand bg-brand text-white">
            <Check className="size-3.5" />
          </span>
          <h3 className="text-title-sm font-bold text-gray-900">{company.name}</h3>
          {categoryLabel && <Badge tone={categoryTone}>{categoryLabel}</Badge>}
          {company.pool_status && <Badge tone="neutral">{company.pool_status}</Badge>}
          {company.industries.map((ind) => (
            <Badge key={ind} tone="info">
              {ind}
            </Badge>
          ))}
        </div>
        <Button variant="ghost" density="card" onClick={onChange} className="shrink-0">
          다른 기업 선택
        </Button>
      </div>
      {company.one_liner && <p className="mb-3 text-body text-gray-600">{company.one_liner}</p>}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <InfoField label="대표자" value={company.representative || '-'} />
        <InfoField label="설립일" value={shortDate(company.founded_on)} />
        <InfoField label="소재지" value={company.location || '-'} />
      </div>
    </div>
  )
}
