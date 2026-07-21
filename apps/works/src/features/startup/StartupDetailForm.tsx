import { Button, CardShell, Input, Select, TagChip, TextArea, cardText, useToast } from '@ynarcher/ui'
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useEmployees } from '@/features/management/hooks'
import {
  MANAGEMENT_STATUS_OPTIONS,
  isInvested,
} from '@/features/startup/startupClassification'
import {
  usePromoteToInvested,
  useStartupManagers,
} from '@/features/startup/startupPoolHooks'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { TagSelect } from '@/features/admin/TagSelect'
import { useTags } from '@/features/admin/hooks'
import { STARTUP_MATERIAL_SECTIONS } from '@/features/startup/startupMaterials'
import {
  checkDuplicateName,
  recordContribution,
  useCreateEntity,
  useUpdateEntity,
  type EntityRow,
} from '@/features/networks/hooks'
import { StartupBusinessTeamFields } from '@/features/startup/StartupBusinessTeamFields'
import { readBusiness, readTeam } from '@/features/startup/StartupBusinessTeamCard'
import { StartupGrowthFields } from '@/features/startup/StartupGrowthFields'
import {
  readBusinessStatus,
  readGrowth,
  type BusinessStatusEntry,
  type GrowthMetrics,
} from '@/features/startup/startupGrowth'
import { StartupShareholderFields } from '@/features/startup/StartupShareholderFields'
import { readShareholderHistory, type ShareholderSnapshot } from '@/features/startup/startupShareholders'
import { StartupMediaFields } from '@/features/startup/StartupMediaFields'
import { readMedia, type MediaItem } from '@/features/startup/startupMedia'
import { readIndustries } from '@/features/startup/startupGrowth'
import { SectionHeading } from '@/features/startup/SectionHeading'

/** 회사 형태 고정 선택지. */
const COMPANY_FORMS = ['법인', '개인', '예비'] as const

/** 산업 태그 다중 선택 상한(networks 전문 분야와 동일 규칙). */
const MAX_INDUSTRIES = 3

export interface StartupDetailFormValues {
  name: string
  representative: string
  company_form: string
  founded_on: string
  biz_reg_no: string
  stage: string
  management_status: string
  management_status_etc: string
  pool_status: string
  discovery_source: string
  location: string
  address_detail: string
  email: string
  phone: string
  // 비즈니스 & 팀 역량(통합 수정에 포함)
  oneLiner: string
  businessModel: string
  targetMarket: string
  competitiveEdge: string
  founderStrength: string
  members: { name: string; role: string; background: string }[]
}

/** 라벨 + 입력 래퍼. `className`으로 그리드 스팬 등을 지정할 수 있다. */
function Field({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-body font-medium text-gray-800">
        {label}
        {required && <span className="text-brand"> *</span>}
      </p>
      {children}
    </div>
  )
}

interface Props {
  /** 수정 대상 레코드 id. 없으면(신규 등록) 저장 시 새 레코드를 생성한다. */
  recordId?: string
  /** 초기값 레코드. 신규 등록은 빈 폼이므로 생략한다. */
  initial?: EntityRow | null
  /** 저장 완료 콜백. 인자로 대상 id(수정: 기존 id, 등록: 새 id)를 전달한다. */
  onDone: (id: string) => void
  onCancel: () => void
}

/**
 * 스타트업 풀 상세 입력 폼(카드 섹션) — 등록·수정 공용. NETWORKS 편집 폼과 동일하게
 * 사진 입력(2MB 이하 data URL) + 기본 필드를 카드로 배치한다.
 * 단계/구분/현황/산업은 ADMIN 태그 관리 원장에서 선택한다.
 * recordId가 없으면 신규 등록 모드로, 저장 시 새 레코드를 생성하고 상세페이지로 이동한다.
 */
