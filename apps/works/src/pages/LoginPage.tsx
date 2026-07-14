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
      <p className="mt-1 text-body text-gray-500">임직원 로그인</p>

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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-radius-md bg-brand px-4 py-2 text-body font-medium text-white shadow-sm shadow-brand/20 transition-all duration-fast hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 active:scale-[0.98] active:bg-brand-700 disabled:scale-100 disabled:opacity-60"
        >
          {isSubmitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </main>
  )
}
