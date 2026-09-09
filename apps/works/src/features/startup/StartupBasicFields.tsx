import { Button, CardShell, Input, PanelCard, Select, TextArea } from '@ynarcher/ui'
import type { ChangeEvent, ReactNode } from 'react'
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { FieldGrid, type FieldWidth } from '@/components/FieldGrid'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { TagSelect } from '@/features/admin/TagSelect'
import { MANAGEMENT_STATUS_OPTIONS, managementStatusLabel } from '@/features/startup/startupClassification'
import { Field } from '@/features/startup/StartupFormField'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/** 회사 형태 고정 선택지. */
const COMPANY_FORMS = ['법인', '개인', '예비'] as const

interface Props {
  register: UseFormRegister<StartupDetailFormValues>
  control: Control<StartupDetailFormValues>
  errors: FieldErrors<StartupDetailFormValues>
  /** 분야 태그 입력(ADMIN 태그 원장 연동) — 컨트롤과 안내 문구를 함께 받는다. */
  industryField: { control: ReactNode; hint: string; hintInline: boolean }
  photo: string
  setPhoto: (v: string) => void
  onPickPhoto: (e: ChangeEvent<HTMLInputElement>) => void
  /** 이미 투자기업인가. 구분·담당자·관리현황은 이 화면에서 건드리지 않는다(FUND 전용). */
  alreadyInvested: boolean
  poolStatus: string
  leadName: string | null
}

/**
 * 통합 수정 폼의 사진 + 기본 데이터 입력(좌측 열 첫 두 카드).
 *
 * 폼 파일에서 떼어낸 이유는 줄 수가 아니라 **소유 단위**다. 상세페이지가 밴드(정체 → 요약 →
 * 역량 → 실적 → 관리)로 갈린 뒤 편집 폼도 같은 단위로 서야 하므로, 밴드마다 파일이 하나씩
 * 대응한다. 여기는 그중 '정체' — 이 기업이 누구인가에 해당하는 칸들이다.
 */
export function StartupBasicFields({
  register,
  control,
  errors,
  industryField,
  photo,
  setPhoto,
  onPickPhoto,
  alreadyInvested,
  poolStatus,
  leadName,
}: Props) {
  type TagFieldName = 'stage' | 'management_status' | 'pool_status' | 'location'
  const tagField = (name: TagFieldName, table: string, label: string, width: FieldWidth) => (
    <Field label={label} width={width}>
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
    <>
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
        {/* **칸의 종류가 폭을 정하고, 같은 종류가 한 줄을 채우도록 순서도 함께 모았다**
            (2026-09-09 사용자 지정). 정체(기업명·대표자·형태·설립일) → 분류(사업자번호·단계·
            구분·소재지) → 연락(상세주소·이메일·연락처) → 폭이 필요한 것(분야·발굴 경로)이다.
            종전에는 2열 격자에 칸이 종류와 무관하게 둘씩 서고 긴 칸만 전폭을 받아, 짧은 칸이
            제 값보다 두 배 넓은 자리를 차지하면서 폼이 세로로 길어졌다. */}
        <FieldGrid>
          <Field label="한 줄 소개" width="full">
            <Input placeholder="한 줄 소개(기업명 아래에 표시됩니다)" {...register('oneLiner')} />
          </Field>
          <Field label="기업명" required width="sm">
            <Input invalid={Boolean(errors.name)} {...register('name', { required: '기업명은 필수입니다.' })} />
            {errors.name && <p className="mt-1 text-caption text-danger">{errors.name.message}</p>}
          </Field>
          <Field label="대표자명" width="sm">
            <Input {...register('representative')} />
          </Field>
          <Field label="회사 형태" width="sm">
            <Select {...register('company_form')}>
              <option value="">선택</option>
              {COMPANY_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="설립일" width="sm">
            <Input type="date" {...register('founded_on')} />
          </Field>
          <Field label="사업자등록번호" width="sm">
            <Input {...register('biz_reg_no')} />
          </Field>
          {tagField('stage', 'investment_stage_tags', '단계', 'sm')}
          <Field label="구분" width="sm">
            {alreadyInvested ? (
              // 투자기업은 이 화면에서 구분을 바꾸지 않는다(전환·복귀는 FUND 투자 집행에서 관리).
              <div className="flex items-center gap-2 py-2 text-body text-gray-900">
                {managementStatusLabel('invested')}
                <span className="text-caption text-gray-500">(FUND 투자 집행에서 관리)</span>
              </div>
            ) : (
              // 투자기업 전환은 여기서 할 수 없다 — 발굴/보육/미지정 간에만 바꾼다('투자' 옵션 제외).
              <Select {...register('management_status')}>
                {MANAGEMENT_STATUS_OPTIONS.filter((o) => o.value !== 'invested').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {tagField('location', 'location_tags', '소재지', 'sm')}
          <Field label="상세주소" width="md">
            <Input {...register('address_detail')} placeholder="상세주소를 입력하세요" />
          </Field>
          <Field label="이메일" width="md">
            <Input {...register('email')} />
          </Field>
          <Field label="연락처" width="md">
            <Input {...register('phone')} />
          </Field>
          {/* 분야·발굴 경로가 한 줄을 반씩 나눈다 — 분야를 전폭으로 두면 발굴 경로가 홀로
              다음 줄에 서서 오른쪽 절반이 빈다(2026-09-09). 태그는 넘치면 아래로 접힌다. */}
          <Field
            label="분야"
            hint={industryField.hint}
            hintInline={industryField.hintInline}
            width="lg"
          >
            {industryField.control}
          </Field>
          <Field label="발굴 경로" width="lg">
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
        </FieldGrid>
      </CardShell>

      {/* 담당자·현황 카드(투자기업 전용, 읽기 전용): 지정·전환은 FUND 투자 집행에서 처리한다. */}
      {alreadyInvested && (
        <PanelCard
          title="담당자 · 현황 (투자기업)"
          help={'투자기업의 딜메이커·관리현황은 FUND 투자 집행에서 지정·관리합니다.\n이 화면에서는 조회만 됩니다.'}
        >
          <FieldGrid>
            <Field label="딜메이커" width="md">
              <div className="py-2 text-body text-gray-900">{leadName || '-'}</div>
            </Field>
            <Field label="관리현황" width="md">
              <div className="py-2 text-body text-gray-900">{poolStatus || '-'}</div>
            </Field>
          </FieldGrid>
        </PanelCard>
      )}
    </>
  )
}
