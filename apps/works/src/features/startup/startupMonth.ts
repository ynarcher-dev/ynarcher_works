/**
 * 기업 상세의 '월(YYYY-MM) 값' 한 곳의 규칙.
 *
 * 연혁·트랙션·고객·투자·권리·인증·합류 시점은 모두 **월까지만** 뜻이 있는 값이라 화면의 입력도
 * 월 선택기(`<input type="month">`) 하나다. 그런데 원장에는 일까지 붙은 값이 섞여 들어와 있다 —
 * 옛 화면이 날짜로 받던 시절의 행과, 서버 검증(`startup-ai-fill`의 `ym`)이 `YYYY-MM-DD`도
 * 통과시키던 초안이 그것이다.
 *
 * 월 선택기는 형식이 어긋난 값을 **그리지 않고 빈 칸으로 둔다**(브라우저는 콘솔 경고만 남긴다).
 * 그래서 값이 있는데도 담당자에게는 안 적힌 것처럼 보였고, 그 칸을 건드리지 않고 저장하면 보이지도
 * 않는 옛 값이 그대로 남았다. 읽는 자리에서 월로 접어 두면 폼과 조회가 같은 값을 말하고, 저장할
 * 때 자연히 월로 굳는다.
 */

/** 월(YYYY-MM)로 자른 값. 빈 값은 빈 문자열. */
export function monthValue(v: string | null | undefined): string {
  return v ? String(v).slice(0, 7) : ''
}

/**
 * 목록 원소의 월 칸 하나를 접는다. **바꿀 것이 없으면 원본을 그대로 돌려준다.**
 *
 * 없는 칸을 만들지 않는 것이 요점이다 — 시점을 안 적은 고객 행(`{ name: '고객사' }`)에
 * `date: ''`를 채워 넣으면, 화면에서는 똑같아 보여도 저장되는 값이 달라지고 '안 적음'과
 * '비워 둠'이 원장에서 같아진다. 그래서 일까지 붙은 값만 건드린다.
 */
export function foldMonth<T extends object>(entry: T, key: keyof T): T {
  const v = entry[key]
  if (typeof v !== 'string' || v.length <= 7) return entry
  return { ...entry, [key]: v.slice(0, 7) }
}
