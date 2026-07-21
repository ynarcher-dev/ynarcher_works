import { CardShell, Input, Select, useToast } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormTopBar } from '@/components/FormTopBar'
import { CREATABLE_ROLE_OPTIONS } from '@/features/management/config'
import { HrTagSelect } from '@/features/management/HrTagSelect'
import { useCreateEmployee } from '@/features/management/hooks'

/** 인사 관리 목록 경로(뒤로가기·취소 목적지). */
const LIST_PATH = '/management?tab=hr'

/** 필드 래퍼(라벨 + 입력). EmployeeForm과 동일한 페이지 폼 스타일. */
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
      <label className="mb-1 block text-caption font-medium text-gray-700">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-caption text-gray-700">{hint}</p>}
    </div>
  )
}

/**
 * 임직원 계정 생성 페이지(인사 관리 전용). 로그인 가능한 계정을 만든다.
 * 필수: 이메일·이름·초기 비밀번호·역할 / 선택: 직책/직급·연락처.
 * 부서 등 나머지 프로필은 생성 후 상세페이지 "수정"에서 보완한다.
 * 실제 auth 계정 생성은 `employee-create` Edge Function이 수행한다(클라이언트 직접 불가).
 */
export function EmployeeCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateEmployee()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [userType, setUserType] = useState(
    CREATABLE_ROLE_OPTIONS[0]?.value ?? 'management_support',
  )
  const [position, setPosition] = useState('')
  const [rank, setRank] = useState('')
  const [payStep, setPayStep] = useState('')
  const [phone, setPhone] = useState('')

  const submit = async () => {
    const trimmedEmail = email.trim()
    const trimmedName = name.trim()
    if (!trimmedEmail || !trimmedName || !password) {
      toast.show('이메일·이름·초기 비밀번호는 필수입니다.', 'warning')
      return
    }
    if (password.length < 8) {
      toast.show('초기 비밀번호는 8자 이상이어야 합니다.', 'warning')
      return
    }
    try {
      const { id } = await create.mutateAsync({
        email: trimmedEmail,
        name: trimmedName,
        password,
        user_type: userType,
        position: position.trim() || null,
        rank: rank.trim() || null,
        pay_step: payStep.trim() || null,
        phone: phone.trim() || null,
      })
      toast.show('임직원 계정을 생성했습니다.', 'success')
      navigate(`/management/hr/${id}`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '계정 생성에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      {/* 상단 바(뒤로가기 ↔ 취소·등록) — 다른 등록/수정 폼과 동일한 자리·문구를 쓴다. */}
      <FormTopBar
        backTo={LIST_PATH}
        mode="create"
        onCancel={() => navigate(LIST_PATH)}
        busy={create.isPending}
        onSubmit={() => void submit()}
      />

      <CardShell>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="이름" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="역할" required>
            <Select value={userType} onChange={(e) => setUserType(e.target.value)}>
              {CREATABLE_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="이메일(로그인 ID)" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="초기 비밀번호" required hint="8자 이상. 최초 로그인 후 변경을 권장합니다.">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
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
        </div>
      </CardShell>
    </div>
  )
}
