import { describe, expect, it } from 'vitest'
import { extractBytes, needsOriginal, summarize, toResult } from './extract.ts'
import { markupToText, parseCsv, textChunks } from './textParse.ts'
import { normalizeExtractBody, sanitizeText } from './sanitize.ts'
import { officeChunks, OFFICE_MIMES } from './officeText.ts'
import type { ExtractChunk } from './types.ts'

/**
 * 자료 분석(파싱) 회귀 테스트.
 *
 * 여기서 지키는 것은 **구조**다. 글자만 맞고 표의 행·열이 흐트러지면 모델은 매출을 엉뚱한
 * 연도에 붙이고, 자리 표시가 사라지면 근거를 "그 파일 어딘가"로밖에 말하지 못한다. 둘 다
 * 오류가 아니라 **그럴듯한 오답**으로 나오므로 사람이 알아채기 어렵다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.10
 */

/** 압축 없이(method 0) 담은 ZIP 하나. 우리 코드가 하는 일은 "어디서 몇 바이트"라 이걸로 족하다. */
function zipOf(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, body] of Object.entries(files)) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(body)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 0, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)
    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const l of locals) {
    out.set(l, p)
    p += l.length
  }
  for (const c of centrals) {
    out.set(c, p)
    p += c.length
  }
  const ev = new DataView(out.buffer, p)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  return out.buffer
}

const chunksOf = async (buf: ArrayBuffer, mime: string): Promise<ExtractChunk[]> => {
  const out = await officeChunks(buf, mime, '자료')
  if (!Array.isArray(out)) throw new Error(out.message)
  return out
}

describe('xlsx — 표 구조를 배열로 남긴다', () => {
  const book = '<workbook><sheets><sheet name="손익" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'

  const sheetZip = (sheet: string, shared = '<sst/>') =>
    zipOf({
      'xl/workbook.xml': book,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml': sheet,
    })

  it('시트 한 장이 조각 하나이고 표가 행·열 배열로 함께 온다', async () => {
    const sheet =
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1000</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>-320</v></c></row>' +
      '</sheetData></worksheet>'
    const shared = '<sst><si><t>매출</t></si><si><t>영업이익</t></si></sst>'
    const chunks = await chunksOf(sheetZip(sheet, shared), OFFICE_MIMES.xlsx)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.kind).toBe('sheet')
    expect(chunks[0]!.location).toBe('시트: 손익')
    // 글자와 배열이 같은 내용을 두 모양으로 갖는다(모델에는 글자, 골라 보낼 때는 배열).
    expect(chunks[0]!.text).toBe('매출\t1000\n영업이익\t-320')
    expect(chunks[0]!.tables).toEqual([
      [
        ['매출', '1000'],
        ['영업이익', '-320'],
      ],
    ])
  })

  it('빠진 칸이 열을 밀지 않는다(B가 없으면 B 자리가 빈 칸으로 남는다)', async () => {
    const sheet =
      '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row></sheetData></worksheet>'
    const chunks = await chunksOf(sheetZip(sheet), OFFICE_MIMES.xlsx)
    expect(chunks[0]!.tables[0]).toEqual([['1', '', '3']])
  })
})

describe('docx — 문단과 표를 가른다', () => {
  it('표는 자기 조각으로 서고 문단은 표 바깥 글자만 담는다', async () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>사업 개요입니다</w:t></w:r></w:p>' +
      '<w:tbl>' +
      '<w:tr><w:tc><w:p><w:r><w:t>연도</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>매출</w:t></w:r></w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:p><w:r><w:t>2024</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1200</w:t></w:r></w:p></w:tc></w:tr>' +
      '</w:tbl>' +
      '<w:p><w:r><w:t>이상입니다</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const chunks = await chunksOf(zipOf({ 'word/document.xml': xml }), OFFICE_MIMES.docx)

    const paragraphs = chunks.filter((c) => c.kind === 'paragraph')
    const tables = chunks.filter((c) => c.kind === 'table')
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]!.text).toBe('사업 개요입니다\n이상입니다')
    // 표 안의 글자가 문단으로 새어 나오면 같은 값이 두 번 들어가 모델이 중복으로 읽는다.
    expect(paragraphs[0]!.text).not.toContain('2024')
    expect(tables).toHaveLength(1)
    expect(tables[0]!.location).toBe('표 1')
    expect(tables[0]!.tables[0]).toEqual([
      ['연도', '매출'],
      ['2024', '1200'],
    ])
  })
})

describe('pptx — 장표 번호가 자리 표시가 된다', () => {
  it('번호 순서로 서고 표는 배열로도 남는다', async () => {
    const chunks = await chunksOf(
      zipOf({
        'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>둘째 장</a:t></a:r></a:p></p:sld>',
        'ppt/slides/slide1.xml':
          '<p:sld><a:tbl><a:tr><a:tc><a:p><a:r><a:t>구분</a:t></a:r></a:p></a:tc>' +
          '<a:tc><a:p><a:r><a:t>값</a:t></a:r></a:p></a:tc></a:tr></a:tbl></p:sld>',
      }),
      OFFICE_MIMES.pptx,
    )
    expect(chunks.map((c) => c.location)).toEqual(['슬라이드 1', '슬라이드 2'])
    expect(chunks[0]!.tables[0]).toEqual([['구분', '값']])
  })
})