export function StartupDetailForm({ recordId, initial, onDone, onCancel }: Props) {
  const toast = useToast()
  const isCreate = !recordId
  const base = initial ?? ({} as EntityRow)
  const create = useCreateEntity('startups')
  // 등록 모드에서 미리 고른 자료(분류별). 저장 성공 직후 새 id로 일괄 업로드한다.
  const pending = usePendingMaterials()
  const update = useUpdateEntity('startups')
  const str = (key: string) => (base[key] == null ? '' : String(base[key]))
  const b = readBusiness(base)
  const t = readTeam(base)

  // 사진: NETWORKS와 동일하게 data URL로 logo_url에 저장(2MB 이하). 첨부 즉시 미리보기.
  const [photo, setPhoto] = useState<string>(str('logo_url'))
  // 핵심 역량 태그는 배열 상태로 별도 관리(폼 값과 분리).
  const [capabilities, setCapabilities] = useState<string[]>(t.capabilities ?? [])
  // 산업 태그: ADMIN 산업 관리(industry_tags)에서 다중 선택(최대 3개), industries(jsonb 배열)에 저장.
  const { data: industryTags } = useTags('industry_tags')
  const [industries, setIndustries] = useState<string[]>(readIndustries(base))
  const toggleIndustry = (name: string) => {
    setIndustries((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : prev.length >= MAX_INDUSTRIES
          ? prev
          : [...prev, name],
    )
  }
  // 항목별 성장 지표·연혁도 상태로 관리해 저장 시 jsonb로 통째 반영한다.
  const [growth, setGrowth] = useState<GrowthMetrics>(readGrowth(base))
  const [businessStatus, setBusinessStatus] = useState<BusinessStatusEntry[]>(readBusinessStatus(base))
  const [shareholders, setShareholders] = useState<ShareholderSnapshot[]>(readShareholderHistory(base))
  const [media, setMedia] = useState<MediaItem[]>(readMedia(base))
  // 담당자(투자기업 전용): 리드 1 + 지원 N. 기존 투자기업 편집 시 현재 담당자로 초기화한다.
  const { data: employees } = useEmployees()
  const { data: existingManagers } = useStartupManagers(recordId)
  const promote = usePromoteToInvested()
  const [leadId, setLeadId] = useState<string>('')
  const [supportIds, setSupportIds] = useState<string[]>([])
  useEffect(() => {
    if (!existingManagers) return
    const lead = existingManagers.find((m) => m.is_lead)
    setLeadId(lead?.user_id ?? '')
    setSupportIds(existingManagers.filter((m) => !m.is_lead).map((m) => m.user_id))
  }, [existingManagers])
  const toggleSupport = (id: string) =>
    setSupportIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
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
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StartupDetailFormValues>({
    values: {
      name: str('name'),
      representative: str('representative'),
      company_form: str('company_form'),
      founded_on: str('founded_on').slice(0, 10),
      biz_reg_no: str('biz_reg_no'),
      stage: str('stage'),
      // 신규 등록 기본 구분은 발굴(sourced). DB 기본값과 일치.
      management_status: str('management_status') || 'sourced',
      management_status_etc: str('management_status_etc'),
      pool_status: str('pool_status'),
      discovery_source: str('discovery_source'),
      location: str('location'),
      address_detail: str('address_detail'),
      email: str('email'),
      phone: str('phone'),
      oneLiner: b.oneLiner ?? '',
      businessModel: b.businessModel ?? '',
      targetMarket: b.targetMarket ?? '',
      competitiveEdge: b.competitiveEdge ?? '',
      founderStrength: t.founderStrength ?? '',
      members: t.members ?? [],
    },
  })

  // 구분에 따라 관리현황(투자)·기타 라벨(기타)·담당자(투자) 노출을 분기한다.
  const watchedStatus = watch('management_status')
  const willInvest = isInvested(watchedStatus)

  const onSubmit = async (v: StartupDetailFormValues) => {
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      representative: v.representative.trim() || null,
      company_form: v.company_form.trim() || null,
      founded_on: v.founded_on || null,
      biz_reg_no: v.biz_reg_no.trim() || null,
      // 산업: industries(배열)가 SSOT. 대표값(첫 번째)은 하위 호환용으로 industry 스칼라에 미러링.
      industries,
      industry: industries[0] ?? null,
      stage: v.stage.trim() || null,
      // 관리현황(pool_status)·기타 라벨은 구분에 따라 게이팅한다. management_status는 아래에서
      // 비투자만 직접 저장하고, 투자는 승격 RPC(promote_to_invested)로 원자 처리한다.
      management_status_etc: v.management_status === 'other' ? v.management_status_etc.trim() || null : null,
      pool_status: isInvested(v.management_status) ? v.pool_status.trim() || null : null,
      discovery_source: v.discovery_source.trim() || null,
      // 소재지(location_tags 태그명)·상세주소.
      location: v.location.trim() || null,
      address_detail: v.address_detail.trim() || null,
      email: v.email.trim() || null,
      // 연락처는 숫자만 저장한다(NETWORKS 관례).
      phone: v.phone.replace(/\D/g, '') || null,
      logo_url: photo || null,
      // 비즈니스 & 팀 역량(통합 저장).
      business_profile: {
        oneLiner: v.oneLiner.trim(),
        businessModel: v.businessModel.trim(),
        targetMarket: v.targetMarket.trim(),
        competitiveEdge: v.competitiveEdge.trim(),
      },
      team_profile: {
        founderStrength: v.founderStrength.trim(),
        members: v.members
          .map((m) => ({ name: m.name.trim(), role: m.role.trim(), background: m.background.trim() }))
          .filter((m) => m.name),
        capabilities,
      },
      business_profile_updated_at: new Date().toISOString(),
      // 항목별 성장 지표(재무·매출·고용은 연도 있는 행만, 투자는 기준월 있는 행만), 연혁: 날짜 또는 내용이 있는 항목만 저장한다.
      growth_metrics: {
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
          round: (snap.round ?? '').trim(),
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
    // 투자기업 승격 여부. 투자면 리드 담당자 필수(서버 RLS도 강제).
    const goInvested = isInvested(v.management_status)
    if (goInvested && !leadId) {
      toast.show('투자기업은 리드 담당자를 지정해야 합니다.', 'warning')
      return
    }
    // 비투자는 구분을 직접 저장. 투자는 승격 RPC가 세팅하므로 직접 저장에서 제외한다
    // (신규는 DB 기본값 sourced 로 INSERT 후 승격, 기존은 현재 값 유지 후 승격).
    if (goInvested) delete payload.management_status
    else payload.management_status = v.management_status

    const supports = supportIds.filter((id) => id && id !== leadId)

    try {
      if (isCreate) {
        // 등록: 이름 중복 검사 후 새 레코드를 만들고, 생성 로그를 남긴 뒤 상세페이지로 이동한다.
        if (await checkDuplicateName('startups', payload.name as string)) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        const newId = await create.mutateAsync(payload)
        await recordContribution({ table: 'startups', id: newId, action: 'created', source: 'manual' })
        // 투자 등록: sourced 로 생성된 레코드를 담당자와 함께 원자 승격한다.
        if (goInvested) {
          await promote.mutateAsync({ startupId: newId, leadUserId: leadId, supportUserIds: supports })
        }
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
        await update.mutateAsync({ id: recordId, values: payload })
        await recordContribution({ table: 'startups', id: recordId, action: 'edited', source: 'manual' })
        // 투자 전환/담당자 재구성: 승격 RPC로 investment 세팅 + 담당자 동기화.
        if (goInvested) {
          await promote.mutateAsync({ startupId: recordId, leadUserId: leadId, supportUserIds: supports })
        }
        toast.show('스타트업 정보를 수정했습니다.', 'success')
        onDone(recordId)
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  type TagFieldName = 'stage' | 'management_status' | 'pool_status' | 'location'
  const tagField = (name: TagFieldName, table: string, label: string) => (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <TagSelect
            table={table}
            value={field.value ?? ''}
            onChange={field.onChange}
            placeholder={`${label} 선택`}
          />
        )}
      />
    </Field>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* 상세페이지와 동일한 3열 배치: 좌측 2/3 편집 카드 + 우측 1/3 자료 관리 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 사진 → 기본 데이터 → 기업 개요(비즈니스·주주·성장) → 미디어 */}
        <div className="space-y-4 lg:col-span-2">
          {/* 사진 카드(NETWORKS 편집 폼과 동일) */}
          <CardShell>
            <p className="mb-3 text-caption font-medium text-gray-700">사진</p>
            <div className="flex items-center gap-4">
              <PhotoBox src={photo} />
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-radius-md border border-gray-300 px-3 py-1.5 text-body text-gray-700 transition-colors hover:bg-gray-50">
                  사진 첨부
                  <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
                </label>
                {photo && (
                  <Button type="button" variant="secondary" onClick={() => setPhoto('')}>
                    삭제
                  </Button>
                )}
              </div>
            </div>
          </CardShell>

          {/* 기본 데이터 카드 */}
          <CardShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="한 줄 소개" className="sm:col-span-2">
                <Input placeholder="한 줄 소개(기업명 아래에 표시됩니다)" {...register('oneLiner')} />
              </Field>
              <Field label="기업명" required>
                <Input invalid={Boolean(errors.name)} {...register('name', { required: '기업명은 필수입니다.' })} />
                {errors.name && <p className="mt-1 text-caption text-danger">{errors.name.message}</p>}
              </Field>
              <Field label="대표자명">
                <Input {...register('representative')} />
              </Field>
              <Field label="회사 형태">
                <Select {...register('company_form')}>
                  <option value="">선택</option>
                  {COMPANY_FORMS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="설립일">
                <Input type="date" {...register('founded_on')} />
              </Field>
              <Field label="사업자등록번호">
                <Input {...register('biz_reg_no')} />
              </Field>
              <Field label="산업" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {(industryTags ?? []).map((tag) => {
                    const on = industries.includes(tag.name)
                    const disabled = !on && industries.length >= MAX_INDUSTRIES
                    return (
                      <TagChip
                        key={tag.id}
                        selected={on}
                        disabled={disabled}
                        onClick={() => toggleIndustry(tag.name)}
                      >
                        {tag.name}
                      </TagChip>
                    )
                  })}
                  {(industryTags ?? []).length === 0 && (
                    <span className="text-caption text-gray-600">
                      등록된 산업 태그가 없습니다. (ADMIN › 산업 관리)
                    </span>
                  )}
                </div>
                <p className="mt-1 text-caption text-gray-700">산업 관리 태그에서 최대 {MAX_INDUSTRIES}개 선택</p>
              </Field>
              {tagField('stage', 'investment_stage_tags', '단계')}
              <Field label="구분">
                <Select {...register('management_status')}>
                  {MANAGEMENT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {watchedStatus === 'other' && (
                <Field label="기타 분류">
                  <Input {...register('management_status_etc')} placeholder="기타 구분 라벨(선택)" />
                </Field>
              )}
              {/* 관리현황(pool_status)은 투자기업에서만 노출·저장한다. */}
              {willInvest && tagField('pool_status', 'company_status_tags', '관리현황')}
              <Field label="발굴 경로" className="sm:col-span-2">
                <Controller
                  control={control}
                  name="discovery_source"
                  render={({ field }) => (
                    <TextArea
                      rows={3}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="발굴 경로를 자유롭게 입력하세요(길게 작성 가능)."
                    />
                  )}
                />
              </Field>
              {tagField('location', 'location_tags', '소재지')}
              <Field label="상세주소">
                <Input {...register('address_detail')} placeholder="상세주소를 입력하세요" />
              </Field>
              <Field label="이메일">
                <Input {...register('email')} />
              </Field>
              <Field label="연락처">
                <Input {...register('phone')} />
              </Field>
            </div>
          </CardShell>

          {/* 담당자 카드(투자기업 전용): 리드 1 + 지원 N. 승격 RPC로 원자 지정된다. */}
          {willInvest && (
            <CardShell>
              <h2 className={`mb-1 ${cardText.title}`}>담당자 (투자기업)</h2>
              <p className="mb-4 text-caption text-gray-700">
                투자기업은 리드 담당자 지정이 필수입니다. 지정 담당자와 관리자만 이후 정보를 수정·삭제할 수 있습니다.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="리드 담당자" required>
                  <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                    <option value="">선택</option>
                    {(employees ?? []).map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name ?? '(이름 없음)'}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="지원 담당자" className="sm:col-span-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(employees ?? [])
                      .filter((emp) => emp.id !== leadId)
                      .map((emp) => {
                        const on = supportIds.includes(emp.id)
                        return (
                          <TagChip
                            key={emp.id}
                            selected={on}
                            onClick={() => toggleSupport(emp.id)}
                          >
                            {emp.name ?? '(이름 없음)'}
                          </TagChip>
                        )
                      })}
                    {(employees ?? []).length === 0 && (
                      <span className="text-caption text-gray-600">등록된 임직원이 없습니다.</span>
                    )}
                  </div>
                </Field>
              </div>
            </CardShell>
          )}

          {/* 기업 개요 구분선(상세페이지와 동일) */}
          <SectionHeading title="기업 개요" />

          {/* 비즈니스 & 팀 역량 카드(통합 수정에 포함) */}
          <CardShell>
            <h2 className={`mb-4 ${cardText.title}`}>비즈니스 &amp; 팀 역량</h2>
            <StartupBusinessTeamFields
              register={register}
              control={control}
              capabilities={capabilities}
              setCapabilities={setCapabilities}
            />
          </CardShell>

          {/* 주주 구성 카드(통합 수정에 포함) */}
          <CardShell>
            <h2 className={`mb-4 ${cardText.title}`}>주주 구성</h2>
            <StartupShareholderFields history={shareholders} setHistory={setShareholders} />
          </CardShell>

          {/* 성장 지표 카드(통합 수정에 포함) */}
          <CardShell>
            <h2 className={`mb-4 ${cardText.title}`}>성장 지표</h2>
            <StartupGrowthFields
              growth={growth}
              setGrowth={setGrowth}
              businessStatus={businessStatus}
              setBusinessStatus={setBusinessStatus}
            />
          </CardShell>

          {/* 미디어 구분선(상세페이지와 동일) */}
          <SectionHeading title="미디어" />

          {/* 미디어(언론기사·영상 등): URL 첨부 시 메타데이터 자동 로드 */}
          <CardShell>
            <StartupMediaFields media={media} setMedia={setMedia} />
          </CardShell>
        </div>

        {/* 우측(1/3): 자료 관리(IR·재무제표·기타). 등록 모드에서는 보류 첨부 후 저장 시 함께 업로드한다. */}
        <div className="space-y-4 lg:col-span-1">
          {STARTUP_MATERIAL_SECTIONS.map((s) =>
            isCreate ? (
              <PendingMaterialPanel key={s.type} slot={s.type} pending={pending} title={s.title} />
            ) : (
              <MaterialPanel key={s.type} targetType={s.type} targetId={recordId} title={s.title} />
            ),
          )}
        </div>
      </div>

      {/* 액션 버튼(그리드 아래 전체 폭) */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isCreate ? '등록' : '저장'}
        </Button>
      </div>
    </form>
  )
}
