import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** 전역 우측 슬라이드오버가 담는 진입점. 세 개가 하나의 패널 슬롯을 공유한다. */
export type RightPanelKey = 'ai' | 'calendar' | 'notifications'

interface RightPanelContextValue {
  /** 현재 열린 패널(없으면 null). */
  active: RightPanelKey | null
  /** 지정 패널을 연다(다른 것이 열려 있으면 교체 = 단일 활성). */
  open: (key: RightPanelKey) => void
  /** 같은 버튼 재클릭 토글 — 열려 있으면 닫고, 아니면 연다. */
  toggle: (key: RightPanelKey) => void
  close: () => void
}

const RightPanelContext = createContext<RightPanelContextValue | null>(null)

/**
 * 전역 우측 패널 상태(단일 활성). 상단바 진입점(AI·캘린더·알림)이 `toggle`로 열고,
 * `RightPanelHost`가 `active`를 읽어 슬라이드오버 안에 해당 내용을 렌더한다.
 */
export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<RightPanelKey | null>(null)
  const open = useCallback((key: RightPanelKey) => setActive(key), [])
  const toggle = useCallback(
    (key: RightPanelKey) => setActive((cur) => (cur === key ? null : key)),
    [],
  )
  const close = useCallback(() => setActive(null), [])

  const value = useMemo(
    () => ({ active, open, toggle, close }),
    [active, open, toggle, close],
  )
  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>
}

export function useRightPanel(): RightPanelContextValue {
  const ctx = useContext(RightPanelContext)
  if (!ctx) throw new Error('useRightPanel은 RightPanelProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
