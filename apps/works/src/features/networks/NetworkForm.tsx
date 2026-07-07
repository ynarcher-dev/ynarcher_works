import { Button, cn, Input, Select, TextArea, useToast } from '@ynarcher/ui'
import type { ChangeEvent, ReactNode } from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTags } from '@/features/admin/hooks'
import { supabase } from '@/lib/supabase'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { CareerEditor } from '@/features/networks/CareerEditor'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { parseBackground, type CareerData } from '@/features/networks/careerConfig'
import {
  CATEGORY_OPTIONS,
  ENTITIES,
  isCompactEntity,
  PROFILE_RESOURCE_TYPE,
  resolveEntityFromCategory,
  type EntityKey,
} from '@/features/networks/config'
import {
  checkDuplicateName,
  recordContribution,
  useCreateEntity,
  useMoveEntity,
  useUpdateEntity,
  type EntityRow,
} from '@/features/networks/hooks'

const MAX_FIELDS = 3

interface NetworkFormValues {
  name: string
  /** 구분: 저장 대상 엔티티(테이블)를 결정하는 선택자. */
  category: string
  position: string
  affiliation: string
  department: string
  email: string
  phone: string
  match: 'possible' | 'impossible'
  intro: string
}

interface Props {
  /** 현재 레코드가 속한 엔티티(탭). 신규 등록 시 구분 기본값으로도 쓰인다. */
  entity: EntityKey
  /** 기존 레코드 id. 미지정 시 신규 등록. */
  recordId?: string
  initial: EntityRow | null
  /**
   * 저장 완료 후 콜백. 이동(구분 변경)이면 이동 대상 엔티티와 신규 id를 전달한다.
   * 동일 엔티티 내 등록/수정이면 targetEntity === entity.
   */
  onDone: (result: { id: string; targetEntity: EntityKey; moved: boolean }) => void
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
 * 네트워크 통합 등록/수정 폼(상세페이지 내 편집 모드). 8종 전체 공용.
 * "구분"(엔티티 선택자) 값이 저장 대상 테이블을 결정하며, 조직 4종(기업·기관·대학·외주/거래)을
 * 선택하면 매칭 가능여부·전문분야·약력을 숨긴다(요건 2). 미분류는 전체 필드를 유지한다.
 * 스키마에 없는 직책·부서·매칭여부·약력·소개는 `profile`(jsonb)에 저장한다.
 */
export function NetworkForm({ entity, recordId, initial, onDone, onCancel }: Props) {
  const toast = useToast()
  const create = useCreateEntity(entity)
  const update = useUpdateEntity(entity)
  const isEdit = Boolean(recordId)

  const profile = (initial?.profile ?? {}) as Record<string, unknown>

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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NetworkFormValues>({
    values: {
      name: (initial?.name as string) ?? '',
      // 구분 기본값: 레코드가 속한 엔티티(테이블)의 라벨. 신규도 현재 탭 엔티티로 시작.
      category: ENTITIES[entity].label,
      position: (profile.position as string) ?? '',
      affiliation: (initial?.affiliation as string) ?? '',
      department: (profile.department as string) ?? '',
      email: (initial?.email as string) ?? '',
      phone: (initial?.phone as string) ?? '',
      match: profile.match_available === false ? 'impossible' : 'possible',
      intro: (profile.intro as string) ?? '',
    },
  })

  // 선택된 구분 → 저장 대상 엔티티. 조직 4종이면 매칭/전문분야/약력을 숨긴다.
  const target = resolveEntityFromCategory(watch('category'))
  const compact = isCompactEntity(target)

  // 이동(구분이 현재 엔티티와 다르게 바뀐 경우)을 위한 훅.
  const move = useMoveEntity(entity, target)

  const onSubmit = async (v: NetworkFormValues) => {
    const targetLabel = ENTITIES[target].label
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      email: v.email.trim() || null,
      // 연락처는 하이픈 등 숫자 외 문자를 제거하고 숫자만 저장한다.
      phone: v.phone.replace(/\D/g, '') || null,
      affiliation: v.affiliation.trim() || null,
      // 조직 4종은 전문분야 미사용(빈 배열).
      expertise: compact ? [] : fields,
      profile: {
        ...profile,
        photo: photo || null,
        position: v.position.trim() || null,
        department: v.department.trim() || null,
        category: targetLabel,
        // 조직 4종은 매칭/약력 미사용.
        match_available: compact ? null : v.match === 'possible',
        background: compact ? [] : background,
        intro: v.intro.trim() || null,
      },
    }

    try {
      if (isEdit && recordId) {
        if (target === entity) {
          // 동일 엔티티 내 수정.
          await update.mutateAsync({ id: recordId, values: payload })
          toast.show(`${targetLabel} 정보를 수정했습니다.`, 'success')
          onDone({ id: recordId, targetEntity: target, moved: false })
        } else {
          // 구분 변경 → 다른 테이블로 이동(soft-delete + insert).
          if (await checkDuplicateName(target, v.name.trim())) {
            toast.show(`이동 대상(${targetLabel})에 동일한 이름이 이미 있습니다.`, 'warning')
            return
          }
          const newId = await move.mutateAsync({ id: recordId, values: payload })
          await recordContribution({
            table: target,
            id: newId,
            action: 'created',
            source: 'manual',
            note: '구분 변경 이동',
          })
          toast.show(`${targetLabel} 네트워크로 이동했습니다.`, 'success')
          onDone({ id: newId, targetEntity: target, moved: true })
        }
      } else {
        // 신규 등록: 선택 구분의 테이블로 저장.
        if (await checkDuplicateName(target, v.name.trim())) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        // 현재 탭과 다른 구분을 골랐다면 대상 테이블로 직접 생성한다.
        const newId =
          target === entity
            ? await create.mutateAsync(payload)
            : await insertEntityDirect(target, payload)
        await recordContribution({
          table: target,
          id: newId,
          action: 'created',
          source: 'manual',
        })
        toast.show(`${targetLabel}을(를) 등록했습니다.`, 'success')
        onDone({ id: newId, targetEntity: target, moved: target !== entity })
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
          <Field label="구분" hint="(선택한 네트워크로 저장됩니다)">
            <Select {...register('category')}>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.key} value={o.label}>
                  {o.label}
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
          <Field label="연락처">
            <Input {...register('phone')} />
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
          )}
        </div>
      </div>

      {!compact && (
        <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
          <p className="mb-4 text-caption font-medium text-gray-600">약력</p>
          <CareerEditor value={background} onChange={setBackground} />
        </div>
      )}
      <div className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <Field label="메모">
          <TextArea rows={4} {...register('intro')} />
        </Field>
      </div>

      {/* 자료 관리: 기존 레코드 수정 시에만 업로드 가능(신규는 저장 후 id 확정되어야 첨부 가능). */}
      {isEdit && recordId && (
        <MaterialPanel
          targetType={PROFILE_RESOURCE_TYPE[entity] ?? entity}
          targetId={recordId}
        />
      )}

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

/**
 * 현재 탭과 다른 구분으로 신규 등록할 때, 대상 테이블에 직접 insert한다.
 * (`useCreateEntity`는 훅이라 컴포넌트 최상위에서만 호출 가능하므로, 대상이 가변인
 * 신규 등록 경로는 supabase insert를 직접 수행한다. 실패는 상위 try/catch가 처리한다.)
 */
async function insertEntityDirect(
  target: EntityKey,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase
    .from(target)
    .insert(values)
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}
