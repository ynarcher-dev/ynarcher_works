import { Button, Input } from '@ynarcher/ui'
import { useState } from 'react'

/**
 * 자료 링크 입력 한 줄(공용). 주소를 받아 `onAdd`로 넘긴다.
 *
 * 드롭존과 **다른 자리**인 이유는 다른 행위이기 때문이다. 2026-09-05에 파일 첨부의 입구를
 * 점선 상자 하나로 모은 것은 *같은 일*을 하는 자리가 셋이었기 때문이고, 여기서는 파일을 놓는
 * 일과 주소를 적는 일이 갈린다 — 주소는 끌어다 놓을 수 없고 입력 칸이 있어야 한다.
 *
 * 붙여넣기 직후 곧바로 확정할 수 있게 Enter를 받는다. 폼 안에 놓일 수 있으므로 버튼은
 * `type="button"`이고 Enter는 기본 동작을 막는다 — 그러지 않으면 링크를 붙이려다 폼이 저장된다.
 */
export function MaterialLinkInput({
  onAdd,
  busy = false,
}: {
  onAdd: (url: string) => void
  busy?: boolean
}) {
  const [value, setValue] = useState('')
  const trimmed = value.trim()
  // 서버(CHECK 제약)와 같은 기준으로 앞에서 거른다. 여기서 막는 것은 보안이 아니라 왕복이다.
  const valid = /^https?:\/\/\S+$/i.test(trimmed)

  const submit = () => {
    if (!valid || busy) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            submit()
          }}
          placeholder="https:// 로 시작하는 주소 붙여넣기"
          disabled={busy}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="secondary" onClick={submit} disabled={!valid || busy}>
          {busy ? '추가 중…' : '링크 추가'}
        </Button>
      </div>
      {/* 막힌 이유는 접지 않는다 — 왜 버튼이 안 눌리는지를 이 줄이 답한다. */}
      {trimmed !== '' && !valid && (
        <p className="mt-1 text-caption text-danger">http:// 또는 https:// 로 시작하는 주소여야 합니다.</p>
      )}
    </div>
  )
}
