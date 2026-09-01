import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { Input, type InputProps } from '@ynarcher/ui'

/**
 * 표시/숨김 토글이 달린 비밀번호 입력. 토글은 type을 text↔password로 바꿀 뿐
 * 값에는 손대지 않으며, 버튼은 type="button"이라 폼 제출을 일으키지 않는다.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'icon'>>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`pr-12 ${className ?? ''}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? '비밀번호 숨기기' : '비밀번호 표시'}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    )
  },
)
