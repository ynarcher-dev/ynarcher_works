import { parseCsvTable } from '@/lib/csv'
import { OFFICE_MIMES, xlsxFirstSheetGrid } from '@docparse/officeText.ts'

/**
 * 올린 파일 한 장을 **문자열 격자**로 만든다. 여기까지가 형식의 일이고, 그 격자를 계정 줄로
 * 바꾸는 판정은 `guestBatch.parseGuestGrid`가 소유한다.
 *
 * 두 형식을 받는 이유는 담당자가 실제로 들고 오는 것이 엑셀 파일이기 때문이다. CSV만 받으면
 * 매번 '다른 이름으로 저장'을 거쳐야 하고, 그 과정에서 긴 번호가 지수 표기로 망가진다.
 *
 * **새 의존성을 들이지 않는다.** XLSX는 이미 우리가 가진 파서(`@docparse/officeText.ts`)가
 * 연다 — 그쪽은 Deno API 없이 짜여 브라우저에서 그대로 돈다(3_3_5 §16.2). 엑셀 리더를 하나 더
 * 들이면 같은 파일을 두 파서가 다르게 읽는다.
 *
 * **자르지 않는다.** 자료 분석용 조각 API는 시트 앞부분만 읽지만 이 경로는 전체를 읽는
 * `xlsxFirstSheetGrid`를 쓴다. 잘린 명단은 두 가지를 한꺼번에 망가뜨린다 — 잘린 줄의 계정이
 * 조용히 만들어지지 않고, 목록 안 중복 판정이 잘린 뒤쪽 줄을 보지 못해 겹친 줄을 통과시킨다.
 * 상한을 넘는 파일은 **한 줄도 처리하지 않고 거절한다.**
 */

/**
 * 한 파일에서 받는 계정 줄(헤더 제외) 상한.
 *
 * 서버가 한 번에 받는 줄(200)과는 다른 축이다 — 그쪽은 한 호출의 크기라 화면이 잘라 보내면
 * 되지만(`chunkGuestRows`), 이쪽은 **한 번에 검증해야 하는 목록의 크기**다. 목록 안 중복은
 * 전체를 함께 봐야 답이 나오므로 여기서 나눌 수 없다.
 */
export const GUEST_SHEET_MAX_ROWS = 10000

export interface GuestSheetRead {
  /** 첫 줄이 헤더인 문자열 격자. 파일에 있는 줄 전부다(잘리지 않는다). */
  grid: string[][]
  /** 읽은 시트 이름(XLSX만). CSV는 null. */
  sheetName: string | null
}

/** 상한을 넘었을 때의 문구. 무엇을 해야 하는지까지 말한다. */
function overflowError(): Error {
  return new Error(
    `한 파일에 담을 수 있는 줄은 ${GUEST_SHEET_MAX_ROWS.toLocaleString('ko-KR')}줄입니다. ` +
      '파일을 나눠 올리세요 — 넘치는 파일은 일부만 처리하지 않고 전부 거절합니다.',
  )
}

function isCsv(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv'
}

function isXlsx(file: File): boolean {
  return /\.xlsx$/i.test(file.name) || file.type === OFFICE_MIMES.xlsx
}

async function readCsvGrid(file: File): Promise<GuestSheetRead> {
  const table = parseCsvTable(await file.text())
  if (table.headers.length === 0) throw new Error('파일에서 읽을 내용이 없습니다.')
  // CSV에도 같은 상한을 건다. 형식이 다르다고 상한이 달라지면 같은 명단을 확장자만 바꿔
  // 올렸을 때 한쪽만 거절당한다.
  if (table.rows.length > GUEST_SHEET_MAX_ROWS) throw overflowError()
  return {
    grid: [table.headers, ...table.rows.map((r) => r.cells)],
    sheetName: null,
  }
}

/**
 * 엑셀에서 **값이 있는 첫 시트**를 읽는다. 시트를 고르게 하지 않는 것은 계정 명단이 대개 한
 * 장이고, 고르는 단계를 넣으면 대부분의 담당자에게 아무 의미 없는 질문이 하나 늘기 때문이다.
 * 파서는 서식만 잡아 둔 빈 시트를 이미 걸러내므로 '첫 시트'가 곧 '내용이 있는 첫 시트'다.
 */
async function readXlsxGrid(file: File): Promise<GuestSheetRead> {
  // 헤더 한 줄을 더해 넘긴다 — 상한은 계정 줄의 수이고 격자의 첫 줄은 헤더다.
  const read = await xlsxFirstSheetGrid(await file.arrayBuffer(), GUEST_SHEET_MAX_ROWS + 1)
  if ('overflow' in read) throw overflowError()
  if ('message' in read) throw new Error(read.message)
  return { grid: read.rows.map((r) => [...r]), sheetName: read.sheetName || null }
}

/** 파일 → 격자. 열 수 없는 형식·빈 파일·넘치는 파일은 사람이 고칠 수 있는 문구로 던진다. */
export async function readGuestSheet(file: File): Promise<GuestSheetRead> {
  if (isCsv(file)) return readCsvGrid(file)
  if (isXlsx(file)) return readXlsxGrid(file)
  // 구형 .xls는 ZIP이 아니라 열지 못한다 — 확장자만 보고 시도하면 '손상된 파일'로 잘못 안내된다.
  if (/\.xls$/i.test(file.name)) {
    throw new Error('구형 .xls는 열 수 없습니다. 엑셀에서 .xlsx 또는 CSV로 저장해 올리세요.')
  }
  throw new Error('CSV 또는 XLSX 파일만 올릴 수 있습니다.')
}
