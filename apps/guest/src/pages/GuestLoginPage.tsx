import { Badge, CardShell, formText } from '@ynarcher/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { z } from 'zod'
import { GuestButton } from '@/components/GuestButton'
import { guestAuth, type GuestCredentials, type GuestLoginResult } from '@/auth/guestAuthService'
import { accessEndLabel, contextTags } from '@/auth/contextDisplay'
import { type GuestContextChoice } from '@/auth/guestStore'
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
  choose: '들어갈 프로젝트/FUND 선택',
  none: '접근 가능한 프로젝트/FUND 없음',
}

/**
 * 고를 수 있는 참여 한 건. **카드 한 장이 한 곳**이며, 종류(프로젝트·M&A 프로젝트·FUND)와
 * 자격(참여 기업·참여 전문가)이 제목 아래 중립 태그로 선다(2026-09-13).
 *
 * 종전에는 제목과 회색 한 줄(자격·코드·기간)이 전부였다. 그 줄에는 **종류가 아예 없어서**,
 * 같은 회사가 사업에도 조합에도 걸리면 목록의 두 줄이 서로 다른 화면으로 데려가는데 그
 * 차이가 화면에 없었다 — 고르는 자리에서 무엇을 고르는지 답하지 못한 셈이다.
 *
 * 상자는 `CardShell`이 그린다(수제 카드는 밀도 맥락을 내려주지 못한다). 누르는 일은 그 안의
 * 버튼이 맡아, 카드 규격과 터치 하한(48px)이 한 곳에서 어긋나지 않게 한다.
 */
function ContextChoiceCard({
  choice,
  disabled,
  onSelect,
}: {
  choice: GuestContextChoice
  disabled: boolean
  onSelect: () => void
}) {
  const tags = contextTags(choice.entityKey, choice.persona)
  const meta = [choice.code, accessEndLabel(choice.accessEndsAt)].filter(Boolean).join(' · ')
  return (
    <CardShell className="p-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="flex min-h-12 w-full items-center gap-3 rounded-radius-lg p-4 text-left transition-colors duration-fast hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          {/*
            이름은 자르지 않는다(2026-09-13 리뷰). 이 카드의 일이 **무엇을 고르는지 답하는
            것**인데, 사업명은 앞머리가 길게 겹치는 일이 잦아 꼬리를 자르면 두 카드가 같은
            글자로 보인다. 네이티브 tooltip은 마우스에만 있어 모바일에서는 대안이 못 된다.
            `break-words`가 띄어쓰기 없는 긴 이름도 상자 안에서 끊어, 폭은 그대로 둔다.
          */}
          <span className="block break-words text-body font-semibold text-gray-900">
            {choice.title}
          </span>
          <span className="flex flex-wrap items-center gap-1">
            {tags.map((t) => (
              <Badge key={t.key}>{t.label}</Badge>
            ))}
            {meta && <span className="text-caption text-gray-500">{meta}</span>}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-gray-400" />
      </button>
    </CardShell>
  )
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
      setError(e instanceof Error ? e.message : '해당 프로젝트/FUND로 들어갈 수 없습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      {/*
        밖에서 부르는 이름(2026-09-08). `GUEST`는 받는 사람에게 등급을 통보하는 말이라,
        이 앱이 AC 참여기업뿐 아니라 M&A 거래상대·투자사까지 받게 되면 어울리지 않는다.
        **바뀌는 것은 부르는 이름뿐이다** — `guest` 권한 키·`external_*` enum·정책·감사
        로그는 그대로다(2026-09-07 AC→Accelerator와 같은 방식). 근거: 3_9_2 §10
      */}
      <h1 className="text-title-md font-bold text-gray-900">
        와이앤아처 <span className="text-brand">GUEST</span>
      </h1>
      <p className="mt-1 text-body text-gray-600">{STEP_LABEL[step]}</p>

      {step === 'creds' && (
        <form onSubmit={handleSubmit(onLogin)} className="mt-6 space-y-4">
          <div>
            <label className={formText.label} htmlFor="email">
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
            <label className={formText.label} htmlFor="password">
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
            <label className={formText.label} htmlFor="newPassword">
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
            <label className={formText.label} htmlFor="confirmPassword">
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
          <p className="text-body text-gray-600">
            참여 중인 곳이 여러 건입니다. 들어갈 곳을 선택하세요. 들어간 뒤 사이드바 상단의 참여
            전환에서 언제든 바꿀 수 있습니다.
          </p>
          <ul className="space-y-3">
            {choices.map((c) => (
              <li key={c.participantId}>
                <ContextChoiceCard
                  choice={c}
                  disabled={busy}
                  onSelect={() => void onChoose(c.participantId)}
                />
              </li>
            ))}
          </ul>
          {error && (
            <p className="text-caption text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {step === 'none' && (
        <div className="mt-6 space-y-4">
          <p className="text-body text-gray-700">{notice}</p>
          <p className="text-caption text-gray-500">
            프로젝트/FUND가 끝났거나 접근 기간이 지났을 수 있습니다. 계정은 그대로 살아 있으므로,
            새 프로젝트/FUND에 참여하시면 같은 이메일과 비밀번호로 들어오실 수 있습니다.
          </p>
          <GuestButton className="w-full" onClick={() => setStep('creds')}>
            다시 로그인
          </GuestButton>
        </div>
      )}
    </main>
  )
}
