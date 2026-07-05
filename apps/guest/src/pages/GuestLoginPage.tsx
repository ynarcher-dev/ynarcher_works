import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { guestAuth, type GuestCredentials } from '@/auth/guestAuthService'

const credsSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.'),
  contact: z.string().min(1, '이메일 또는 전화번호를 입력하세요.'),
  businessCode: z.string().min(1, '사업 코드를 입력하세요.'),
})
type CredsForm = z.infer<typeof credsSchema>

const inputClass =
  'mt-1 w-full rounded border border-gray-300 px-3 py-2 text-body text-gray-800 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'

export function GuestLoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'creds' | 'otp'>('creds')
  const [creds, setCreds] = useState<GuestCredentials | null>(null)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CredsForm>({ resolver: zodResolver(credsSchema) })

  const onRequest = async (values: CredsForm) => {
    setError(null)
    setBusy(true)
    try {
      await guestAuth.requestOtp(values)
      setCreds(values)
      setStep('otp')
    } catch {
      setError('인증 요청에 실패했습니다. 잠시 후 다시 시도하세요.')
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async () => {
    if (!creds) return
    setError(null)
    setBusy(true)
    try {
      await guestAuth.verifyOtp(creds, otp)
      navigate('/', { replace: true })
    } catch {
      setError('입력 정보가 일치하지 않거나 인증이 만료되었습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="text-title-md font-bold text-gray-900">
        와이앤아처 <span className="text-brand">GUEST</span>
      </h1>
      <p className="mt-1 text-body text-gray-500">
        {step === 'creds' ? '참여자 정보로 로그인' : '인증 번호 입력 (3분 이내)'}
      </p>

      {step === 'creds' ? (
        <form onSubmit={handleSubmit(onRequest)} className="mt-6 space-y-4">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="name">
              이름
            </label>
            <input id="name" className={inputClass} {...register('name')} />
            {errors.name && (
              <p className="mt-1 text-caption text-danger">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="contact">
              연락처 (이메일 또는 전화번호)
            </label>
            <input id="contact" className={inputClass} {...register('contact')} />
            {errors.contact && (
              <p className="mt-1 text-caption text-danger">
                {errors.contact.message}
              </p>
            )}
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="businessCode">
              사업 코드
            </label>
            <input
              id="businessCode"
              className={inputClass}
              placeholder="예: AC-2026-003"
              {...register('businessCode')}
            />
            {errors.businessCode && (
              <p className="mt-1 text-caption text-danger">
                {errors.businessCode.message}
              </p>
            )}
          </div>

          {error && <p className="text-caption text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-brand px-4 py-2 text-body font-medium text-white transition-colors duration-fast hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60"
          >
            {busy ? '요청 중…' : '인증 번호 받기'}
          </button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="otp">
              인증 번호 (6자리)
            </label>
            <input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className={inputClass}
            />
          </div>

          {error && <p className="text-caption text-danger">{error}</p>}

          <button
            type="button"
            onClick={() => void onVerify()}
            disabled={busy || otp.length !== 6}
            className="w-full rounded bg-brand px-4 py-2 text-body font-medium text-white transition-colors duration-fast hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60"
          >
            {busy ? '확인 중…' : '로그인'}
          </button>
        </div>
      )}
    </main>
  )
}