describe('글자 계열', () => {
  it('CSV의 따옴표 안 쉼표는 열을 가르지 않는다', () => {
    expect(parseCsv('연도,매출\n2024,"1,200"')).toEqual([
      ['연도', '매출'],
      ['2024', '1,200'],
    ])
  })

  it('CSV는 표로 선다', () => {
    const chunks = textChunks('연도,매출\n2024,1200', 'text/csv')
    expect(chunks[0]!.kind).toBe('sheet')
    expect(chunks[0]!.tables[0]).toEqual([
      ['연도', '매출'],
      ['2024', '1200'],
    ])
  })

  it('HTML은 스크립트·스타일을 걷고 본문만 남긴다', () => {
    const html = '<html><style>.a{color:red}</style><body><p>본문입니다</p><script>alert(1)</script></body></html>'
    expect(markupToText(html)).toBe('본문입니다')
  })

  it('긴 글은 도막마다 자리 표시를 갖는다', () => {
    const long = Array.from({ length: 4_000 }, (_, i) => `${i}번째 줄입니다`).join('\n')
    const chunks = textChunks(long, 'text/plain')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]!.location).toBe('본문 1/' + chunks.length)
  })
})

describe('원본으로 보내는 형식', () => {
  it('PDF와 이미지는 우리가 열지 않는다', async () => {
    expect(needsOriginal('application/pdf')).toBe(true)
    expect(needsOriginal('image/png')).toBe(true)
    expect(needsOriginal(OFFICE_MIMES.xlsx)).toBe(false)
    const out = await extractBytes(new ArrayBuffer(8), 'application/pdf', '계획서.pdf')
    expect(out.status).toBe('failed')
  })
})

describe('요약 건수', () => {
  it('종류별 개수와 글자 수를 함께 센다', () => {
    const chunks: ExtractChunk[] = [
      { kind: 'sheet', location: '시트: A', text: '가나다', tables: [[['1']]] },
      { kind: 'slide', location: '슬라이드 1', text: '라마바', tables: [] },
    ]
    expect(summarize(chunks)).toEqual({ chars: 6, sheets: 1, slides: 1, tables: 1 })
  })

  it('읽을 것이 없으면 실패로 답한다(빈 성공을 만들지 않는다)', () => {
    expect(toResult([], '표지.pptx').status).toBe('failed')
  })
})

describe('밖에서 들어온 결과를 되세운다', () => {
  const chunk = (over: Partial<ExtractChunk> = {}) => ({
    kind: 'text',
    location: '본문',
    text: '사업계획서 내용입니다',
    tables: [],
    ...over,
  })

  it('모르는 종류와 빈 조각은 버린다', () => {
    const out = normalizeExtractBody({
      chunks: [chunk(), { kind: '스크립트', location: 'x', text: '나쁜 것', tables: [] }, chunk({ text: '' })],
    })
    expect('body' in out).toBe(true)
    if (!('body' in out)) return
    expect(out.body.chunks).toHaveLength(1)
  })

  it('제어문자와 태그를 걷는다', () => {
    expect(sanitizeText('가<script>나쁜 것</script>나')).toBe('가 나쁜 것 나')
    expect(sanitizeText(`가${String.fromCharCode(0)}나${String.fromCharCode(7)}다`)).toBe('가나다')
    // 줄바꿈과 탭은 남는다 — 표의 열이 그것으로 갈린다.
    expect(sanitizeText('가\t나\n다')).toBe('가\t나\n다')
  })

  it('모양이 어긋나면 거절한다(크기가 아니라 계약의 문제다)', () => {
    expect(normalizeExtractBody(null)).toEqual({ error: '분석 결과의 모양이 올바르지 않습니다.' })
    expect(normalizeExtractBody({ chunks: 'x' })).toEqual({ error: '분석 결과의 모양이 올바르지 않습니다.' })
    expect(normalizeExtractBody({ chunks: [] })).toEqual({ error: '분석 결과에 읽을 글자가 없습니다.' })
  })

  it('상한을 넘긴 조각 수는 앞에서 끊고 잘렸다고 말한다', () => {
    const many = Array.from({ length: 900 }, () => chunk())
    const out = normalizeExtractBody({ chunks: many })
    if (!('body' in out)) throw new Error('되세우기에 실패했습니다')
    expect(out.body.chunks).toHaveLength(600)
    expect(out.summary.truncated).toBe(true)
  })

  it('표의 행·열 상한을 넘겨도 앞부분은 살린다', () => {
    const rows = Array.from({ length: 600 }, (_, i) => [String(i), '값'])
    const out = normalizeExtractBody({ chunks: [chunk({ tables: [rows] })] })
    if (!('body' in out)) throw new Error('되세우기에 실패했습니다')
    expect(out.body.chunks[0]!.tables[0]).toHaveLength(500)
  })
})
