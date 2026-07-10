import { Button, Input, TextArea, useToast } from '@ynarcher/ui'
import { useState, type ChangeEvent, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { TagSelect } from '@/features/admin/TagSelect'
import { STARTUP_MATERIAL_SECTIONS } from '@/features/startup/startupMaterials'
import { recordContribution, useUpdateEntity, type EntityRow } from '@/features/networks/hooks'
import { StartupBusinessTeamFields } from '@/features/startup/StartupBusinessTeamFields'
import { readBusiness, readTeam } from '@/features/startup/StartupBusinessTeamCard'
import { StartupGrowthFields } from '@/features/startup/StartupGrowthFields'
import {
  readBusinessStatus,
  readMetrics,
  type BusinessStatusEntry,
  type GrowthMetric,
} from '@/features/startup/startupGrowth'
import { StartupShareholderFields } from '@/features/startup/StartupShareholderFields'
import { readShareholderHistory, type ShareholderSnapshot } from '@/features/startup/startupShareholders'
import { StartupMediaFields } from '@/features/startup/StartupMediaFields'
import { readMedia, type MediaItem } from '@/features/startup/startupMedia'

export interface StartupDetailFormValues {
  name: string
  representative: string
  biz_reg_no: string
  industry: string
  stage: string
  management_status: string
  pool_status: string
  discovery_source: string
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
  recordId: string
  initial: EntityRow
  onDone: () => void
  onCancel: () => void
}

/**
 * 스타트업 풀 상세페이지 편집 폼(카드 섹션). NETWORKS 편집 폼과 동일하게
 * 사진 입력(2MB 이하 data URL) + 기본 필드를 카드로 배치한다.
 * 단계/구분/현황/산업은 ADMIN 태그 관리 원장에서 선택한다.
 */
export function StartupDetailForm({ recordId, initial, onDone, onCancel }: Props) {
  const toast = useToast()
  const update = useUpdateEntity('startups')
  const str = (key: string) => (initial[key] == null ? '' : String(initial[key]))
  const b = readBusiness(initial)
  const t = readTeam(initial)

  // 사진: NETWORKS와 동일하게 data URL로 logo_url에 저장(2MB 이하). 첨부 즉시 미리보기.
  const [photo, setPhoto] = useState<string>(str('logo_url'))
  // 핵심 역량 태그는 배열 상태로 별도 관리(폼 값과 분리).
  const [capabilities, setCapabilities] = useState<string[]>(t.capabilities ?? [])
  // 성장 지표·비즈니스 현황도 배열 상태로 관리해 저장 시 jsonb로 통째 반영한다.
  const [metrics, setMetrics] = useState<GrowthMetric[]>(readMetrics(initial))
  const [businessStatus, setBusinessStatus] = useState<BusinessStatusEntry[]>(readBusinessStatus(initial))
  const [shareholders, setShareholders] = useState<ShareholderSnapshot[]>(readShareholderHistory(initial))
  const [media, setMedia] = useState<MediaItem[]>(readMedia(initial))
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
    formState: { errors, isSubmitting },
  } = useForm<StartupDetailFormValues>({
    values: {
      name: str('name'),
      representative: str('representative'),
      biz_reg_no: str('biz_reg_no'),
      industry: str('industry'),
      stage: str('stage'),
      management_status: str('management_status'),
      pool_status: str('pool_status'),
      discovery_source: str('discovery_source'),
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

  const onSubmit = async (v: StartupDetailFormValues) => {
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      representative: v.representative.trim() || null,
      biz_reg_no: v.biz_reg_no.trim() || null,
      industry: v.industry.trim() || null,
      stage: v.stage.trim() || null,
      management_status: v.management_status.trim() || null,
      pool_status: v.pool_status.trim() || null,
      discovery_source: v.discovery_source.trim() || null,
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
      // 성장 지표: 연도 있는 행만, 비즈니스 현황: 날짜 또는 내용이 있는 항목만 저장한다.
      growth_metrics: metrics.filter((m) => m.year).map((m) => ({ ...m, year: Number(m.year) })),
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
    try {
      await update.mutateAsync({ id: recordId, values: payload })
      await recordContribution({ table: 'startups', id: recordId, action: 'edited', source: 'manual' })
      toast.show('스타트업 정보를 수정했습니다.', 'success')
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  type TagFieldName = 'industry' | 'stage' | 'management_status' | 'pool_status'
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* 사진 카드(NETWORKS 편집 폼과 동일) */}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <p className="mb-3 text-caption font-medium text-gray-600">사진</p>
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
      </div>

      {/* 기본 데이터 카드 */}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
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
          <Field label="사업자등록번호">
            <Input {...register('biz_reg_no')} />
          </Field>
          {tagField('industry', 'industry_tags', '산업')}
          {tagField('stage', 'investment_stage_tags', '단계')}
          {tagField('management_status', 'company_category_tags', '구분')}
          {tagField('pool_status', 'company_status_tags', '현황')}
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
          <Field label="이메일">
            <Input {...register('email')} />
          </Field>
          <Field label="연락처">
            <Input {...register('phone')} />
          </Field>
        </div>
      </div>

      {/* 비즈니스 & 팀 역량 카드(통합 수정에 포함) */}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-body font-semibold text-gray-900">비즈니스 &amp; 팀 역량</h2>
        <StartupBusinessTeamFields
          register={register}
          control={control}
          capabilities={capabilities}
          setCapabilities={setCapabilities}
        />
      </div>

      {/* 성장 지표 카드(통합 수정에 포함) */}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-body font-semibold text-gray-900">성장 지표</h2>
        <StartupGrowthFields
          metrics={metrics}
          setMetrics={setMetrics}
          businessStatus={businessStatus}
          setBusinessStatus={setBusinessStatus}
        />
      </div>

      {/* 주주 구성 카드(통합 수정에 포함) */}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-body font-semibold text-gray-900">주주 구성</h2>
        <StartupShareholderFields history={shareholders} setHistory={setShareholders} />
      </div>

      {/* 미디어(언론기사·영상 등): URL 첨부 시 메타데이터 자동 로드 */}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-body font-semibold text-gray-900">미디어</h2>
        <StartupMediaFields media={media} setMedia={setMedia} />
      </div>

      {/* 자료 관리(IR·재무제표·기타): 업로드/삭제는 수정 모드에서만 가능 */}
      {STARTUP_MATERIAL_SECTIONS.map((s) => (
        <MaterialPanel key={s.type} targetType={s.type} targetId={recordId} title={s.title} />
      ))}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          저장
        </Button>
      </div>
    </form>
  )
}
