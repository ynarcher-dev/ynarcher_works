/**
 * 표 입력의 열 폭 — **자릿수에 상한이 있는 칸만 폭을 갖는다.**
 *
 * 폭을 하나도 주지 않으면 브라우저가 칸의 자연 너비로 나누는데, 그 기준이 되는 것은 글자가
 * 아니라 **입력 상자의 기본 너비**(대략 20자)다. 그래서 값이 `-` 한 글자인 사본 칸은 좁게
 * 눌리고, 여덟 자리면 끝나는 송금액과 `2026-10-01`이 전부인 날짜 칸이 표의 절반을 가져간다 —
 * 실제로 적히는 값과 정확히 반대로 넓어진다.
 *
 * 그래서 **적힐 값의 상한을 아는 칸에만 폭을 못 박고**, 상한이 없는 칸(이름·항목·고르는 칸)은
 * 폭을 주지 않아 남는 자리를 가져가게 한다. 표가 `table-fixed`인 것이 이 규칙의 짝이다 —
 * 자동 배치에서는 못 박은 폭이 권고에 그쳐 넓은 내용이 다시 밀고 들어온다.
 *
 * 이 모듈은 순수 계층이다(React·DB 의존 없음).
 */
import { isNumericColumn, type FormColumn } from '@/features/approval/fields'

/** 행 삭제 열 — 값이 아니라 아이콘 하나가 놓이는 자리. */
export const ACTION_COLUMN_REM = 3

/**
 * 이 열의 폭(rem). `null`이면 폭을 주지 않는다 — 남는 자리를 나눠 갖는 칸이다.
 *
 * 값의 주인이 다른 칸(`source`)을 종류보다 먼저 보는 이유는 그것이 글자 칸(TEXT)이면서도
 * 사람이 적지 않는 자리이기 때문이다. 은행·계좌번호·예금주는 길이의 상한이 분명하고, 상자가
 * 아니라 글자로 서므로 넓게 둘 이유가 없다.
 */
export function columnWidthRem(column: FormColumn): number | null {
  if (column.source) return 7
  if (column.type === 'DATE') return 9
  if (column.type === 'SELECT' || column.type === 'VAT_KIND') return 7.5
  if (isNumericColumn(column.type)) return 8
  // TEXT·BUDGET_REF·PARTNER_REF — 적히는 값에 상한이 없거나 고르는 자리라 남는 폭을 갖는다.
  return null
}
