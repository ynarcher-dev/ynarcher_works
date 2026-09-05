import {
  CardShell,
  Checkbox,
  Field,
  Input,
  Select,
  TextArea,
  TokenMultiSelect,
  useToast,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormTopBar } from '@/components/FormTopBar'
import { useEditReasonPrompt } from '@/components/EditReasonPrompt'
import { useTags } from '@/features/admin/hooks'
import { PhotoPicker } from '@/features/networks/PhotoPicker'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { useCountryOptions } from '@/features/networks/countryOptions'
import {
  CATEGORY_OPTIONS,
  isCompactCategory,
  categoryLabel,
  NETWORK_TARGET_TYPE,
  type NetworkCategory,
} from '@/features/networks/config'
import {
  checkDuplicateName,
  useCreateNetwork,
  useUpdateNetwork,
  type NetworkRow,
} from '@/features/networks/hooks'

const MAX_FIELDS = 3

interface NetworkFormValues {
  name: string
  /** 구분 코드. 저장 대상 원장이 아니라 한 컬럼의 값이다(2026-09-04 통합). */
  category: string
  /** 국가 태그 id. 지역(국내/해외)은 이 값에서 서버가 파생한다. */
  countryTagId: string
  position: string
  affiliation: string
  department: string
  email: string
  phone: string
  /** 이 번호가 와츠앱으로 닿는지. 별도 번호가 아니라 연락처에 붙는 성질이라 칸이 아닌 체크다. */
  whatsapp: boolean
  linkedin: string
  match: 'possible' | 'impossible'
  intro: string
}

interface Props {
  /** 기존 레코드 id. 미지정 시 신규 등록. */
  recordId?: string
  initial: NetworkRow | null
  /** 신규 등록 시 미리 고른 구분(목록의 '신규 등록' 드롭다운에서 넘어온다). */
  defaultCategory?: NetworkCategory | null
  onDone: (result: { id: string }) => void
  onCancel: () => void
  /** 상단 바 뒤로가기 목적지(목록 경로). */
  backTo: string
}

/** 전문 영역 선택기(TokenMultiSelect)용 태그 최소 형태. 저장값이 이름이라 이름이 곧 키다. */
interface FieldTagOpt {
  name: string
}

/**
 * 네트워크 등록/수정 폼(상세페이지 내 편집 모드). 전 구분·전 국가 공용 한 벌이다.
 *
 * 구분을 바꿔도 행이 이동하지 않는다 — 통합 원장에서 구분은 한 컬럼의 값이라 id가 그대로이고,
 * 그 레코드에 붙은 자료·피드백·회의록 링크도 그대로 남는다(2026-09-04 이전에는 구분 변경이
 * 소프트 삭제 + 신규 등록이라 붙어 있던 것들이 원본을 잃었다).
 *
 * 국가는 필수다. 국내/해외를 따로 고르는 칸은 없다 — 한국을 고르면 국내이고, 그 판정은
 * 서버 트리거가 국가에서 파생시킨다. 두 칸을 두면 "해외로 표시했는데 국가는 한국"이 생긴다.
 *
 * 조직 유형(기업·기관·대학·기타)을 고르면 매칭 가능여부·전문영역을 숨긴다.
 * 스키마에 없는 직책·부서·매칭여부·소개는 `profile`(jsonb)에 저장한다.
 */
