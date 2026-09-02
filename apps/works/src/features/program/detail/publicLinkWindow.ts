/**
 * 링크 공개 기간의 **표시용 계산** — 서버 게이트가 쓰는 규칙을 화면에서 한 번 더 읽는다.
 *
 * 판정의 정본은 `supabase/functions/_shared/publicModuleLinkGate.ts`(`effectiveWindow`/`kstDay`)
 * 이며 여기는 그 사본이다. 사본을 만드는 것은 이 저장소가 꺼리는 일이지만, 런타임이 갈려
 * (Deno 함수 ↔ 브라우저 번들) 같은 파일을 가져다 쓸 수 없고, **화면이 규칙을 모르면 담당자가
 * 사실과 다른 문장을 읽는다** — 실제로 모집 설정은 링크에 적힌 기간만 보고 '공개중' 배지를
 * 그려서, 모듈 기간이 지나 바깥에서는 닫힌 주소를 열려 있다고 말하고 있었다.
 *
 * 그래서 사본의 범위를 **기간 계산 한 조각으로 좁힌다**. 열고 닫는 최종 판정(링크 상태·모듈
 * 생존·사업 생존·ADMIN 상한)은 여기 들이지 않는다 — 그것까지 옮기면 두 벌이 어긋났을 때
 * 어느 쪽이 진짜인지 판정할 근거가 없어진다. 화면은 "지금 이 주소가 언제까지 열려 있나"만
 * 되읽고, 실제로 열어 줄지는 서버가 답한다.
 */
import dayjs from 'dayjs'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * 'YYYY-MM-DD'를 KST 하루의 시작/끝으로 읽는다(게이트와 동일).
 *
 * 모듈 기간은 시각이 없는 날짜라 그대로 Date로 넘기면 UTC 자정으로 해석되어 마감일 당일
 * 오전 9시에 이미 닫힌 것으로 보인다. 마감일은 **그날이 끝날 때까지** 열려 있다.
 */
export function kstDay(date: string, edge: 'start' | 'end'): string {
  return edge === 'start' ? `${date}T00:00:00+09:00` : `${date}T23:59:59.999+09:00`
}

export interface LinkWindowInput {
  /** 링크 원장에 담당자가 직접 넣은 기간(ISO). */
  linkOpenAt: string | null
  linkCloseAt: string | null
  /** 모듈 세팅의 기간('YYYY-MM-DD'). 링크에 기간이 없으면 이 값을 상속한다. */
  moduleStartDate?: string | null
  moduleEndDate?: string | null
}

export interface LinkWindow {
  /** 상속을 적용한 실제 공개 기간(ISO). null이면 그 방향으로 경계가 없다. */
  openAt: string | null
  closeAt: string | null
  /** 이 경계가 모듈 기간에서 온 것인가(담당자가 직접 넣은 값이 아닌가). */
  openInherited: boolean
  closeInherited: boolean
}

/**
 * 링크에 적힌 기간이 우선, 없으면 모듈 기간을 상속한다.
 *
 * 상속 여부를 함께 돌려주는 이유는 화면이 **왜 그 시각인지**를 말해야 하기 때문이다.
 * 담당자가 비워 둔 칸이 무기한이 아니라 모듈 기간을 따른다는 사실은, 그 기간이 지나 링크가
 * 닫힌 뒤에 알게 되면 이미 늦다.
 */
export function effectiveLinkWindow(input: LinkWindowInput): LinkWindow {
  const start = input.moduleStartDate && DATE_ONLY.test(input.moduleStartDate) ? input.moduleStartDate : null
  const end = input.moduleEndDate && DATE_ONLY.test(input.moduleEndDate) ? input.moduleEndDate : null
  const openInherited = input.linkOpenAt == null && start != null
  const closeInherited = input.linkCloseAt == null && end != null
  return {
    openAt: input.linkOpenAt ?? (start ? kstDay(start, 'start') : null),
    closeAt: input.linkCloseAt ?? (end ? kstDay(end, 'end') : null),
    openInherited,
    closeInherited,
  }
}

/**
 * 실제 공개 기간 한 줄(되읽기). 비워 둔 칸이 무엇으로 채워졌는지를 말한다.
 *
 * 접지 않는다 — 담당자가 넣은 값을 그대로 되읽어 주는 문장이라 안내 문구 접기 규칙의 예외에
 * 해당한다. 이 줄이 없으면 '왜 마감됐는지'를 공개 페이지를 열어 보기 전에는 알 수 없다.
 *
 * 문장을 링크 칸과 모집 설정이 함께 쓴다 — 같은 사실을 두 화면이 다른 말로 하면 담당자는
 * 둘이 다른 규칙인 줄 안다.
 */
export function windowReadback(win: LinkWindow): string {
  const at = (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm')
  const from = win.openAt ? `${at(win.openAt)}${win.openInherited ? '(모듈 시작일)' : ''}` : '지금부터'
  const to = win.closeAt ? `${at(win.closeAt)}${win.closeInherited ? '(모듈 종료일)' : ''}` : '무기한'
  return `실제 공개 기간 ${from} ~ ${to}`
}
