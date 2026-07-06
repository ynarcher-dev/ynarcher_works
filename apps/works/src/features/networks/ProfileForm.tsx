import { Button, cn, Input, Select, TextArea, useToast } from '@ynarcher/ui'
import type { ChangeEvent, ReactNode } from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTags } from '@/features/admin/hooks'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { CareerEditor } from '@/features/networks/CareerEditor'
import { parseBackground, type CareerData } from '@/features/networks/careerConfig'
import { ENTITIES, type EntityKey } from '@/features/networks/config'
import {
  checkDuplicateName,
  useCreateEntity,
  useUpdateEntity,
  type EntityRow,
} from '@/features/networks/hooks'

const MAX_FIELDS = 3

interface ProfileFormValues {
  name: string
  position: string
  affiliation: string
  category: string
  email: string
  phone: string
  match: 'possible' | 'impossible'
  intro: string
}

interface Props {
  /** 대상 엔티티(전문가·VAN·투자사 공용). */
  entity: EntityKey
  /** 기존 레코드 id. 미지정 시 신규 등록. */
  recordId?: string
  initial: EntityRow | null
  /** 저장 완료 후 콜백(신규는 생성 id 전달). */
  onDone: (id: string) => void
  onCancel: () => void
}

/** 필드 래퍼(라벨 + 입력). */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-caption font-medium text-gray-600">
        {label}
        {required && <span className="text-brand"> *</span>}
        {hint && <span className="ml-1 font-normal text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * 네트워크 프로필 등록/수정 폼(상세페이지 내 편집 모드). 전문가·VAN·투자사 공용.
 * 스키마에 없는 직책·매칭여부·약력·소개는 `profile`(jsonb)에 저장한다.
 */
export function ProfileForm({ entity, recordId, initial, onDone, onCancel }: Props) {
  const toast = useToast()
  const label = ENTITIES[entity].label
  const create = useCreateEntity(entity)
  const update = useUpdateEntity(entity)
  const isEdit = Boolean(recordId)

  const profile = (initial?.profile ?? {}) as Record<string, unknown>

  // 구분: ADMIN 구분 관리(category_tags) 태그에서 단일 선택, profile.category에 저장.
  const { data: categoryTags } = useTags('category_tags')
  // 전문 분야: ADMIN 분야 관리(field_tags) 태그에서 다중 선택(최대 3개), expertise(jsonb 배열)에 저장.
  const { data: fieldTags } = useTags('field_tags')
  const [fields, setFields] = useState<string[]>(
    Array.isArray(initial?.expertise) ? (initial?.expertise as string[]) : [],
  )
  const toggleField = (name: string) => {
    setFields((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : prev.length >= MAX_FIELDS
          ? prev
          : [...prev, name],
    )
  }

  // 약력: 학력/경력/자격증/수상 세부 항목을 profile.background에 저장.
  const [background, setBackground] = useState<CareerData>(
    parseBackground(profile.background),
  )

  // 사진: data URL로 profile.photo에 저장(2MB 이하). 첨부 즉시 미리보기.
  const [photo, setPhoto] = useState<string>((profile.photo as string) ?? '')
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
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    values: {
      name: (initial?.name as string) ?? '',
      position: (profile.position as string) ?? '',
      affiliation: (initial?.affiliation as string) ?? '',
      category: (profile.category as string) ?? '',
      email: (initial?.email as string) ?? '',
      phone: (initial?.phone as string) ?? '',
      match: profile.match_available === false ? 'impossible' : 'possible',
      intro: (profile.intro as string) ?? '',
    },
  })

  const onSubmit = async (v: ProfileFormValues) => {
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      email: v.email.trim() || null,
      // 연락처는 하이픈 등 숫자 외 문자를 제거하고 숫자만 저장한다.
      phone: v.phone.replace(/\D/g, '') || null,
      affiliation: v.affiliation.trim() || null,
      expertise: fields,
      profile: {
        ...profile,
        photo: photo || null,
        position: v.position.trim() || null,
        category: v.category || null,
        match_available: v.match === 'possible',
        background,
        intro: v.intro.trim() || null,
      },
    }
    try {
      if (isEdit && recordId) {
        await update.mutateAsync({ id: recordId, values: payload })
        toast.show(`${label} 정보를 수정했습니다.`, 'success')
        onDone(recordId)
      } else {
        if (await checkDuplicateName(entity, v.name.trim())) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        const newId = await create.mutateAsync(payload)
        toast.show(`${label}을(를) 등록했습니다.`, 'success')
        onDone(newId)
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <p className="mb-3 text-caption font-medium text-gray-600">사진</p>
        <div className="flex items-center gap-4">
          <PhotoBox src={photo} />
          <div className="flex gap-2">
            <label className="cursor-pointer rounded-radius-md border border-gray-300 px-3 py-1.5 text-body text-gray-700 transition-colors hover:bg-gray-50">
              사진 첨부
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickPhoto}
              />
            </label>
            {photo && (
              <Button type="button" variant="secondary" onClick={() => setPhoto('')}>
                삭제
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="이름" required>
            <Input
              invalid={Boolean(errors.name)}
              {...register('name', { required: '이름은 필수입니다.' })}
            />
            {errors.name && (
              <p className="mt-1 text-caption text-danger">{errors.name.message}</p>
            )}
          </Field>
          <Field label="직책/직급">
            <Input {...register('position')} />
          </Field>
          <Field label="소속">
            <Input {...register('affiliation')} />
          </Field>
          <Field label="구분">
            <Select {...register('category')}>
              <option value="">선택 안 함</option>
              {(categoryTags ?? []).map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="매칭 가능 여부">
            <Select {...register('match')}>
              <option value="possible">가능</option>
              <option value="impossible">불가능</option>
            </Select>
          </Field>
          <Field label="이메일">
            <Input type="email" {...register('email')} />
          </Field>
          <Field label="연락처">
            <Input {...register('phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="전문 분야" hint={`(분야 관리 태그에서 최대 ${MAX_FIELDS}개)`}>
              <div className="flex flex-wrap gap-1.5">
                {(fieldTags ?? []).map((t) => {
                  const on = fields.includes(t.name)
                  const disabled = !on && fields.length >= MAX_FIELDS
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleField(t.name)}
                      className={cn(
                        'rounded-radius-sm border px-2 py-0.5 text-caption transition-colors',
                        on
                          ? 'border-brand bg-brand/10 font-medium text-brand'
                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
                        disabled && 'cursor-not-allowed opacity-40 hover:bg-white',
                      )}
                    >
                      {t.name}
                    </button>
                  )
                })}
                {(fieldTags ?? []).length === 0 && (
                  <span className="text-caption text-gray-400">
                    등록된 분야 태그가 없습니다. (ADMIN › 분야 관리)
                  </span>
                )}
              </div>
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <p className="mb-4 text-caption font-medium text-gray-600">약력</p>
        <CareerEditor value={background} onChange={setBackground} />
      </div>
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <Field label="메모">
          <TextArea rows={4} {...register('intro')} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isEdit ? '수정 완료' : '등록'}
        </Button>
      </div>
    </form>
  )
}
