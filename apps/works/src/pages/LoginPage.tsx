import { Button } from '@ynarcher/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { employeeAuth } from '@/auth/employeeAuthService'

const schema = z.object({
  email: z.string().email('올바른 이메일 형식을 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
})
type LoginForm = z.infer<typeof schema>

/** GUEST 앱 로그인 주소. 신청 랜딩 주소(.../apply)와 같은 오리진을 쓴다. */
const GUEST_LOGIN_URL = (() => {
  const apply = (import.meta.env.VITE_APPLY_BASE_URL as string | undefined)?.replace(/\/+$/, '')
  if (!apply) return null
  try {
    return `${new URL(apply).origin}/login`
  } catch {
    return null
  }
})()

export function LoginPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: LoginForm) => {
    setFormError(null)
    try {
      await employeeAuth.signIn(values.email, values.password)
      navigate('/', { replace: true })
    } catch {
      setFormError('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-title-md font-bold text-gray-900">
        와이앤아처 <span className="text-brand">WORKS</span>
      </h1>
      <p className="mt-1 text-body text-gray-600">임직원 로그인</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded-radius-md border border-gray-300 px-3 py-2 text-body text-gray-800 shadow-soft transition-all duration-fast hover:border-gray-400 focus-visible:border-brand/50 focus-visible:outline-none focus-visible:shadow-popover"
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
            className="mt-1 w-full rounded-radius-md border border-gray-300 px-3 py-2 text-body text-gray-800 shadow-soft transition-all duration-fast hover:border-gray-400 focus-visible:border-brand/50 focus-visible:outline-none focus-visible:shadow-popover"
            {...register('password')}
          />
          {errors.password && (
            <p className="mt-1 text-caption text-danger">
              {errors.password.message}
            </p>
          )}
        </div>

        {formError && (
          <p className="rounded-radius-md border border-danger-border bg-danger-subtle px-3 py-2 text-caption text-danger shadow-soft">
            {formError}
          </p>
        )}

        {/* 로그인 화면은 카드·표 밖의 독립 폼이라 page 맥락(40px)에 선다. */}
        <Button type="submit" density="page" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? '로그인 중…' : '로그인'}
        </Button>
      </form>

      {GUEST_LOGIN_URL && (
        <p className="mt-4 text-center text-caption text-gray-600">
          <a
            href={GUEST_LOGIN_URL}
            className="text-brand underline underline-offset-2 transition-opacity duration-fast hover:opacity-80"
          >
            GUEST로 로그인하기
          </a>
        </p>
      )}
    </main>
  )
}
