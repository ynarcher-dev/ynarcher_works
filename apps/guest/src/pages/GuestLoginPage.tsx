import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { GuestButton } from '@/components/GuestButton'
import { guestAuth, type GuestCredentials } from '@/auth/guestAuthService'

const credsSchema = z.object({
  businessCode: z.string().min(1, '사업 코드를 입력하세요.'),
  email: z.string().min(1, '이메일을 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
})
type CredsForm = z.infer<typeof credsSchema>

const inputClass =
  'mt-1 w-full rounded border border-gray-300 px-3 py-2 text-body text-gray-800 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'

/**
 * 게스트 로그인. 사업 코드 + 이메일(ID) + 비밀번호 세 값으로 들어온다.
 * 비밀번호를 아직 정하지 않았으면(초기 비밀번호 = 연락처) 곧바로 설정 화면으로 넘어가며,
 * 정하는 순간 세션이 열린다.
 */
export function GuestLoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'creds' | 'password'>('creds')
  const [ticket, setTicket] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CredsForm>({ resolver: zodResolver(credsSchema) })

  const onLogin = async (values: CredsForm) => {
    setError(null)
    setBusy(true)
    try {
      const next = await guestAuth.login(values as GuestCredentials)
      if (next) {
        setTicket(next.changeTicket)
        setStep('password')
      } else {
        navigate('/', { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onSetPassword = async () => {
    if (!ticket) return
    if (newPassword !== confirmPassword) {
      setError('두 비밀번호가 서로 다릅니다.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await guestAuth.setPassword(ticket, newPassword)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 설정에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="text-title-md font-bold text-gray-900">
        와이앤아처 <span className="text-brand">GUEST</span>
      </h1>
      <p className="mt-1 text-body text-gray-600">
        {step === 'creds' ? '참여자 로그인' : '새 비밀번호 설정'}
      </p>

      {step === 'creds' ? (
        <form onSubmit={handleSubmit(onLogin)} className="mt-6 space-y-4">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="businessCode">
              사업 코드
            </label>
            <input
              id="businessCode"
              className={inputClass}
              autoCapitalize="characters"
              {...register('businessCode')}
            />
            {errors.businessCode && (
              <p className="mt-1 text-caption text-danger">{errors.businessCode.message}</p>
            )}
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              className={inputClass}
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-caption text-danger">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-caption text-danger">{errors.password.message}</p>
            )}
          </div>

          {error && <p className="text-caption text-danger">{error}</p>}

          <GuestButton type="submit" className="w-full" disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </GuestButton>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="newPassword">
              새 비밀번호 (8자 이상)
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="confirmPassword">
              새 비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="text-caption text-danger">{error}</p>}

          <GuestButton
            className="w-full"
            onClick={() => void onSetPassword()}
            disabled={busy || newPassword.length < 8}
          >
            {busy ? '설정 중…' : '설정하고 시작'}
          </GuestButton>
        </div>
      )}
    </main>
  )
}
