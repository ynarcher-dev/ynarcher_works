import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { anonHeaders, functionsBase } from '@/lib/supabase'

interface TempPayload {
  title: string
  content: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'expired' }
  | { kind: 'ok'; payload: TempPayload }

/**
 * 임시 게스트 뷰(일회성 링크 전용 격리 뷰포트).
 * 내비게이션 없이 지정된 정보 영역만 단독 렌더링하며, 만료 시 안내 페이지로 대체한다.
 * 근거: 3_9_workspace_guest.md §1.3
 */
export function TempGuestPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    const resolve = async () => {
      try {
        const res = await fetch(`${functionsBase}/guest-temp-resolve`, {
          method: 'POST',
          headers: anonHeaders,
          body: JSON.stringify({ token }),
        })
        if (!res.ok) throw new Error('expired')
        const payload = (await res.json()) as TempPayload
        if (alive) setState({ kind: 'ok', payload })
      } catch {
        if (alive) setState({ kind: 'expired' })
      }
    }
    void resolve()
    return () => {
      alive = false
    }
  }, [token])

  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <p className="text-body text-gray-500">불러오는 중…</p>
      </main>
    )
  }

  if (state.kind === 'expired') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <p className="text-title-sm font-bold text-gray-900">
          만료된 접속 주소입니다
        </p>
        <p className="mt-2 text-body text-gray-500">
          접속 기한이 지났거나 유효하지 않은 링크입니다. 담당자에게 재발급을 요청하세요.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-title-md font-bold text-gray-900">
        {state.payload.title}
      </h1>
      <div className="mt-4 whitespace-pre-wrap text-body text-gray-700">
        {state.payload.content}
      </div>
    </main>
  )
}
