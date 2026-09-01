import { Card, Field, Input } from '@ynarcher/ui'
import { useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { guestAuth } from '@/auth/guestAuthService'

/**
 * 비밀번호 변경 카드(마이페이지 하단).
 *
 * 세션이 살아 있어도 현재 비밀번호를 다시 받는다 — 자리를 비운 사이 남이 계정을 잠그는 일을
 * 막는 재확인이며, 검증·정책은 전부 서버(guest-auth-password 변경 모드)가 강제한다.
 * 입력 규격은 폼 공용 `Field`+`Input`을 쓰되 높이만 GUEST 터치 하한(48px)으로 올린다.
 */
export function PasswordChangeCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm

  const onSubmit = async () => {
    if (next !== confirm) {
      setError('두 비밀번호가 서로 다릅니다.')
      return
    }
    setError(null)
    setDone(false)
    setBusy(true)
    try {
      await guestAuth.changePassword(current, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="비밀번호 변경" subtitle="8자 이상이어야 하며, 숫자로만 이루어진 값은 쓸 수 없습니다.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void onSubmit()
        }}
      >
        <Field label="현재 비밀번호">
          <Input
            type="password"
            autoComplete="current-password"
            density="page"
            className="min-h-12"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="새 비밀번호">
          <Input
            type="password"
            autoComplete="new-password"
            density="page"
            className="min-h-12"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="새 비밀번호 확인" error={mismatch ? '두 비밀번호가 서로 다릅니다.' : undefined}>
          <Input
            type="password"
            autoComplete="new-password"
            density="page"
            className="min-h-12"
            invalid={mismatch}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        {error && <p className="text-caption text-danger">{error}</p>}
        {done && <p className="text-caption text-success">비밀번호가 변경되었습니다.</p>}

        <GuestButton
          type="submit"
          className="w-full sm:w-auto"
          disabled={busy || !current || next.length < 8 || next !== confirm}
        >
          {busy ? '변경 중…' : '비밀번호 변경'}
        </GuestButton>
      </form>
    </Card>
  )
}