export function NetworkForm({
  recordId,
  initial,
  defaultCategory,
  onDone,
  onCancel,
  backTo,
}: Props) {
  const toast = useToast()
  const create = useCreateNetwork()
  const update = useUpdateNetwork()
  const isEdit = Boolean(recordId)
  // 수정 저장은 사유를 받아야 확정된다.
  const { askReason, reasonModal } = useEditReasonPrompt()
  // 등록 모드에서 미리 고른 자료. 저장 성공 직후 새 id로 일괄 업로드한다.
  const pending = usePendingMaterials()

  const profile = (initial?.profile ?? {}) as Record<string, unknown>

  // 전문 영역: ADMIN 영역 관리(field_tags) 태그에서 다중 선택(최대 3개), expertise(jsonb 배열)에 저장.
  const { data: fieldTags } = useTags('field_tags')
  const [fields, setFields] = useState<string[]>(
    Array.isArray(initial?.expertise) ? (initial?.expertise as string[]) : [],
  )
  // 선택기는 항목 객체를 다루고 원장은 이름 배열을 저장한다. 이름을 키로 삼으므로 태그가 지워져도
  // 이미 저장된 값은 칩으로 그대로 남는다(원장에서 사라진 이름을 화면이 조용히 버리지 않는다).
  const fieldOptions = useMemo<FieldTagOpt[]>(
    () => (fieldTags ?? []).map((t) => ({ name: t.name })),
    [fieldTags],
  )
  const selectedFields = useMemo<FieldTagOpt[]>(() => fields.map((name) => ({ name })), [fields])

  // 국가 선택지 — 자국(한국)이 맨 위, 그 아래 구분선, 나머지는 가나다순.
  const { data: countries } = useCountryOptions()

  // 사진: data URL로 profile.photo에 저장(2MB 이하). 첨부/미리보기는 공용 PhotoPicker가 소유한다.
  const [photo, setPhoto] = useState<string>((profile.photo as string) ?? '')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NetworkFormValues>({
    values: {
      name: (initial?.name as string) ?? '',
      category: (initial?.category as string) ?? defaultCategory ?? '',
      countryTagId: (initial?.country_tag_id as string) ?? '',
      position: (profile.position as string) ?? '',
      affiliation: (initial?.affiliation as string) ?? '',
      department: (profile.department as string) ?? '',
      email: (initial?.email as string) ?? '',
      phone: (initial?.phone as string) ?? '',
      whatsapp: profile.whatsapp === true,
      linkedin: (initial?.linkedin_url as string) ?? '',
      match: profile.match_available === false ? 'impossible' : 'possible',
      intro: (profile.intro as string) ?? '',
    },
  })

  // 조직 유형이면 매칭/전문영역을 숨긴다. 구분이 비어 있는 값도 같은 축약 형태다.
  const selectedCategory = watch('category')
  const compact = isCompactCategory(selectedCategory || null)

  const onSubmit = async (v: NetworkFormValues) => {
    const label = categoryLabel(v.category) || '네트워크'
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      email: v.email.trim() || null,
      // 연락처는 하이픈 등 숫자 외 문자를 제거하고 숫자만 저장한다.
      phone: v.phone.replace(/\D/g, '') || null,
      affiliation: v.affiliation.trim() || null,
      linkedin_url: v.linkedin.trim() || null,
      category: v.category || null,
      country_tag_id: v.countryTagId,
      // 조직 유형은 전문영역 미사용(빈 배열).
      expertise: compact ? [] : fields,
      profile: {
        ...profile,
        photo: photo || null,
        position: v.position.trim() || null,
        department: v.department.trim() || null,
        // 조직 유형은 매칭 미사용.
        match_available: compact ? null : v.match === 'possible',
        intro: v.intro.trim() || null,
        // 연락처가 비면 성질도 함께 지운다 — 없는 번호에 붙은 '와츠앱'은 아무것도 말하지 않는다.
        whatsapp: v.phone.replace(/\D/g, '') ? v.whatsapp : false,
      },
    }

    try {
      if (isEdit && recordId) {
        // 사유는 필수 — 변동 이력에 note로 남는다.
        const reason = await askReason()
        if (!reason) return
        await update.mutateAsync({ id: recordId, values: payload, reason })
        toast.show(`${label} 정보를 수정했습니다.`, 'success')
        onDone({ id: recordId })
      } else {
        if (await checkDuplicateName(v.name.trim())) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        const newId = await create.mutateAsync(payload)
        // 변동 이력 'created'는 원장 트리거가 같은 트랜잭션에서 남긴다.
        // 등록 전에 첨부한 자료를 새 레코드에 업로드한다.
        const { failed } = await pending.flush(newId, () => NETWORK_TARGET_TYPE)
        toast.show(
          failed > 0
            ? `${label}을(를) 등록했지만 자료 ${failed}건 업로드에 실패했습니다. 상세페이지에서 다시 첨부해 주세요.`
            : `${label}을(를) 등록했습니다.`,
          failed > 0 ? 'warning' : 'success',
        )
        onDone({ id: newId })
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
        mode={isEdit ? 'edit' : 'create'}
        onCancel={onCancel}
        busy={isSubmitting}
      />

      {/* 상세페이지와 동일한 3열 배치: 좌측 2/3 편집 카드 + 우측 1/3 자료 관리 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 사진 → 기본 데이터 → 소개 */}
        <div className="space-y-4 lg:col-span-2">
          {/* 사진 카드 */}
          <CardShell>
            <p className="mb-3 text-caption font-medium text-gray-700">사진</p>
            <PhotoPicker value={photo} onChange={setPhoto} />
          </CardShell>

          {/* 기본 데이터 카드 */}
          <CardShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="이름" required error={errors.name?.message}>
                <Input
                  invalid={Boolean(errors.name)}
                  {...register('name', { required: '이름은 필수입니다.' })}
                />
              </Field>
              {/*
                구분은 필수가 아니고 기본값이 '미지정'이다(2026-09-05). 고르지 않으면 빈 값이
                저장되고, 그 행은 목록 구분 필터의 '미지정'으로 다시 찾아 채운다 — 저장되는 것은
                여전히 null이며 '미지정'이라는 구분이 생긴 것이 아니다(config.ts의 CATEGORY_UNSET).
                첫 줄을 '선택'이 아니라 '미지정'으로 적는 이유가 여기 있다: 아직 안 고른 상태가
                아니라 **고르지 않기로 한 상태**도 답이 되므로, 그 자리는 빈 자리가 아니라 값이다.
              */}
              <Field label="구분" error={errors.category?.message}>
                <Select invalid={Boolean(errors.category)} {...register('category')}>
                  <option value="">미지정</option>
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {/* 국가 하나로 지역이 정해진다 — 국내/해외를 따로 고르는 칸을 두지 않는다.
                  자국(한국)을 구분선 위로 빼는 것은 분류가 달라서가 아니라 가장 자주 쓰기 때문이다. */}
              <Field label="국가" required error={errors.countryTagId?.message}>
                <Select
                  invalid={Boolean(errors.countryTagId)}
                  {...register('countryTagId', { required: '국가는 필수입니다.' })}
                >
                  <option value="">선택</option>
                  {(countries?.domestic ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {(countries?.domestic ?? []).length > 0 &&
                    (countries?.overseas ?? []).length > 0 && (
                      <option disabled>──────────</option>
                    )}
                  {(countries?.overseas ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="소속">
                <Input {...register('affiliation')} />
              </Field>
              <Field label="부서명">
                <Input {...register('department')} />
              </Field>
              <Field label="직책/직급">
                <Input {...register('position')} />
              </Field>
              <Field label="이메일">
                <Input type="email" {...register('email')} />
              </Field>
              {/* 와츠앱은 두 번째 번호가 아니라 이 번호의 성질이라 칸을 늘리지 않는다. 자리는
                  라벨 줄 오른쪽 끝 — 값 아래에 두면 '연락처 다음 입력'으로 읽혀 어느 번호에 붙은
                  성질인지가 끊기고, 라벨 줄에 서면 그 칸의 머리말 안에 함께 놓인다. */}
              <Field
                label="연락처"
                labelAside={<Checkbox label="와츠앱 사용 번호" {...register('whatsapp')} />}
              >
                <Input {...register('phone')} />
              </Field>
              <Field label="링크드인">
                <Input placeholder="https://linkedin.com/in/..." {...register('linkedin')} />
              </Field>
              {!compact && (
                <Field label="매칭 가능 여부">
                  <Select {...register('match')}>
                    <option value="possible">가능</option>
                    <option value="impossible">불가능</option>
                  </Select>
                </Field>
              )}
              {!compact && (
                <div className="sm:col-span-2">
                  {/* 태그를 전부 펼쳐 두던 자리다. 후보가 늘수록 고른 셋이 나머지 사이에 묻혀
                      '지금 무엇이 선택되어 있는가'를 색으로 훑어야 했다 — 선택 결과는 칸 안에
                      칩으로 남고, 나머지는 검색하거나 돋보기로 열어 본다. */}
                  <Field
                    label="전문 영역"
                    hint={
                      fieldOptions.length === 0
                        ? '등록된 영역 태그가 없습니다. ADMIN › 영역 관리에서 먼저 추가하세요.'
                        : `영역 관리 태그에서 최대 ${MAX_FIELDS}개 선택합니다.`
                    }
                    // 빈 상태는 접지 않는다 — 왜 못 고르는지는 물어봐야 답할 것이 아니다.
                    hintInline={fieldOptions.length === 0}
                    as="div"
                  >
                    <TokenMultiSelect<FieldTagOpt>
                      selected={selectedFields}
                      onChange={(next) => setFields(next.map((t) => t.name))}
                      getKey={(t) => t.name}
                      getLabel={(t) => t.name}
                      options={fieldOptions}
                      max={MAX_FIELDS}
                      placeholder="영역명을 검색하거나 돋보기로 전체 목록을 엽니다."
                      browsable
                      browseIn="modal"
                      browseTitle="전문 영역 전체 목록"
                      browseEmptyText="등록된 영역 태그가 없습니다. (ADMIN › 영역 관리)"
                    />
                  </Field>
                </div>
              )}
            </div>
          </CardShell>

          {/* 소개 카드 */}
          <CardShell>
            <Field label="소개">
              {/* 소개는 다 쓰고 나서 전체를 다시 읽는 글이라 칸이 내용만큼 자란다 — 고정 높이
                  안에서 스크롤이 생기면 앞 문단이 창 밖으로 나가 고칠 자리를 매번 다시 찾는다.
                  카드 하나를 통째로 쓰는 칸이라 자라도 밀려나는 입력이 없다. */}
              <TextArea rows={4} autoGrow {...register('intro')} />
            </Field>
          </CardShell>
        </div>

        {/* 우측(1/3): 자료 관리. 신규 등록에서는 보류 첨부 후 저장 시 함께 업로드한다. */}
        <div className="space-y-4 lg:col-span-1">
          {isEdit && recordId ? (
            <MaterialPanel targetType={NETWORK_TARGET_TYPE} targetId={recordId} />
          ) : (
            <PendingMaterialPanel slot="main" pending={pending} />
          )}
        </div>
      </div>
    </form>
  )
}
