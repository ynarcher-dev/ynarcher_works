import { CardShell, useToast } from '@ynarcher/ui'
import { useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { FormTopBar } from '@/components/FormTopBar'
import { useEditReasonPrompt } from '@/components/EditReasonPrompt'
import { isInvested } from '@/features/startup/startupClassification'
import { useStartupManagers } from '@/features/startup/startupPoolHooks'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { useTagTokenField } from '@/features/admin/TagTokenField'
import {
  checkDuplicateName,
  useCreateEntity,
  useUpdateEntity,
  type EntityRow,
} from '@/features/master/entityHooks'
import { StartupBasicFields } from '@/features/startup/StartupBasicFields'
import { StartupCapabilityFields } from '@/features/startup/StartupCapabilityFields'
import { StartupPerformanceFields } from '@/features/startup/StartupPerformanceFields'
import {
  readBusiness,
  readIp,
  readTeam,
  readTech,
  type IpProfile,
} from '@/features/startup/startupProfile'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'
import {
  readBusinessStatus,
  readGrowth,
  type BusinessStatusEntry,
  type GrowthMetrics,
} from '@/features/startup/startupGrowth'
import { readShareholderHistory, type ShareholderSnapshot } from '@/features/startup/startupShareholders'
import { readMedia, type MediaItem } from '@/features/startup/startupMedia'
import { StartupSummaryFields } from '@/features/startup/StartupSummaryFields'
import {
  readSummary,
  toSummaryLines,
  type StartupSummary,
} from '@/features/startup/StartupSummaryCards'
import { readIndustries } from '@/features/startup/startupGrowth'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { StartupAiFillButton } from '@/features/startup/StartupAiFillButton'
import { StartupAiFillNotice } from '@/features/startup/StartupAiFillNotice'
import { sourcesFromFiles, sourcesFromMaterials } from '@/features/startup/startupAiFill'
import { useStartupAiDraft } from '@/features/startup/useStartupAiDraft'
import { useMaterials } from '@/features/networks/materialHooks'

/** 분야 태그 다중 선택 상한(networks 전문 영역과 동일 규칙). */
const MAX_INDUSTRIES = 3

/**
 * 자료 첨부 대상 키. 스타트업 자료는 한때 IR·재무제표·기타 3분류로 나뉘어 각자 target_type을
 * 썼으나(2026-08-25 통합), 분류 키가 attachments 정책의 소유 워크스페이스 판정
 * (app.entity_key_workspace)에 없어 STARTUP이 아닌 NETWORKS 권한으로 열리는 문제가 있었고,
 * 우측 패널도 같은 카드를 셋으로 늘려 세로 자리만 먹었다. 다른 상세페이지처럼 한 곳으로 모은다.
 */
const MATERIAL_TARGET_TYPE = 'startup'

interface Props {
  /** 수정 대상 레코드 id. 없으면(신규 등록) 저장 시 새 레코드를 생성한다. */
  recordId?: string
  /** 초기값 레코드. 신규 등록은 빈 폼이므로 생략한다. */
  initial?: EntityRow | null
  /** 저장 완료 콜백. 인자로 대상 id(수정: 기존 id, 등록: 새 id)를 전달한다. */
  onDone: (id: string) => void
  onCancel: () => void
  /** 상단 바 뒤로가기 목적지(목록 경로). */
  backTo: string
}

/**
 * 스타트업 풀 상세 입력 폼(카드 섹션) — 등록·수정 공용. NETWORKS 편집 폼과 동일하게
 * 사진 입력(2MB 이하 data URL) + 기본 필드를 카드로 배치한다.
 * 단계/구분/현황/분야는 ADMIN 태그 관리 원장에서 선택한다.
 * recordId가 없으면 신규 등록 모드로, 저장 시 새 레코드를 생성하고 상세페이지로 이동한다.
 */
export function StartupDetailForm({ recordId, initial, onDone, onCancel, backTo }: Props) {
  const toast = useToast()
  const isCreate = !recordId
  const base = initial ?? ({} as EntityRow)
  const create = useCreateEntity('startups')
  // 등록 모드에서 미리 고른 자료(분류별). 저장 성공 직후 새 id로 일괄 업로드한다.
  const pending = usePendingMaterials()
  const update = useUpdateEntity('startups')
  const { askReason, reasonModal } = useEditReasonPrompt()
  const str = (key: string) => (base[key] == null ? '' : String(base[key]))
  const b = readBusiness(base)
  const t = readTeam(base)
  const tech = readTech(base)

  // 사진: NETWORKS와 동일하게 data URL로 logo_url에 저장(2MB 이하). 첨부 즉시 미리보기.
  const [photo, setPhoto] = useState<string>(str('logo_url'))
  // 핵심 역량 태그는 배열 상태로 별도 관리(폼 값과 분리).
  const [capabilities, setCapabilities] = useState<string[]>(t.capabilities ?? [])
  // 분야 태그: ADMIN 분야 관리(industry_tags — 물리명은 구 표기 그대로)에서 다중 선택(최대 3개),
  // industries(jsonb 배열)에 저장.
  const [industries, setIndustries] = useState<string[]>(readIndustries(base))
  const industryField = useTagTokenField({
    table: 'industry_tags',
    noun: '분야',
    adminMenu: '분야 관리',
    value: industries,
    onChange: setIndustries,
    max: MAX_INDUSTRIES,
  })
  // 항목별 성장 지표·연혁도 상태로 관리해 저장 시 jsonb로 통째 반영한다.
  const [growth, setGrowth] = useState<GrowthMetrics>(readGrowth(base))
  const [businessStatus, setBusinessStatus] = useState<BusinessStatusEntry[]>(readBusinessStatus(base))
  const [shareholders, setShareholders] = useState<ShareholderSnapshot[]>(readShareholderHistory(base))
  const [media, setMedia] = useState<MediaItem[]>(readMedia(base))
  // 지식재산·인증도 목록 3종을 통째 교체하는 값이라 폼 값이 아니라 상태로 든다.
  const [ip, setIp] = useState<IpProfile>(readIp(base))
  // 기업 요약 3축(강점·보완점·필요사항)은 문장 배열이라 폼 값이 아니라 상태로 들고,
  // 저장 시 business_profile 안에 함께 넣는다.
  const [summary, setSummary] = useState<StartupSummary>(readSummary(base))
  // 투자기업의 담당자·관리현황은 이 화면에서 조회만 한다(지정·전환은 FUND 투자 집행 전용).
  const { data: existingManagers } = useStartupManagers(recordId)
  const onPickPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2_000_000) {
      toast.show('이미지는 2MB 이하만 첨부할 수 있습니다.', 'warning')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
  }

  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StartupDetailFormValues>({
    values: {
      name: str('name'),
      representative: str('representative'),
      company_form: str('company_form'),
      founded_on: str('founded_on').slice(0, 10),
      biz_reg_no: str('biz_reg_no'),
      stage: str('stage'),
      // 신규 등록 기본 구분은 '미지정 기업'(other, 2026-09-06). 종전 기본값은 발굴이었는데,
      // 아직 무엇인지 모르는 기업까지 전부 발굴기업으로 들어가 그 수가 부풀려졌다.
      management_status: str('management_status') || 'other',
      pool_status: str('pool_status'),
      discovery_source: str('discovery_source'),
      location: str('location'),
      address_detail: str('address_detail'),
      email: str('email'),
      phone: str('phone'),
      oneLiner: b.oneLiner ?? '',
      businessModel: b.businessModel ?? '',
      targetMarket: b.targetMarket ?? '',
      revenueModel: b.revenueModel ?? '',
      salesChannel: b.salesChannel ?? '',
      supplyMode: b.supplyMode ?? '',
      product: tech.product ?? '',
      devStage: tech.devStage ?? '',
      coreTech: tech.coreTech ?? '',
      devInsourcing: tech.devInsourcing ?? '',
      differentiator: tech.differentiator ?? '',
      founderStrength: t.founderStrength ?? '',
      orgComposition: t.orgComposition ?? '',
      hiringPlan: t.hiringPlan ?? '',
      // 옛 행에는 새 칸이 없다 — 폼 값은 항상 채워 둬야 컨트롤이 비제어로 떨어지지 않는다.
      members: (t.members ?? []).map((m) => ({
        name: m.name ?? '',
        role: m.role ?? '',
        background: m.background ?? '',
        employment: m.employment ?? '',
        joinedAt: m.joinedAt ?? '',
        hasEquity: Boolean(m.hasEquity),
      })),
      advisors: (t.advisors ?? []).map((a) => ({
        name: a.name ?? '',
        affiliation: a.affiliation ?? '',
        role: a.role ?? '',
      })),
    },
  })

  // 'AI 작성하기' — 초안은 원장이 아니라 **지금 폼에 적힌 값 위에** 얹는다(useStartupAiDraft).
  // 읽을 자료는 모드가 정한다: 수정은 이미 올라간 첨부, 등록은 아직 안 올라간 보류 파일이다.
  const { data: uploaded } = useMaterials(MATERIAL_TARGET_TYPE, isCreate ? undefined : recordId)
  const ai = useStartupAiDraft({
    getValues,
    reset,
    state: { capabilities, ip, growth, businessStatus, shareholders, summary },
    setCapabilities,
    setIp,
    setGrowth,
    setBusinessStatus,
    setShareholders,
  })
  const aiSources = isCreate
    ? sourcesFromFiles(pending.files(MATERIAL_TARGET_TYPE))
    : sourcesFromMaterials(uploaded ?? [])

  // 투자기업으로의 전환·담당자 지정·관리현황은 FUND 투자 집행에서만 처리한다(20260724190000).
  // 이 화면에서는 투자기업이면 구분을 읽기 전용으로 보여주고, 비투자면 발굴/보육/미지정 간에만 바꾼다.
  const alreadyInvested = isInvested(str('management_status'))
  // 투자기업의 딜메이커(리드 담당자) 이름 — 읽기 전용 표시용.
  const leadName = existingManagers?.find((m) => m.is_lead)?.user?.name ?? null

  const onSubmit = async (v: StartupDetailFormValues) => {
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      representative: v.representative.trim() || null,
      company_form: v.company_form.trim() || null,
      founded_on: v.founded_on || null,
      biz_reg_no: v.biz_reg_no.trim() || null,
      // 분야: industries(배열)가 SSOT. 대표값(첫 번째)은 하위 호환용으로 industry 스칼라에 미러링.
      industries,
      industry: industries[0] ?? null,
      stage: v.stage.trim() || null,
      // 구분(management_status)과 관리현황(pool_status)은 아래에서 투자기업 여부로 분기한다
      // (투자기업은 이 화면에서 건드리지 않는다). 구 '기타 분류' 자유 라벨
      // (management_status_etc)은 입력 칸을 걷으면서 저장 대상에서도 뺐다 — 컬럼은 남겨 두되
      // 화면이 건드리지 않으므로, 옛 값이 있는 행은 저장해도 그 값이 지워지지 않는다.
      discovery_source: v.discovery_source.trim() || null,
      // 소재지(location_tags 태그명)·상세주소.
      location: v.location.trim() || null,
      address_detail: v.address_detail.trim() || null,
      email: v.email.trim() || null,
      // 연락처는 숫자만 저장한다(NETWORKS 관례).
      phone: v.phone.replace(/\D/g, '') || null,
      logo_url: photo || null,
      // 역량 밴드 4종은 카드 하나에 컬럼 하나로 저장한다(통째 교체 모델이라 한 컬럼에 두 카드가
      // 살면 한쪽만 고쳐도 다른 쪽 값을 함께 써야 하고, 그 왕복에서 빠뜨린 키가 조용히 지워진다).
      business_profile: {
        oneLiner: v.oneLiner.trim(),
        businessModel: v.businessModel.trim(),
        targetMarket: v.targetMarket.trim(),
        revenueModel: v.revenueModel.trim(),
        salesChannel: v.salesChannel.trim(),
        supplyMode: v.supplyMode.trim(),
        // 요약 3축: 빈 줄은 떨어뜨리고 상한(3문장)을 다시 강제한다.
        strengths: toSummaryLines(summary.strengths),
        improvements: toSummaryLines(summary.improvements),
        needs: toSummaryLines(summary.needs),
      },
      // 구 business_profile.competitiveEdge는 여기 differentiator로 옮겨졌다(20260906140000).
      // 저장할 때 옛 키를 다시 쓰지 않으므로 값이 두 곳으로 갈라지지 않는다.
      tech_profile: {
        product: v.product.trim(),
        devStage: v.devStage.trim(),
        coreTech: v.coreTech.trim(),
        devInsourcing: v.devInsourcing.trim(),
        differentiator: v.differentiator.trim(),
      },
      team_profile: {
        founderStrength: v.founderStrength.trim(),
        orgComposition: v.orgComposition.trim(),
        hiringPlan: v.hiringPlan.trim(),
        members: v.members
          .map((m) => ({
            name: m.name.trim(),
            role: m.role.trim(),
            background: m.background.trim(),
            employment: m.employment.trim(),
            joinedAt: m.joinedAt.trim(),
            hasEquity: Boolean(m.hasEquity),
          }))
          .filter((m) => m.name),
        advisors: v.advisors
          .map((a) => ({ name: a.name.trim(), affiliation: a.affiliation.trim(), role: a.role.trim() }))
          .filter((a) => a.name),
        capabilities,
      },
      // 지식재산·인증: 이름(명칭·인증명·과제명)이 있는 항목만 저장한다. 건수는 저장하지 않는다.
      ip_profile: {
        rights: ip.rights
          .map((r) => ({
            kind: (r.kind ?? '').trim(),
            title: (r.title ?? '').trim(),
            no: (r.no ?? '').trim() || null,
            status: (r.status ?? '').trim() || null,
            date: (r.date ?? '').trim() || null,
          }))
          .filter((r) => r.title || r.no),
        certifications: ip.certifications
          .map((c) => ({
            name: (c.name ?? '').trim(),
            agency: (c.agency ?? '').trim() || null,
            date: (c.date ?? '').trim() || null,
          }))
          .filter((c) => c.name),
        govProjects: ip.govProjects
          .map((g) => ({
            name: (g.name ?? '').trim(),
            role: (g.role ?? '').trim() || null,
            period: (g.period ?? '').trim() || null,
            amount: g.amount ?? null,
          }))
          .filter((g) => g.name),
      },
      business_profile_updated_at: new Date().toISOString(),
      // 항목별 성장 지표(재무·매출·고용은 연도 있는 행만, 투자는 기준월 있는 행만), 연혁: 날짜 또는 내용이 있는 항목만 저장한다.
      growth_metrics: {
        // 트랙션은 지표명과 기준월이 둘 다 있는 줄만, 고객은 이름이 있는 줄만 저장한다.
        traction: growth.traction
          .map((e) => ({
            metric: (e.metric ?? '').trim(),
            unit: (e.unit ?? '').trim() || null,
            period: (e.period ?? '').trim(),
            value: e.value ?? null,
          }))
          .filter((e) => e.metric && e.period),
        customers: growth.customers
          .map((e) => ({
            name: (e.name ?? '').trim(),
            kind: (e.kind ?? '').trim() || null,
            date: (e.date ?? '').trim() || null,
          }))
          .filter((e) => e.name),
        finance: growth.finance.filter((e) => e.year).map((e) => ({ ...e, year: Number(e.year) })),
        revenue: growth.revenue.filter((e) => e.year).map((e) => ({ ...e, year: Number(e.year) })),
        employee: growth.employee.filter((e) => e.year).map((e) => ({ ...e, year: Number(e.year) })),
        investment: growth.investment
          .filter((e) => (e.date ?? '').trim() !== '')
          .map((e) => ({
            date: e.date.trim(),
            round: (e.round ?? '').trim() || null,
            valuation: e.valuation ?? null,
            fundingAmount: e.fundingAmount ?? null,
            investor: (e.investor ?? '').trim() || null,
          })),
      },
      business_status: businessStatus.filter((s) => (s.date ?? '') !== '' || (s.content ?? '').trim() !== ''),
      // 주주 구성(변경 시점별 이력): 각 시점에서 이름 있는 주주만 남기고, 주주가 하나도 없는 시점은 제외한다.
      shareholders: shareholders
        .map((snap) => ({
          date: (snap.date ?? '').trim(),
          holders: snap.holders
            .map((h) => ({ name: h.name.trim(), shares: h.shares ?? null, percentage: h.percentage ?? null }))
            .filter((h) => h.name),
        }))
        .filter((snap) => snap.holders.length > 0),
      // 미디어: URL이 있는 항목만 저장한다.
      media: media
        .map((m) => ({
          url: (m.url ?? '').trim(),
          kind: (m.kind ?? '').trim() || null,
          title: m.title ?? null,
          description: m.description ?? null,
          image: m.image ?? null,
          siteName: m.siteName ?? null,
        }))
        .filter((m) => m.url),
    }
    // 구분·관리현황 분기: 투자기업은 이 화면에서 건드리지 않는다(전환·담당자·현황은 FUND 전용).
    //   · 비투자(발굴/보육/기타): 선택한 구분을 직접 저장하고 pool_status 는 없음(트리거도 강제).
    //   · 투자기업: management_status/pool_status 를 payload 에서 빼 서버 값 그대로 둔다.
    if (alreadyInvested) {
      delete payload.management_status
      delete payload.pool_status
    } else {
      payload.management_status = v.management_status
      payload.pool_status = null
    }

    try {
      if (isCreate) {
        // 등록: 이름 중복 검사 후 새 레코드를 만들고, 생성 로그를 남긴 뒤 상세페이지로 이동한다.
        // (신규 스타트업은 항상 비투자로 만든다 — 투자기업 전환은 FUND 투자 집행에서만 일어난다.)
        if (await checkDuplicateName('startups', payload.name as string)) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        // 변동 이력 'created'는 원장 트리거가 같은 트랜잭션에서 남긴다(20260721150000).
        const newId = await create.mutateAsync(payload)
        // 등록 전에 첨부한 자료를 새 레코드에 업로드한다(분류 슬롯 = target_type).
        const { failed } = await pending.flush(newId)
        toast.show(
          failed > 0
            ? `스타트업을 등록했지만 자료 ${failed}건 업로드에 실패했습니다. 상세페이지에서 다시 첨부해 주세요.`
            : '스타트업을 등록했습니다.',
          failed > 0 ? 'warning' : 'success',
        )
        onDone(newId)
      } else {
        // 수정은 사유를 받아야 확정된다. 변동 이력 'edited'는 원장 트리거가 사유(note)와 함께
        // 남기며, 값이 실제로 바뀐 경우에만 기록되므로 무변경 저장은 이력에 남지 않는다.
        const reason = await askReason()
        if (!reason) return
        await update.mutateAsync({ id: recordId, values: payload, reason })
        toast.show('스타트업 정보를 수정했습니다.', 'success')
        onDone(recordId)
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {reasonModal}
      {/* 상단 바(뒤로가기 ↔ 취소·확정) — 조회 화면의 '수정' 버튼과 같은 자리를 쓴다. */}
      <FormTopBar
        backTo={backTo}
        mode={isCreate ? 'create' : 'edit'}
        onCancel={onCancel}
        busy={isSubmitting}
      />

      {ai.outcome && <StartupAiFillNotice outcome={ai.outcome} />}

      {/* 상세페이지와 동일한 3열 배치: 좌측 2/3 편집 카드 + 우측 1/3 자료 관리 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 조회 화면과 같은 밴드 순서 — 정체(사진·기본 데이터) → 요약 → 역량 → 실적.
            편집 화면의 묶음이 조회 화면과 어긋나면 무엇을 고치러 들어왔는지가 흐려지고,
            저장한 값이 어느 카드에 가서 붙는지도 예측할 수 없다. */}
        <div className="space-y-4 lg:col-span-2">
          <StartupBasicFields
            register={register}
            control={control}
            errors={errors}
            industryField={industryField}
            photo={photo}
            setPhoto={setPhoto}
            onPickPhoto={onPickPhoto}
            alreadyInvested={alreadyInvested}
            poolStatus={str('pool_status')}
            leadName={leadName}
          />

          {/* 요약 구분선(상세페이지와 동일 — 역량보다 위) */}
          <SectionHeading title="요약" />

          {/* 요약 3축 입력. 구분선이 이미 '요약'을 말하므로 카드 제목은 두지 않는다
              (같은 이름을 두 번 세우면 층이 하나 늘어난 것처럼 읽힌다). */}
          <CardShell>
            <StartupSummaryFields summary={summary} setSummary={setSummary} />
          </CardShell>

          <StartupCapabilityFields
            register={register}
            control={control}
            capabilities={capabilities}
            setCapabilities={setCapabilities}
            ip={ip}
            setIp={setIp}
          />

          <StartupPerformanceFields
            growth={growth}
            setGrowth={setGrowth}
            businessStatus={businessStatus}
            setBusinessStatus={setBusinessStatus}
            shareholders={shareholders}
            setShareholders={setShareholders}
            media={media}
            setMedia={setMedia}
          />
        </div>

        {/* 우측(1/3): 자료 관리 한 곳. 등록 모드에서는 보류 첨부 후 저장 시 함께 업로드한다. */}
        <div className="space-y-4 lg:col-span-1">
          {isCreate ? (
            <PendingMaterialPanel slot={MATERIAL_TARGET_TYPE} pending={pending} />
          ) : (
            <MaterialPanel targetType={MATERIAL_TARGET_TYPE} targetId={recordId} />
          )}

          {/* AI 작성하기는 자료 관리 바로 아래에 선다 — 이 기능이 읽는 것이 위 카드의 파일이라,
              재료에서 떨어뜨리면 무엇을 근거로 채우는지가 화면에서 사라진다. 등록 모드에서는
              아직 올라가지 않은 보류 파일을 그대로 보내고, 그 파일은 서버가 저장하지 않는다. */}
          <StartupAiFillButton
            sources={aiSources}
            snapshot={ai.snapshot}
            startupId={recordId}
            companyName={base.name ? String(base.name) : undefined}
            onFilled={ai.applyDraft}
          />
        </div>
      </div>

      {/* 액션 버튼(그리드 아래 전체 폭) */}
    </form>
  )
}
