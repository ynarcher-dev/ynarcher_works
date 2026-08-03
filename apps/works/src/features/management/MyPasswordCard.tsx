import { Button, CardShell, Input, useToast } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

/** 새 비밀번호 최소 길이 — 계정 생성 시 초기 비밀번호와 같은 기준을 쓴다. */
const MIN_LENGTH = 8

/** 필드 래퍼(라벨 + 입력). 인사 관리 폼과 같은 모양. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption font-medium text-gray-700">
        {label}
        <span className="text-brand"> *</span>
      </label>
      {children}
    </div>
  )
}

/** Supabase Auth가 영어로 돌려주는 거절 사유를 화면 문구로 옮긴다. */
function failMessage(raw: string): string {
  if (/different from the old password/i.test(raw)) {
    return '현재 비밀번호와 다른 값을 입력하세요.'
  }
  if (/password/i.test(raw)) {
    return `비밀번호는 ${MIN_LENGTH}자 이상, 추측하기 어려운 값이어야 합니다.`
  }
  return '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도하세요.'
}

/**
 * 내 비밀번호 변경(마이페이지 전용). 로그인한 본인 계정만 대상이며 실제 변경은
 * Supabase Auth(`updateUser`)가 현재 세션으로 수행한다 — 남의 계정은 건드릴 수 없다.
 * 바꾸기 전에 현재 비밀번호로 재인증해, 자리를 비운 사이 열린 세션으로 비밀번호가
 * 바뀌는 것을 막는다(화면 검증은 안내일 뿐 강제는 Auth가 한다).
 * 프로필 저장(사진·약력·노트)과는 별개 동작이라 이 카드가 자기 버튼을 가진다.
 */
export function MyPasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  // 입력만으로 판정되는 사유는 서버 왕복 없이 그 자리에서 알린다.
  const localError =
    next.length > 0 && next.length < MIN_LENGTH
      ? `새 비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`
      : confirm.length > 0 && next !== confirm
        ? '새 비밀번호가 서로 다릅니다.'
        : current.length > 0 && next.length > 0 && current === next
          ? '현재 비밀번호와 다른 값을 입력하세요.'
          : ''
  const ready = !!current && next.length >= MIN_LENGTH && next === confirm && current !== next

  const submit = async () => {
    setBusy(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const email = auth.user?.email ?? ''
      if (!email) {
        toast.show('로그인 정보를 확인할 수 없습니다. 다시 로그인하세요.', 'danger')
        return
      }
      // 현재 비밀번호 재확인 — 틀리면 여기서 멈춘다(세션은 그대로 유지된다).
      const { error: reauth } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      })
      if (reauth) {
        toast.show('현재 비밀번호가 일치하지 않습니다.', 'danger')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) {
        toast.show(failMessage(error.message), 'danger')
        return
      }
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.show('비밀번호를 변경했습니다.', 'success')
    } catch {
      toast.show('비밀번호 변경에 실패했습니다. 잠시 후 다시 시도하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardShell>
      <p className="mb-3 text-caption font-medium text-gray-700">비밀번호 변경</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="현재 비밀번호">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <div className="hidden sm:block" />
        <Field label="새 비밀번호">
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="새 비밀번호 확인">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
      {/* 안내 문구 자리에 그대로 사유를 띄운다 — 줄이 늘었다 줄었다 하지 않게. */}
      <p className={`mt-2 text-caption ${localError ? 'text-danger' : 'text-gray-700'}`}>
        {localError || `${MIN_LENGTH}자 이상으로, 다른 서비스와 겹치지 않는 값을 쓰세요.`}
      </p>
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={() => void submit()} disabled={!ready || busy}>
          비밀번호 변경
        </Button>
      </div>
    </CardShell>
  )
}
