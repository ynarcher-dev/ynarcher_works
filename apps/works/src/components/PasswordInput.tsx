import { Input, cn, type InputProps } from '@ynarcher/ui'
import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState } from 'react'

export type PasswordInputProps = Omit<InputProps, 'type' | 'icon'>

/**
 * 비밀번호 입력칸(가리기/보이기 토글). 아이콘 라이브러리를 두지 않는 packages/ui 대신
 * 앱 공용 컴포넌트로 둔다 — 규격(높이·글자·테두리)은 그대로 `Input`이 소유한다.
 * 기본은 가린 상태이며, 토글은 그 칸에만 적용된다(다른 칸은 가린 채로 남는다).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [shown, setShown] = useState(false)
    const Icon = shown ? EyeOff : Eye
    return (
      <div className="relative">
        {/* 오른쪽 버튼 자리만큼 글자가 밀리도록 여백을 준다. */}
        <Input
          ref={ref}
          type={shown ? 'text' : 'password'}
          className={cn('pr-9', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? '비밀번호 가리기' : '비밀번호 보기'}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex items-center rounded-radius-md px-2.5 text-gray-400 transition-colors duration-fast hover:text-gray-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
        >
          <Icon className="size-4" aria-hidden />
        </button>
      </div>
    )
  },
)
