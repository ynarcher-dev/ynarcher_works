import {
  Badge,
  Button,
  Card,
  Checkbox,
  cardText,
  Field,
  InfoField,
  Input,
  Modal,
  PickList,
  PickRow,
  TokenMultiSelect,
  useToast,
} from '@ynarcher/ui'
import { Check, Search } from 'lucide-react'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TagSelect } from '@/features/admin/TagSelect'
import { useEmployees } from '@/features/management/hooks'
import {
  CLOSED_POOL_STATUS,
  managementStatusLabel,
  managementStatusTone,
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
import { StartupPickRow } from '@/features/startup/StartupPickRow'

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
  onDelete,
}: {
  fundId: string
  /** 이 투자가 속한 펀드명. 맥락 표시용(읽기 전용, 선택 불가). */
  fundName: string
  open: boolean
  onClose: () => void
  /** 수정 대상. 없으면 신규 등록. */
  editing?: Investment | null
  /** 수정 모드에서 좌측 하단 삭제 버튼. 미지정이면 삭제 버튼을 숨긴다(신규 등록엔 없음). */
  onDelete?: (inv: Investment) => void
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
  // 폐업일자(YYYY-MM-DD). 관리현황이 '폐업'일 때만 입력·저장된다.
  const [closedOn, setClosedOn] = useState('')
  // 이 투자가 부합하는 규약 목적(fund_purposes.id 목록).
  const [purposeIds, setPurposeIds] = useState<string[]>([])

  // 선택된 스타트업의 기존 담당자(투자기업이면 존재). 딜메이커 프리필에 쓴다.
  const { data: existingManagers } = useStartupManagers(startupId || undefined)

  /**
   * 이 폼이 지금 무엇을 편집하고 있는가 — 열림 여부 + 대상 id 하나. **초기화의 방아쇠는 이것뿐이다.**
   *
   * 종전에는 `editing` 객체 자체가 방아쇠였는데, 그 객체는 목록 질의(`useInvestments`)가 다시
   * 돌 때마다 새로 만들어진다(react-query는 창을 다시 포커스하면 배경에서 다시 가져온다).
   * 그래서 폼을 열어 둔 채 잠깐 다른 창을 봤다 오면 **같은 레코드인데도 초기화가 다시 돌아**
   * 딜메이커·지원 담당자가 빈 값으로 되돌아갔고(그 둘은 여기서 '' 로 비운 뒤 담당자 조회가
   * 채우는데, 그 조회 결과는 그대로라 다시 채우지 않는다), 그 상태로 저장하면 담당자가 통째로
   * 바뀌었다. 편집 중인 초안은 배경 재조회가 건드릴 수 없어야 한다.
   */
  const formSession = open ? (editing?.id ?? 'new') : null
  // 초기화가 읽는 값은 최신 레코드여야 하지만, **읽는다고 다시 도는 것은 아니다**.
  const editingRef = useRef(editing)
  editingRef.current = editing
  // 담당자 프리필을 이미 적용한 대상(세션 + 피투자사). 대상마다 한 번만 적용해야 사용자가 지운
  // 담당자를 배경 재조회가 되살리지 않고, 신규 등록에서 기업을 바꾸면 그 기업의 담당자로 다시 찬다.
  const managerFilledFor = useRef<string | null>(null)

  // 모달을 열 때(신규/수정) 현재 대상 값으로 초기화한다.
  useEffect(() => {
    if (!formSession) return
    const editing = editingRef.current
    managerFilledFor.current = null
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
    setClosedOn(editing?.startup_closed_on?.slice(0, 10) ?? '')
    setPurposeIds(editing?.purpose_ids ?? [])
  }, [formSession])

  // 기존 담당자가 있으면(=이미 투자기업) 딜메이커/지원 담당자를 그 값으로 채운다.
  // 담당자가 없는(미투자) 스타트업이면 건드리지 않아 사용자의 선택을 유지한다.
  useEffect(() => {
    const fillKey = formSession && startupId ? `${formSession}:${startupId}` : null
    if (!fillKey || managerFilledFor.current === fillKey) return
    if (!existingManagers || existingManagers.length === 0) return
    managerFilledFor.current = fillKey
    const lead = existingManagers.find((m) => m.is_lead)
    setLeadId(lead?.user_id ?? '')
    setSupportIds(existingManagers.filter((m) => !m.is_lead).map((m) => m.user_id))
  }, [formSession, startupId, existingManagers])

  // 선택된 피투자사의 회사개요(상속 표시용). 목록 로딩 전이거나 비활성 대상이면 수정 데이터로 폴백한다.
  const selected: StartupOption | null = useMemo(() => {
    if (!startupId) return null
    const found = (startups ?? []).find((s) => s.id === startupId)
    if (found) return found
    if (editing && editing.startup_id === startupId) {
      return {
        id: startupId,
        name: editing.startup_name ?? '-',
        logo_url: editing.startup_logo_url,
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
    setClosedOn('')
  }

  // 담당자·현황이 기존값과 달라졌는지(수정 시 promote 재호출 여부 판정).
  const ownershipChanged = useMemo(() => {
    const curLead = (existingManagers ?? []).find((m) => m.is_lead)?.user_id ?? ''
    const curSupports = new Set((existingManagers ?? []).filter((m) => !m.is_lead).map((m) => m.user_id))
    const supSet = new Set(supportIds.filter((id) => id && id !== leadId))
    const supportsDiff =
      curSupports.size !== supSet.size || [...supSet].some((id) => !curSupports.has(id))
    const curClosed = (editing?.startup_closed_on?.slice(0, 10) ?? '') || null
    return (
      curLead !== leadId ||
      supportsDiff ||
      (poolStatus || null) !== ((selected?.pool_status ?? '') || null) ||
      (closedOn || null) !== curClosed
    )
  }, [existingManagers, supportIds, leadId, poolStatus, closedOn, selected, editing])

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
    // 신규 등록은 전환과 동시에 딜메이커 지정이 필수(서버 RLS도 리드 필수).
    if (!editing && !leadId) {
      toast.show('딜메이커(리드 담당자)를 지정하세요.', 'warning')
      return
    }
    // 관리현황도 전환과 함께 정한다(2026-09-10 사용자 지정). 종전에는 선택 사항이라 비운 채
    // 전환되면 그 뒤로 다시 묻는 자리가 없어 영영 빈 채로 남았다 — 실제로 투자기업 여섯 곳 중
    // 세 곳이 그 상태였고, 목록·상세·헤더 칩이 전부 '-'로 섰다. 지금 이 기업이 어느 상태인지는
    // 전환하는 사람이 가장 잘 알고, 그 순간이 아니면 물을 자리가 없다.
    //
    // **수정에서는 막지 않는다** — 집행액 한 칸 고치러 들어온 사람에게 남이 비워 둔 칸을
    // 채우게 하면, 고치려던 일이 그 칸에 막힌다. 빈 값을 채우는 것은 이 화면에서 언제든 된다.
    if (!editing && !poolStatus) {
      toast.show('관리현황을 선택하세요.', 'warning')
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
    // 폐업일자는 관리현황이 폐업일 때만 의미가 있다(그 외 상태로 바뀌면 서버가 NULL 로 정리).
    const effectiveClosedOn = poolStatus === CLOSED_POOL_STATUS ? closedOn || null : null
    // 수정에서도 담당·현황을 건드렸다면 딜메이커(정)가 있어야 한다 — 그 값들을 저장하는 유일한
    // 경로가 promote RPC이고, 서버가 리드를 필수로 요구한다(`lead_required`). 종전에는 리드가
    // 비어 있으면 이 호출을 **조용히 건너뛰어**, 관리현황을 바꾸고 '수정'을 눌러도 성공 메시지만
    // 뜨고 값은 그대로였다. 저장되지 않는다는 사실은 저장 전에 말해야 한다.
    if (editing && !leadId && (ownershipChanged || stageChanged)) {
      toast.show('딜메이커(정)를 지정해야 담당·현황이 저장됩니다.', 'warning')
      return
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        // 담당자·현황·단계가 바뀐 경우에만 승격 RPC로 동기화(투자 필드만 고쳤으면 건너뛴다).
        if (ownershipChanged || stageChanged) {
          await promote.mutateAsync({
            startupId,
            leadUserId: leadId,
            supportUserIds: supports,
            poolStatus: poolStatus || null,
            stage,
            closedOn: effectiveClosedOn,
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
          closedOn: effectiveClosedOn,
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
      dismissible={false}
      open={open}
      onClose={onClose}
      size="lg"
      sectioned
      title={editing ? '투자 집행 수정' : '투자 집행 등록'}
      footer={
        <>
          {/* 삭제는 수정 모드에서만 — 좌측 하단(mr-auto 로 취소·수정과 갈라 세운다). */}
          {editing && onDelete && (
            <Button
              variant="outline-danger"
              className="mr-auto"
              onClick={() => onDelete(editing)}
              disabled={busy}
            >
              삭제
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {editing ? '수정' : '등록'}
          </Button>
        </>
      }
    >
      <>
        {/* 1) 피투자사 — 검색해 고르면 회사개요가 상속되어 딸려 온다(읽기 전용). */}
        <Card
          title="기업 선택"
          help="기업을 검색하면 회사개요가 함께 불러와집니다"
          actions={
            selected && (
              <Button variant="outline" onClick={() => pickStartup('')} className="shrink-0">
                다른 기업 선택
              </Button>
            )
          }
        >
          {selected ? (
            <SelectedCompany company={selected} />
          ) : (
            <CompanySearch
              keyword={keyword}
              onKeyword={setKeyword}
              candidates={candidates}
              onPick={pickStartup}
            />
          )}
        </Card>

        {/* 2) 투자 정보 — 사용자가 직접 입력하는 값. */}
        <Card title="투자 정보" help="투자일·라운드·투자방식·기업 가치·집행액을 직접 입력합니다">
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
        </Card>

        {/* 3) 규약 목적 부합 — 이 기업이 부합하는 주목적/특수목적을 체크한다(N:N). */}
        <Card title="목적" help="이 기업이 부합하는 규약 목적을 선택하세요">
          <PurposeChecklist
            purposes={purposes ?? []}
            selected={purposeIds}
            onToggle={(pid) =>
              setPurposeIds((prev) =>
                prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
              )
            }
          />
        </Card>

        {/* 4) 투자기업 담당·현황 — 딜메이커 지정 = 편집 권한 부여. */}
        <Card
          title="투자기업 담당 · 현황"
          help="등록하면 이 기업이 투자기업으로 전환되고, 지정한 딜메이커와 관리자만 이후 정보를 수정·삭제할 수 있습니다."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="딜메이커(정)">
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
            <Field label="딜메이커(부)">
              {/* 다중 선택(지원 담당자): 칩이 입력 필드 안에 인라인으로 쌓이고, 딜메이커(정)는 후보에서 제외. */}
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
            {/* 담당자(딜메이커·지원) 아래 줄에 관리현황을 두고, 폐업이면 그 옆에 폐업일자를 노출한다. */}
            <Field label="관리현황" required={!editing}>
              <TagSelect
                table="company_status_tags"
                value={poolStatus}
                onChange={setPoolStatus}
                placeholder="선택"
              />
            </Field>
            {/* 관리현황이 폐업일 때만 폐업일자를 입력받는다(다른 상태로 바꾸면 서버가 NULL 로 정리). */}
            {poolStatus === CLOSED_POOL_STATUS && (
              <Field label="폐업일자">
                <Input type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} />
              </Field>
            )}
          </div>
        </Card>
      </>
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
                  <Checkbox
                    key={p.id}
                    checked={checked}
                    onChange={() => onToggle(p.id)}
                    boxed
                    // 여러 줄로 접히는 긴 목적 문구라 체크박스를 첫 줄에 맞춰 세운다.
                    wrapperClassName="flex items-start"
                    className="mt-0.5"
                    label={
                      <>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                          {p.label}
                        </span>
                        {p.target_pct != null && (
                          <span className="mt-px shrink-0 tabular-nums text-gray-500">
                            {p.target_pct}%
                          </span>
                        )}
                      </>
                    }
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * 검색 입력 + 후보 오버레이 공용 콤보박스. 접혀 있다가 **글자를 치면** 열린다(포커스만으로는 열지 않는다).
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
          // 글자가 있을 때만 연다 — 포커스만으로 열면 전체 목록이 아래 입력을 가린다.
          setOpen(e.target.value.trim() !== '')
        }}
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
            // fixed 로 뷰포트 기준 배치 → 모달 overflow 에 잘리지 않는다. 위치만 인라인이고
            // 층은 z 토큰이 답한다(모달 위 포털 팝오버 = z-popover, 8_z_index §3.1).
            style={{
              position: 'fixed',
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
            }}
            // 항목 클릭이 blur 보다 먼저 나가 목록이 사라지는 것을 막는다(포커스 유지).
            onMouseDown={(e) => e.preventDefault()}
            className="z-popover rounded-radius-md border border-gray-300 bg-white shadow-popover"
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
        <PickList isEmpty={candidates.length === 0} empty="일치하는 기업이 없습니다.">
          {candidates.map((s) => (
            <PickRow
              key={s.id}
              onClick={() => {
                onPick(s.id)
                close()
              }}
            >
              {/* 행의 규격은 공용 `StartupPickRow`가 소유한다 — 같은 원장을 한 줄로 고르는
                  자리가 여기와 M&A BUYER 둘이라, 값을 각자 적으면 한쪽만 고쳐지는 날 갈린다. */}
              <StartupPickRow value={s} />
            </PickRow>
          ))}
        </PickList>
      }
    />
  )
}

/** TokenMultiSelect(칩이 입력 필드 안에 남는 다중 선택)용 임직원 최소 형태. */
type PersonOpt = { id: string; name: string | null; email: string | null }

/** 선택된 피투자사의 회사개요(startups 상속값) 읽기 전용 표시. '다른 기업 선택'은 상위 섹션 헤더가 소유한다. */
function SelectedCompany({ company }: { company: StartupOption }) {
  const categoryLabel = managementStatusLabel(company.management_status)
  const categoryTone = managementStatusTone(company.management_status)

  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-50/60 p-4">
      {/* 헤더: 로고 + 이름·업종 배지 + 부제 + 상태·분류 칩 — 상세 모달(InvestmentDetailModal) 헤더 구성과 동일. */}
      <div className="flex items-start gap-4">
        <PhotoBox src={company.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* 선택 완료 표시(체크). 이름·업종은 그 옆에 이어 붙는다. */}
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-brand bg-brand text-white">
              <Check className="size-3.5" />
            </span>
            <h3 className="text-title-md font-bold text-gray-900">{company.name}</h3>
            {company.industries.map((ind) => (
              <Badge key={ind} tone="neutral">
                {ind}
              </Badge>
            ))}
          </div>
          {/* 부제 = 한줄소개 */}
          <p className={`mt-1 ${cardText.subtitle}`}>{company.one_liner || '-'}</p>
          {/* 상태·분류 칩: 구분=주 분류, 관리현황=라이브 상태(점). */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {categoryLabel && <Badge tone={categoryTone}>{categoryLabel}</Badge>}
            {company.pool_status && (
              <Badge tone="success" dot>
                {company.pool_status}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
        <InfoField label="대표자" value={company.representative || '-'} />
        <InfoField label="설립일" value={shortDate(company.founded_on)} />
        <InfoField label="소재지" value={company.location || '-'} />
      </div>
    </div>
  )
}
