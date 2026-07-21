import { Button, CardShell, Input, Select, TextArea, useToast } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { ROLE_OPTIONS } from '@/features/management/config'
import { HrTagSelect } from '@/features/management/HrTagSelect'
import {
  useDepartments,
  useUpdateEmployee,
  type Employee,
} from '@/features/management/hooks'
import { CareerEditor } from '@/features/networks/CareerEditor'
import { PhotoPicker } from '@/features/networks/PhotoPicker'
import { parseBackground, type CareerData } from '@/features/networks/careerConfig'

/** 필드 래퍼(라벨 + 입력). NetworkForm/GlobalNetworkForm과 동일한 페이지 폼 스타일. */
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
      <label className="mb-1 block text-caption font-medium text-gray-700">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      {children}
    </div>
  )
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

interface Props {
  recordId: string
  initial: Employee
  /** 저장 완료 후 콜백. */
  onDone: () => void
  onCancel: () => void
}

/**
 * 임직원 수정 폼(상세페이지 내 편집 모드). 모달이 아닌 페이지형 카드 섹션.
 * 이름·이메일·역할·부서는 users 스칼라 컬럼, 회사·직책/직급·사진·약력·노트는 profile(jsonb)에 저장한다.
 * 사진(photo)·약력(background)은 NETWORKS와 동일한 공용 편집기·저장 규약을 그대로 쓴다.
 * 관계형 연동 도메인(관리기업/운영사업/M&A/프로젝트/펀드)은 자동 기록 대상이라 편집하지 않는다.
 */
export function EmployeeForm({ recordId, initial, onDone, onCancel }: Props) {
  const toast = useToast()
  const update = useUpdateEmployee()
  const { data: depts } = useDepartments()
  const profile = initial.profile ?? {}

  const [name, setName] = useState(initial.name ?? '')
  const [userType, setUserType] = useState(initial.user_type ?? '')
  const [company, setCompany] = useState(str(profile.company))
  const [departmentId, setDepartmentId] = useState(initial.department_id ?? '')
  const [position, setPosition] = useState(str(profile.position))
  const [rank, setRank] = useState(str(profile.rank))
  const [payStep, setPayStep] = useState(str(profile.pay_step))
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [note, setNote] = useState(str(profile.note))
  const [busy, setBusy] = useState(false)
  // 사진·약력은 NETWORKS와 동일 규약: profile.photo(2MB 이하 data URL) / profile.background(섹션 jsonb).
  const [photo, setPhoto] = useState(str(profile.photo))
  const [background, setBackground] = useState<CareerData>(parseBackground(profile.background))

  // 부서 선택지: 최상위 → 하위(팀) 순으로 나열하고 하위는 "└ "로 들여쓴다.
  const deptOptions = useMemo(() => {
    const list = depts ?? []
    const out: { id: string; label: string }[] = []
    for (const root of list.filter((d) => !d.parent_id)) {
      out.push({ id: root.id, label: root.name })
      for (const child of list.filter((d) => d.parent_id === root.id)) {
        out.push({ id: child.id, label: `└ ${child.name}` })
      }
    }
    // 트리에 안 잡힌 항목(부모가 목록에 없음)도 누락 없이 포함한다.
    for (const d of list) {
      if (!out.some((o) => o.id === d.id)) out.push({ id: d.id, label: d.name })
    }
    return out
  }, [depts])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.show('이름은 필수입니다.', 'warning')
      return
    }
    const values: Record<string, unknown> = {
      name: trimmed,
      email: email.trim() || null,
      user_type: userType,
      department_id: departmentId || null,
      phone: phone.trim() || null,
      profile: {
        ...profile,
        company: company.trim() || null,
        position: position.trim() || null,
        rank: rank.trim() || null,
        pay_step: payStep.trim() || null,
        photo: photo || null,
        background,
        note: note.trim() || null,
      },
    }
    setBusy(true)
    try {
      await update.mutateAsync({ id: recordId, values })
      toast.show('임직원 정보를 수정했습니다.', 'success')
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <CardShell>
        <p className="mb-3 text-caption font-medium text-gray-700">사진</p>
        <PhotoPicker value={photo} onChange={setPhoto} />
      </CardShell>

      <CardShell>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="이름" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="역할">
            <Select value={userType} onChange={(e) => setUserType(e.target.value)}>
              {ROLE_OPTIONS.every((o) => o.value !== userType) && userType && (
                <option value={userType}>{userType}</option>
              )}
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="회사">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="부서/팀">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">선택 안 함</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="직책">
            <HrTagSelect table="position_tags" value={position} onChange={setPosition} />
          </Field>
          <Field label="직급">
            <HrTagSelect table="rank_tags" value={rank} onChange={setRank} />
          </Field>
          <Field label="호봉">
            <HrTagSelect table="pay_step_tags" value={payStep} onChange={setPayStep} />
          </Field>
          <Field label="연락처">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="이메일">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </CardShell>

      <CardShell>
        <p className="mb-3 text-caption font-medium text-gray-700">약력</p>
        <CareerEditor value={background} onChange={setBackground} />
      </CardShell>

      <CardShell>
        <Field label="노트">
          <TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </CardShell>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          수정 완료
        </Button>
      </div>
    </div>
  )
}
