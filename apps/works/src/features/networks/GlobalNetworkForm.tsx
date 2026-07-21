import { Button, CardShell, cn, Input, Select, TextArea, useToast } from '@ynarcher/ui'
import type { ChangeEvent, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useTags } from '@/features/admin/hooks'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import {
  GLOBAL_CATEGORY_OPTIONS,
  REGION_TAG_TABLE,
  COUNTRY_TAG_TABLE,
  type GlobalRow,
} from '@/features/networks/globalConfig'
import {
  checkGlobalDuplicateName,
  useCreateGlobal,
  useUpdateGlobal,
} from '@/features/networks/globalHooks'

/** 전문 분야 최대 선택 수(국내 폼과 동일). */
const MAX_FIELDS = 3

interface Props {
  /** 기존 레코드 id. 미지정 시 신규 등록. */
  recordId?: string
  initial: GlobalRow | null
  /** 저장 완료 후 콜백(신규는 생성 id, 수정은 기존 id). */
  onDone: (id: string) => void
  onCancel: () => void
}

/** 필드 래퍼(라벨 + 입력). NetworkForm과 동일한 페이지 폼 스타일. */
function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-caption font-medium text-gray-600">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * 글로벌 네트워크 등록/수정 폼(상세페이지 내 편집 모드). 모달이 아닌 페이지형 카드 섹션.
 * 권역 선택 시 해당 권역의 국가만 노출한다(2뎁스 캐스케이드). 부서/직책·직급은 profile(jsonb)에 저장한다.
 */
export function GlobalNetworkForm({ recordId, initial, onDone, onCancel }: Props) {
  const toast = useToast()
  const create = useCreateGlobal()
  const update = useUpdateGlobal()
  const isEdit = Boolean(recordId)
  // 등록 모드에서 미리 고른 자료. 저장 성공 직후 새 id로 일괄 업로드한다.
  const pending = usePendingMaterials()
  const profile = (initial?.profile ?? {}) as Record<string, unknown>

  const [name, setName] = useState((initial?.name as string) ?? '')
  const [category, setCategory] = useState((initial?.category as string) ?? '')
  const [affiliation, setAffiliation] = useState((initial?.affiliation as string) ?? '')
  const [department, setDepartment] = useState((profile.department as string) ?? '')
  const [position, setPosition] = useState((profile.position as string) ?? '')
  const [email, setEmail] = useState((initial?.email as string) ?? '')
  const [phone, setPhone] = useState((initial?.phone as string) ?? '')
  const [linkedin, setLinkedin] = useState((initial?.linkedin_url as string) ?? '')
  const [regionId, setRegionId] = useState((initial?.region_tag_id as string) ?? '')
  const [countryId, setCountryId] = useState((initial?.country_tag_id as string) ?? '')
  const [intro, setIntro] = useState((profile.intro as string) ?? '')
  const [busy, setBusy] = useState(false)

  // 사진: data URL로 profile.photo에 저장(2MB 이하). 첨부 즉시 미리보기(국내 폼과 동일).
  const [photo, setPhoto] = useState((profile.photo as string) ?? '')
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

  // 전문 분야: ADMIN 분야 관리(field_tags) 태그에서 다중 선택(최대 3개), expertise(jsonb 배열)에 저장.
  const fieldTags = useTags('field_tags')
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

  const regions = useTags(REGION_TAG_TABLE)
  const countries = useTags(COUNTRY_TAG_TABLE, 'region_tag_id')
  // 선택한 권역에 속한 국가만 노출한다(미선택 시 전체).
  const countryOptions = useMemo(() => {
    const all = countries.data ?? []
    return regionId ? all.filter((c) => c.region_tag_id === regionId) : all
  }, [countries.data, regionId])

  // 권역 변경 시, 새 권역에 속하지 않는 국가 선택은 해제한다.
  const onRegionChange = (value: string) => {
    const stillValid = (countries.data ?? []).some(
      (c) => c.id === countryId && c.region_tag_id === value,
    )
    setRegionId(value)
    if (!stillValid) setCountryId('')
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.show('이름은 필수입니다.', 'warning')
      return
    }
    const payload: Record<string, unknown> = {
      name: trimmed,
      category: category || null,
      affiliation: affiliation.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      linkedin_url: linkedin.trim() || null,
      region_tag_id: regionId || null,
      country_tag_id: countryId || null,
      expertise: fields,
      profile: {
        ...profile,
        photo: photo || null,
        department: department.trim() || null,
        position: position.trim() || null,
        intro: intro.trim() || null,
      },
    }
    setBusy(true)
    try {
      if (isEdit && recordId) {
        await update.mutateAsync({ id: recordId, values: payload })
        toast.show('글로벌 네트워크 정보를 수정했습니다.', 'success')
        onDone(recordId)
      } else {
        if (await checkGlobalDuplicateName(trimmed)) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        const id = await create.mutateAsync(payload)
        // 등록 전에 첨부한 자료를 새 레코드에 업로드한다.
        const { failed } = await pending.flush(id, () => 'global_network')
        toast.show(
          failed > 0
            ? `글로벌 네트워크를 등록했지만 자료 ${failed}건 업로드에 실패했습니다. 상세페이지에서 다시 첨부해 주세요.`
            : '글로벌 네트워크를 등록했습니다.',
          failed > 0 ? 'warning' : 'success',
        )
        onDone(id)
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 상세페이지와 동일한 3열 배치: 좌측 2/3 편집 카드 + 우측 1/3 자료 관리 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 사진 → 기본 데이터 → 노트 */}
        <div className="space-y-4 lg:col-span-2">
          {/* 사진 카드 */}
          <CardShell>
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
          </CardShell>

          {/* 기본 데이터 카드 */}
          <CardShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="이름" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="구분">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {GLOBAL_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="소속">
                <Input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
              </Field>
              <Field label="부서">
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
              </Field>
              <Field label="직책/직급">
                <Input value={position} onChange={(e) => setPosition(e.target.value)} />
              </Field>
              <Field label="이메일">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="연락처">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="링크드인 URL">
                <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
              </Field>
              <Field label="권역">
                <Select value={regionId} onChange={(e) => onRegionChange(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {(regions.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="국가">
                <Select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {countryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="전문 분야">
                  <span className="mb-1 block text-caption font-normal text-gray-600">
                    분야 관리 태그에서 최대 {MAX_FIELDS}개
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(fieldTags.data ?? []).map((t) => {
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
                    {(fieldTags.data ?? []).length === 0 && (
                      <span className="text-caption text-gray-500">
                        등록된 분야 태그가 없습니다. (ADMIN › 분야 관리)
                      </span>
                    )}
                  </div>
                </Field>
              </div>
            </div>
          </CardShell>

          {/* 노트 카드 */}
          <CardShell>
            <Field label="노트">
              <TextArea rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />
            </Field>
          </CardShell>
        </div>

        {/* 우측(1/3): 자료 관리. 신규 등록에서는 보류 첨부 후 저장 시 함께 업로드한다. */}
        <div className="space-y-4 lg:col-span-1">
          {isEdit && recordId ? (
            <MaterialPanel targetType="global_network" targetId={recordId} />
          ) : (
            <PendingMaterialPanel slot="main" pending={pending} />
          )}
        </div>
      </div>

      {/* 액션 버튼(그리드 아래 전체 폭) */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {isEdit ? '수정 완료' : '등록'}
        </Button>
      </div>
    </div>
  )
}
