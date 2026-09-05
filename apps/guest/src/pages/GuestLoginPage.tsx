import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { GuestButton } from '@/components/GuestButton'
import {
  guestAuth,
  type GuestCredentials,
  type GuestLoginResult,
} from '@/auth/guestAuthService'
import { PERSONA_LABEL, type GuestContextChoice } from '@/auth/guestStore'
import { passwordRuleOk } from '@/lib/passwordRule'

const credsSchema = z.object({
  email: z.string().min(1, '이메일을 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
})
type CredsForm = z.infer<typeof credsSchema>

const inputClass =
  'mt-1 w-full rounded border border-gray-300 px-3 py-2 text-body text-gray-800 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'

type Step = 'creds' | 'password' | 'choose' | 'none'

const STEP_LABEL: Record<Step, string> = {
  creds: '참여자 로그인',
  password: '새 비밀번호 설정',
  choose: '들어갈 사업 선택',
  none: '접근 가능한 사업 없음',
}

function endLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `~ ${d.toLocaleDateString('ko-KR')}`
}

/**
 * 게스트 로그인. **이메일 + 비밀번호 두 값**으로 들어온다(2026-09-05 — 사업 코드 칸이
 * 없어졌다. 코드는 안내문에 평문으로 나가던 값이라 비밀 역할을 하지 못했고, 어느 사업으로
 * 들어갈지는 로그인 이후에 고른다).
 *
 * 단계는 넷이며 서버 응답의 종류가 정한다 — 비밀번호를 아직 정하지 않았으면 설정,
 * 갈 곳이 둘 이상이면 선택, 하나면 건너뛰고 바로 진입, 없으면 사유를 알린다.
 */
export function GuestLoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<Step>('creds')
  const [ticket, setTicket] = useState<string | null>(null)
  const [selectTicket, setSelectTicket] = useState<string | null>(null)
  const [choices, setChoices] = useState<GuestContextChoice[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CredsForm>({ resolver: zodResolver(credsSchema) })

  /** 서버가 정한 착지로 화면을 옮긴다. 로그인·비밀번호 설정이 같은 규칙을 쓴다. */
  const land = (result: GuestLoginResult) => {
    switch (result.kind) {
      case 'session':
        navigate('/', { replace: true })
        return
      case 'password':
        setTicket(result.changeTicket)
        setStep('password')
        return
      case 'choose':
        setSelectTicket(result.selectTicket)
        setChoices(result.choices)
        setStep('choose')
        return
      case 'none':
        setNotice(result.message)
        setStep('none')
    }
  }

  // 재설정 링크(?token=)로 들어오면 곧바로 비밀번호 설정 단계에 선다.
  useEffect(() => {
    const token = params.get('token')
    if (!token) return
    void (async () => {
      setBusy(true)
      try {
        const { changeTicket } = await guestAuth.consumeResetLink(token)
        setTicket(changeTicket)
        setStep('password')
      } catch (e) {
        setError(e instanceof Error ? e.message : '링크를 확인하지 못했습니다.')
      } finally {
        setBusy(false)
      }
    })()
  }, [params])

  const onLogin = async (values: CredsForm) => {
    setError(null)
    setBusy(true)
    try {
      land(await guestAuth.login(values as GuestCredentials))
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
      land(await guestAuth.setPassword(ticket, newPassword))
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 설정에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onChoose = async (participantId: string) => {
    setError(null)
    setBusy(true)
    try {
      await guestAuth.enterContext(participantId, selectTicket ?? undefined)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '해당 사업으로 들어갈 수 없습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="text-title-md font-bold text-gray-900">
        와이앤아처 <span className="text-brand">GUEST</span>
      </h1>
      <p className="mt-1 text-body text-gray-600">{STEP_LABEL[step]}</p>

      {step === 'creds' && (
        <form onSubmit={handleSubmit(onLogin)} className="mt-6 space-y-4">
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
          <p className="text-caption text-gray-500">
            처음 로그인하시나요? 비밀번호 칸에 등록된 연락처를 숫자만 입력하시면 새 비밀번호를
            정하는 화면으로 넘어갑니다.
          </p>
        </form>
      )}

      {step === 'password' && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="newPassword">
              새 비밀번호 (영문+숫자 조합, 8자 이상)
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
            disabled={busy || !passwordRuleOk(newPassword)}
          >
            {busy ? '설정 중…' : '설정하고 시작'}
          </GuestButton>
        </div>
      )}

      {step === 'choose' && (
        <div className="mt-6 space-y-3">
          <p className="text-caption text-gray-500">
            참여 중인 사업이 여러 건입니다. 들어갈 곳을 선택하세요. 안에서도 바꿀 수 있습니다.
          </p>
          <ul className="space-y-2">
            {choices.map((c) => (
              <li key={c.participantId}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onChoose(c.participantId)}
                  className="flex min-h-12 w-full flex-col items-start gap-0.5 rounded-radius-md border border-gray-300 px-3 py-2 text-left hover:border-brand hover:bg-brand/5 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60"
                >
                  <span className="text-body font-medium text-gray-900">{c.title}</span>
                  <span className="text-caption text-gray-500">
                    {[c.persona ? PERSONA_LABEL[c.persona] : null, c.code, endLabel(c.accessEndsAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
      )}

      {step === 'none' && (
        <div className="mt-6 space-y-4">
          <p className="text-body text-gray-700">{notice}</p>
          <p className="text-caption text-gray-500">
            사업이 끝났거나 접근 기간이 지났을 수 있습니다. 계정은 그대로 살아 있으므로, 새
            사업에 참여하시면 같은 이메일과 비밀번호로 들어오실 수 있습니다.
          </p>
          <GuestButton className="w-full" onClick={() => setStep('creds')}>
            다시 로그인
          </GuestButton>
        </div>
      )}
    </main>
  )
}
