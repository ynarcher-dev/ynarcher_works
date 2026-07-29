import { CardShell, Input, Select, useToast } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { FormTopBar } from '@/components/FormTopBar'
import { ROLE_OPTIONS } from '@/features/management/config'
import { EmployeeNoteFields } from '@/features/management/EmployeeNoteFields'
import { HrTagSelect } from '@/features/management/HrTagSelect'
import { noteEditorInit, noteValues } from '@/features/management/noteConfig'
import {
  useDepartments,
  useUpdateEmployee,
  type Employee,
} from '@/features/management/hooks'
import { useEmployeeBranchNames } from '@/features/office/branches/branchMembers'
import { useBranches, useSetUserBranches } from '@/features/office/branches/branchesApi'
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
  /** 상단 바 뒤로가기 목적지(목록 경로). */
  backTo: string
}

/**
 * 임직원 수정 폼(상세페이지 내 편집 모드). 모달이 아닌 페이지형 카드 섹션.
 * 이름·이메일·역할·부서는 users 스칼라 컬럼, 회사·직책/직급·사진·약력·노트는 profile(jsonb)에 저장한다.
 * 노트는 철학·관심분야·한마디 세 항목이며 편집기·저장 규약은 EmployeeNoteFields·noteConfig가 소유한다.
 * 사진(photo)·약력(background)은 NETWORKS와 동일한 공용 편집기·저장 규약을 그대로 쓴다.
 * 관계형 연동 도메인(관리기업/운영사업/M&A/프로젝트/펀드)은 자동 기록 대상이라 편집하지 않는다.
 */
export function EmployeeForm({ recordId, initial, onDone, onCancel, backTo }: Props) {
  const toast = useToast()
  const update = useUpdateEmployee()
  const setUserBranches = useSetUserBranches()
  const { data: depts } = useDepartments()
  const { data: branches } = useBranches()
  const { branchIdsOf } = useEmployeeBranchNames()
  const profile = initial.profile ?? {}

  const [name, setName] = useState(initial.name ?? '')
  const [userType, setUserType] = useState(initial.user_type ?? '')
  const [company, setCompany] = useState(str(profile.company))
  const [departmentId, setDepartmentId] = useState(initial.department_id ?? '')
  const [position, setPosition] = useState(str(profile.position))
  const [rank, setRank] = useState(str(profile.rank))
  const [payStep, setPayStep] = useState(str(profile.pay_step))
  const [hireDate, setHireDate] = useState(str(profile.hire_date))
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  // 노트는 철학·관심분야·한마디 세 항목이다. 세 항목이 비어 있고 이전 자유 텍스트 노트만 있으면
  // 그 글을 철학 칸에 실어 주고(carriedLegacy), 저장 시 원본 note 키를 비운다.
  const noteInit = useMemo(() => noteEditorInit(profile), [profile])
  const [note, setNote] = useState(noteInit.value)
  const [busy, setBusy] = useState(false)
  // 지사는 users가 아니라 지사 원장(branch_members)에 저장한다. 초기값이 비동기로 오므로
  // 손대기 전(null)에는 원장 값을 그대로 보여주고, 한 번 고치면 그 값이 이긴다.
  // 사람 기준으로는 소속 지사가 하나라 단일 선택이고, 저장 시 그 사람의 배정을 그 한 곳으로 맞춘다.
  const [editedBranchId, setEditedBranchId] = useState<string | null>(null)
  const branchId = editedBranchId ?? branchIdsOf(recordId)[0] ?? ''
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
        hire_date: hireDate || null,
        photo: photo || null,
        background,
        ...noteValues(note),
        // 이전 노트를 철학 칸으로 옮겨 실었을 때만 원본 키를 비운다(그 외에는 손대지 않는다).
        ...(noteInit.carriedLegacy ? { note: null } : {}),
      },
    }
    setBusy(true)
    try {
      await update.mutateAsync({ id: recordId, values })
      // 지사는 별도 원장이라 저장 경로도 별도다. 안 고쳤으면 호출을 아낀다.
      if (editedBranchId !== null) {
        await setUserBranches.mutateAsync({
          userId: recordId,
          branchIds: editedBranchId ? [editedBranchId] : [],
        })
      }
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
      {/* 상단 바(뒤로가기 ↔ 취소·확정) — 조회 화면의 '수정' 버튼과 같은 자리를 쓴다. */}
      <FormTopBar
        backTo={backTo}
        mode="edit"
        onCancel={onCancel}
        busy={busy}
        onSubmit={() => void submit()}
      />

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
          {/* 지사는 '지사 관리'와 같은 원장(branch_members)을 고친다 — 여기서 지정하면 지사 배정인력에도 그대로 뜬다. */}
          <Field label="지사">
            <Select value={branchId} onChange={(e) => setEditedBranchId(e.target.value)}>
              <option value="">선택 안 함</option>
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
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
          <Field label="입사일">
            <Input
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
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
        <EmployeeNoteFields value={note} onChange={setNote} />
      </CardShell>
    </div>
  )
}
