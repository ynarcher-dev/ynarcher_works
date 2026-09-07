import { useState } from 'react'
import { useToast } from '@ynarcher/ui'
import type { StartupPick } from '@/features/mna/parties/StartupPickerModal'
import { MAX_INDUSTRIES, type MaPartyRow } from '@/features/mna/parties/config'

/** 폼에서 이 훅이 만지는 칸들 — 이름·담당자·이메일은 폼이, 분야는 별도 상태가 갖는다. */
interface FormBridge {
  getText: (field: 'name' | 'contactName' | 'contactEmail') => string
  setText: (field: 'name' | 'contactName' | 'contactEmail', value: string) => void
  industries: string[]
  setIndustries: (next: string[]) => void
}

/**
 * STARTUP 원장 매핑(선택) 한 칸의 상태와 규칙.
 *
 * 폼에서 떼어 둔 것은 줄 수 때문이 아니라 **규칙이 화면과 무관하기** 때문이다 — 어떤 칸을
 * 덮고 어떤 칸을 두는지는 두 원장(BUYER·SELLER)에서 같고, 폼 안에 두면 그 규칙이 카드 배치
 * 사이에 끼어 읽힌다.
 */
export function useStartupLink(initial: MaPartyRow | null, form: FormBridge) {
  const toast = useToast()
  // 이름과 별개의 값이라 함께 들고 다닌다 — 이름은 '이 상대를 부르는 이름'이고
  // 이 값은 '그 기업이 우리 원장의 어느 행인가'다.
  const [startupId, setStartupId] = useState<string | null>(initial?.startup_id ?? null)
  const [startupName, setStartupName] = useState<string>(initial?.startup?.name ?? '')
  const [picking, setPicking] = useState(false)

  /**
   * 스타트업 원장 한 행을 이 폼에 얹는다.
   *
   * 규칙은 하나 — **연결은 값을 덮지 않는다.** 비어 있는 칸만 채우고 이미 적힌 칸은 그대로
   * 둔다. 연결은 되돌릴 수 있지만(연결 해제) 덮어써서 잃은 입력은 되돌릴 방법이 없고,
   * 원장 표기와 이 상대를 부르는 이름이 다른 경우도 흔하다(약칭·계약서 표기).
   * AI 초안이 "근거를 못 찾은 칸은 기존 값 유지"인 것과 같은 이유다.
   *
   * 가져오는 값이 셋인 이유는 스타트업 원장이 **이미 답하고 있는 것**이기 때문이다 —
   * 연결해 놓고 분야·대표자·이메일을 손으로 또 적게 하면 같은 사실이 두 곳에 살고, 그때부터
   * 어긋난다. 다만 복사이지 참조가 아니다: 담기고 나면 이 레코드의 값이라 따로 고칠 수 있고,
   * 원장 쪽이 바뀌어도 따라 변하지 않는다(그 기업의 창구가 대표자가 아닐 수 있다).
   */
  const apply = (s: StartupPick) => {
    setStartupId(s.id)
    setStartupName(s.name)

    const filled: string[] = []
    if (!form.getText('name').trim()) form.setText('name', s.name)
    if (form.industries.length === 0 && s.industries?.length) {
      form.setIndustries(s.industries.slice(0, MAX_INDUSTRIES))
      filled.push('분야')
    }
    if (!form.getText('contactName').trim() && s.representative) {
      form.setText('contactName', s.representative)
      filled.push('담당자')
    }
    if (!form.getText('contactEmail').trim() && s.email) {
      form.setText('contactEmail', s.email)
      filled.push('이메일')
    }

    // 무엇이 함께 들어왔는지 밝힌다 — 연결 버튼 하나에 칸 셋이 조용히 바뀌면, 담당자는
    // 자기가 적지 않은 값이 언제 들어왔는지 알 수 없다.
    toast.show(
      filled.length
        ? `스타트업 DB를 연결하고 ${filled.join('·')}을(를) 가져왔습니다.`
        : '스타트업 DB를 연결했습니다.',
      'success',
    )
  }

  const clear = () => {
    setStartupId(null)
    setStartupName('')
  }

  return { startupId, startupName, picking, setPicking, apply, clear }
}
