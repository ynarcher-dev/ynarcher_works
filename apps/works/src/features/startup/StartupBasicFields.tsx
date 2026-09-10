import { Button, CardShell, Input, PanelCard, Select, TextArea } from '@ynarcher/ui'
import type { ChangeEvent, ReactNode } from 'react'
import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { FieldGrid, type FieldWidth } from '@/components/FieldGrid'
import { ItemRows, type ItemCol } from '@/components/ItemRows'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { TagSelect } from '@/features/admin/TagSelect'
import { MANAGEMENT_STATUS_OPTIONS, managementStatusLabel } from '@/features/startup/startupClassification'
import { ADDRESS_KIND_OPTIONS } from '@/features/startup/startupProfile'
import { Field } from '@/features/startup/StartupFormField'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/** 주소 한 줄 — 구분은 고정 선택지라 좁고, 주소는 길이를 모르는 값이라 남는 폭을 갖는다. */
const ADDRESS_COLS: ItemCol[] = [{ label: '구분', kind: 'pick' }, { label: '주소' }]

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
  // 주소 목록 — 줄의 key는 순번이 아니라 useFieldArray가 준 id다(가운데 줄을 지웠을 때
  // 아래 줄의 DOM 값이 위로 밀려 붙는 것을 막는다).
  const addresses = useFieldArray({ control, name: 'addresses' })

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
        {/* **한 줄에 두 칸으로 세운다**(2026-09-09 사용자 지정). 종류별 폭(4·3·2개)으로 세우니
            한 줄에 네 칸이 서서, 라벨과 값을 눈이 가로로 네 번 훑어야 했다 — 날짜·선택지는 제
            값을 담고도 남는데 이름·주소는 모자라, 같은 줄에서 칸마다 여유가 달랐다. 두 칸이면
            어느 종류든 폭이 같아 눈이 왼쪽 두 줄만 따라 내려간다.
            순서는 그대로 정체(기업명·대표자·형태·설립일) → 분류(사업자번호·단계·구분·소재지) →
            연락(상세주소·이메일·연락처) → 분야 → 발굴 경로 → 한 줄 소개다. 전폭은 상세주소·분야·
            발굴 경로·한 줄 소개 넷인데 담기는 글이 반 폭에서 끝나지 않는 칸들이고, 그 넷이
            홀수 자리를 메워 둘씩 서는 줄에는 빈 반 칸이 생기지 않는다. */}
        <FieldGrid>
          <Field label="기업명" required width="lg">
            <Input invalid={Boolean(errors.name)} {...register('name', { required: '기업명은 필수입니다.' })} />
            {errors.name && <p className="mt-1 text-caption text-danger">{errors.name.message}</p>}
          </Field>
          <Field label="대표자명" width="lg">
            <Input {...register('representative')} />
          </Field>
          <Field label="회사 형태" width="lg">
            <Select {...register('company_form')}>
              <option value="">선택</option>
              {COMPANY_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="설립일" width="lg">
            <Input type="date" {...register('founded_on')} />
          </Field>
          <Field label="사업자등록번호" width="lg">
            <Input {...register('biz_reg_no')} />
          </Field>
          {tagField('stage', 'investment_stage_tags', '단계', 'lg')}
          <Field
            label="구분"
            width="lg"
            // 왜 못 고치는지를 답하는 차단 안내라 접지 않는다(CLAUDE.md 안내 규칙의 예외).
            hint={alreadyInvested ? '전환·복귀는 FUND 투자 집행에서 관리합니다.' : undefined}
            hintInline={alreadyInvested}
          >
            {alreadyInvested ? (
              // 투자기업은 이 화면에서 구분을 바꾸지 않는다(전환·복귀는 FUND 투자 집행에서
              // 관리). **글자가 아니라 잠긴 칸으로 세운다**(2026-09-10 사용자 지정) — 값만
              // 적어 두면 옆 칸들과 높이가 어긋나 그 자리에 칸이 없는 것처럼 보이고,
              // 담당자는 구분이 아예 없는 폼으로 읽는다. 잠긴 셀렉트는 '있는데 지금은 못
              // 고친다'를 형태가 말한다.
              // 잠긴 칸이라 값이 바뀔 일이 없다 — `value`로 두면 onChange 없는 제어 컴포넌트가 된다.
              <Select defaultValue="invested" disabled>
                <option value="invested">{managementStatusLabel('invested')}</option>
              </Select>
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
          {tagField('location', 'location_tags', '소재지(본사)', 'lg')}
          {/*
            상세주소는 **목록**이다(2026-09-10 사용자 지정). 한 칸이던 동안 지사·연구소를
            둔 기업은 그 사실을 적을 자리가 없어 본사 주소 뒤에 이어 붙이거나 아예 적지
            않았다. 규격은 폼의 다른 목록 입력과 같다(`ItemRows` — 머리글 한 줄 + 항목 한
            줄 + 줄 끝 삭제).
          */}
          <div className="col-span-12">
            <p className="mb-1 text-body font-medium text-gray-800">상세주소</p>
            <ItemRows
              cols={ADDRESS_COLS}
              rows={addresses.fields}
              rowKey={(f) => f.id}
              onRemove={(i) => addresses.remove(i)}
              onAdd={() => addresses.append({ kind: ADDRESS_KIND_OPTIONS[0], detail: '' })}
              addLabel="주소 추가"
            >
              {(_row, i) => (
                <>
                  <Select {...register(`addresses.${i}.kind`)}>
                    {ADDRESS_KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                  {/* 시·도는 위 소재지 태그가 답하므로 여기는 그 아래부터 적는다. */}
                  <Input
                    {...register(`addresses.${i}.detail`)}
                    placeholder="시·군·구부터 끝까지"
                    aria-label="주소"
                  />
                </>
              )}
            </ItemRows>
          </div>
          <Field label="이메일" width="lg">
            <Input {...register('email')} />
          </Field>
          <Field label="연락처" width="lg">
            <Input {...register('phone')} />
          </Field>
          {/* 분야·발굴 경로·한 줄 소개는 각각 한 행을 통째로 쓴다(2026-09-09 사용자 지정).
              셋 다 담기는 것이 반 폭에서 끝나지 않는다 — 태그는 여러 줄로 접히고, 발굴 경로와
              한 줄 소개는 문장이다. 반 폭에 두면 옆 칸과 줄이 어긋나 어느 쪽이 이어지는 글인지
              읽는 눈이 매번 다시 잡아야 한다. */}
          <Field
            label="분야"
            hint={industryField.hint}
            hintInline={industryField.hintInline}
            width="full"
          >
            {industryField.control}
          </Field>
          <Field label="발굴 경로" width="full">
            <Controller
              control={control}
              name="discovery_source"
              render={({ field }) => (
                // 역량 밴드의 서술 칸과 같은 규격 — 두 문장 높이로 서고 내용만큼 자란다.
                <TextArea
                  rows={2}
                  autoGrow
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="발굴 경로를 자유롭게 입력하세요(길게 작성 가능)."
                />
              )}
            />
          </Field>
          {/* 한 줄 소개가 카드 맨 아래에 선다(2026-09-09 사용자 지정). 맨 위에 두면 전폭 한 칸이
              기업명보다 먼저 서서, 이 기업이 무엇인지 아직 모르는 채 요약부터 적게 된다.
              나머지를 다 적고 그 전부를 한 줄로 줄이는 칸이라 자리도 마지막이다. */}
          <Field label="한 줄 소개" width="full">
            <Input placeholder="한 줄 소개(기업명 아래에 표시됩니다)" {...register('oneLiner')} />
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
            <Field label="딜메이커" width="lg">
              <div className="py-2 text-body text-gray-900">{leadName || '-'}</div>
            </Field>
            <Field label="관리현황" width="lg">
              <div className="py-2 text-body text-gray-900">{poolStatus || '-'}</div>
            </Field>
          </FieldGrid>
        </PanelCard>
      )}
    </>
  )
}
