import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { switchScale } from '../densityScale'

interface SwitchBaseProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
}

/**
 * 접근명은 선택이 아니라 **둘 중 하나**다.
 *
 * 스위치는 글자를 품지 않으므로, 이름이 없으면 스크린리더에 '스위치, 켜짐'까지만 읽힌다 —
 * 무엇을 켜는 스위치인지 화면 밖에서는 알 길이 없다. 실제로 권한 콘솔의 워크스페이스별
 * 읽기·쓰기 스위치 두 개가 그 상태였고, 바로 옆 민감정보 패널은 제대로 붙어 있어 같은 화면
 * 안에서 규칙이 갈렸다. 린트로 잡는 대신 타입으로 막는다 — 빠뜨릴 수 있는 자리를 아예 없앤다.
 *
 * `aria-label`은 스위치가 스스로 이름을 갖는 경우, `id`는 바깥 `<label htmlFor>`가 이름을
 * 주는 경우다(설정 행처럼 제목이 이미 화면에 있는 자리).
 */
export type SwitchProps = SwitchBaseProps &
  ({ 'aria-label': string; id?: string } | { id: string; 'aria-label'?: string })

/** 토글 스위치(썸 이동 duration-fast). 근거: 6_motion_transition_rules.md §2 */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
  density,
}: SwitchProps) {
  const s = switchScale[useDensity(density)]
  return (
    <button
      type="button"
      // eslint-disable-next-line no-restricted-syntax -- 토글 스위치의 정본. 이 요소가 곧 규격이다.
      role="switch"
      id={id}
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-all duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        s.track,
        checked ? 'bg-brand' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          // 손잡이의 그림자만 남긴다. 트랙은 쉬고 있는 면이라 안쪽 그림자를 걷었지만, 손잡이는
          // 그 면 **위에 얹혀 좌우로 움직이는** 부분이다 — 떠 있음이 곧 "집어서 옮길 수 있다"는
          // 뜻이라 그림자가 장식이 아니라 조작 가능함의 표시가 된다. popover/dialog 토큰은 패널용
          // 크기라 8px짜리 손잡이에는 쓸 수 없어, 이 한 곳만 Tailwind 기본값을 남긴다.
          // eslint-disable-next-line no-restricted-syntax -- 그림자 정책이 문서에 명시한 유일한 예외(§1.2).
          'inline-block translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-standard',
          s.thumb,
          checked && s.travel,
        )}
      />
    </button>
  )
}
