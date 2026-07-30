/**
 * CSV 입출력 공통 유틸 — 대용량 업로드 화면들이 함께 쓴다(NETWORKS 임포터, 자산 임포터).
 * 도메인 지식(헤더 이름·검증 규칙)은 각 화면이 갖고, 여기에는 문자열 처리만 둔다.
 */

/**
 * 바이트 순서 표식(BOM). Excel이 UTF-8 CSV를 한글로 읽게 하려면 파일 앞에 붙여야 하고,
 * 그렇게 만든 파일을 되읽을 때는 걷어내야 한다(헤더 첫 글자에 붙어 열 이름이 어긋난다).
 * 눈에 보이지 않는 글자라 소스에 그대로 적지 않고 이스케이프로 둔다.
 */
const BOM = '\uFEFF'

/** 따옴표/이스케이프를 처리하는 최소 CSV 라인 분해기. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuote = false
      } else cur += c
    } else if (c === '"') inQuote = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** 헤더 한 줄 + 데이터 여러 줄로 분해한 표. 빈 줄과 BOM은 걷어낸다. */
export interface CsvTable {
  headers: string[]
  /** 원본 행 번호(1=헤더)를 함께 들고 다닌다 — 오류를 파일의 그 줄로 되돌릴 수 있어야 한다. */
  rows: { line: number; cells: string[] }[]
}

export function parseCsvTable(text: string): CsvTable {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const lines = body.split(/\r?\n/)
  const headerIndex = lines.findIndex((l) => l.trim() !== '')
  if (headerIndex < 0) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[headerIndex]!).map((h) => h.toLowerCase())
  const rows: CsvTable['rows'] = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!
    if (raw.trim() === '') continue
    rows.push({ line: i + 1, cells: splitCsvLine(raw) })
  }
  return { headers, rows }
}

/** 텍스트를 CSV 파일로 다운로드(Excel 한글 대응 BOM 포함). */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([BOM + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
