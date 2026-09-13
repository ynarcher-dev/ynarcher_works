import { describe, expect, it } from 'vitest'
import { parseGuestGrid, validateGuestRows } from '@/features/guest/guestBatch'
import { GUEST_SHEET_MAX_ROWS, readGuestSheet } from '@/features/guest/guestBatchFile'

/**
 * 올린 파일 → 격자. 지키는 것은 **조용한 빈 결과**다 — 열을 못 찾거나 압축을 잘못 풀면 오류가
 * 아니라 0줄이 나오고, 담당자는 파일을 올렸는데 왜 표가 비었는지 알 수 없다.
 *
 * XLSX를 여기서 함께 보는 이유는 엑셀 리더를 새로 들이지 않았기 때문이다 — 이미 있는 자료 분석
 * 파서(`@docparse/officeText.ts`)를 쓰고 있으므로, 그 파서가 우리가 기대하는 모양(첫 시트의 표)을
 * 계속 내주는지 이 테스트가 지킨다.
 */

/** 압축 없이(method 0) 담은 ZIP 하나. 실제 xlsx는 deflate지만, 우리 코드가 하는 일은
 *  '어디서부터 몇 바이트를 읽을지'라 저장 방식으로도 같은 경로가 검증된다. */
function zipOf(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(content)

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

const csvFile = (body: string, name = '계정.csv') => new File([body], name, { type: 'text/csv' })

const xlsxFile = (buf: ArrayBuffer, name = '계정.xlsx') =>
  new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

describe('readGuestSheet — CSV', () => {
  it('헤더와 데이터 줄을 격자로 돌려준다', async () => {
    const read = await readGuestSheet(
      csvFile('이름,이메일,연락처\n홍길동,hong@example.com,010-1234-5678'),
    )
    expect(read.grid[0]).toEqual(['이름', '이메일', '연락처'])
    expect(parseGuestGrid(read.grid).rows).toHaveLength(1)
  })

  it('쉼표가 든 값은 따옴표 안에서 한 칸으로 읽는다', async () => {
    const read = await readGuestSheet(csvFile('이름,이메일,연락처\n"홍, 길동",a@x.com,01011112222'))
    expect(parseGuestGrid(read.grid).rows[0]).toMatchObject({ name: '홍, 길동', email: 'a@x.com' })
  })

  it('빈 파일은 읽을 내용이 없다고 던진다 — 0줄을 조용히 돌려주지 않는다', async () => {
    await expect(readGuestSheet(csvFile(''))).rejects.toThrow('읽을 내용이 없습니다')
  })
})

describe('readGuestSheet — XLSX', () => {
  const book =
    '<workbook><sheets><sheet name="명단" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const rels =
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
  const shared =
    '<sst><si><t>이름</t></si><si><t>이메일</t></si><si><t>연락처</t></si>' +
    '<si><t>홍길동</t></si><si><t>hong@example.com</t></si><si><t>010-1234-5678</t></si></sst>'
  const sheet1 =
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>' +
    '</sheetData></worksheet>'

  const workbook = () =>
    zipOf({
      'xl/workbook.xml': book,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml': sheet1,
    })

  it('첫 시트의 표를 격자로 읽고 시트 이름을 함께 돌려준다', async () => {
    const read = await readGuestSheet(xlsxFile(workbook()))
    expect(read.sheetName).toBe('명단')
    expect(read.grid[0]).toEqual(['이름', '이메일', '연락처'])
    expect(parseGuestGrid(read.grid).rows[0]).toMatchObject({
      name: '홍길동',
      email: 'hong@example.com',
      phone: '010-1234-5678',
    })
  })

  it('확장자만 xlsx인 파일은 열지 못한다고 답한다', async () => {
    await expect(
      readGuestSheet(xlsxFile(new TextEncoder().encode('그냥 글자입니다').buffer)),
    ).rejects.toThrow('열 수 없는 파일입니다')
  })
})

/**
 * **자르지 않는다**를 지키는 자리.
 *
 * 자료 분석용 리더는 시트 앞 400줄만 읽는다. 그 상한이 명단 업로드에 그대로 걸리면 두 가지가
 * 한꺼번에 망가진다 — 401번째 사람의 계정이 조용히 만들어지지 않고, 목록 안 중복 판정이 잘린
 * 뒤쪽을 보지 못해 3번 줄과 겹치는 500번 줄을 통과시킨다. 아래 두 테스트가 각각을 지킨다.
 */
describe('readGuestSheet — 자르지 않는다', () => {
  /** 인라인 문자열 셀로만 채운 시트(공유 문자열 표를 만들 필요가 없다). */
  function sheetOf(rows: string[][]): string {
    const cell = (v: string, col: number, r: number) =>
      `<c r="${String.fromCharCode(65 + col)}${r}" t="inlineStr"><is><t>${v}</t></is></c>`
    const body = rows
      .map((cells, i) => `<row r="${i + 1}">${cells.map((v, c) => cell(v, c, i + 1)).join('')}</row>`)
      .join('')
    return `<worksheet><sheetData>${body}</sheetData></worksheet>`
  }

  function workbookOf(rows: string[][]): ArrayBuffer {
    return zipOf({
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="명단" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': sheetOf(rows),
    })
  }

  /** 계정 N줄(헤더 포함). 이메일·연락처는 줄마다 다르게 만든다. */
  function roster(count: number): string[][] {
    const rows: string[][] = [['이름', '이메일', '연락처']]
    for (let i = 0; i < count; i++) {
      rows.push([`사람${i}`, `p${i}@example.com`, `0101${String(i).padStart(7, '0')}`])
    }
    return rows
  }

  it('400줄을 넘겨도 끝까지 읽고, 400번째 뒤의 중복도 함께 걸린다', async () => {
    const rows = roster(450)
    // 3번째 계정과 같은 이메일을 420번째에 심는다 — 앞 400줄만 읽으면 이 줄이 사라지고,
    // 3번째 줄은 '겹치지 않는 줄'로 통과해 계정이 만들어진다.
    rows[420]![1] = rows[3]![1]!

    const read = await readGuestSheet(xlsxFile(workbookOf(rows)))
    expect(read.grid).toHaveLength(451)

    const parsed = parseGuestGrid(read.grid)
    expect(parsed.rows).toHaveLength(450)

    const issues = validateGuestRows(parsed.rows)
    // 겹친 두 줄이 **모두** 걸린다(자르면 둘 다 걸리지 않는다).
    expect(issues.get(parsed.rows[2]!.rowId)?.[0]?.code).toBe('EMAIL_DUPLICATE_IN_BATCH')
    expect(issues.get(parsed.rows[419]!.rowId)?.[0]?.code).toBe('EMAIL_DUPLICATE_IN_BATCH')
    expect(issues.size).toBe(2)
  })

  it('상한을 넘는 파일은 한 줄도 처리하지 않고 통째로 거절한다', async () => {
    const rows = roster(GUEST_SHEET_MAX_ROWS + 1)
    await expect(readGuestSheet(xlsxFile(workbookOf(rows)))).rejects.toThrow(
      '나눠 올리세요',
    )
  })

  it('상한에 딱 맞는 파일은 통과한다 — 경계에서 멀쩡한 파일을 거절하지 않는다', async () => {
    const read = await readGuestSheet(xlsxFile(workbookOf(roster(GUEST_SHEET_MAX_ROWS))))
    expect(read.grid).toHaveLength(GUEST_SHEET_MAX_ROWS + 1)
  })

  it('CSV에도 같은 상한을 건다 — 확장자만 바꿔 우회할 수 없다', async () => {
    const body = roster(GUEST_SHEET_MAX_ROWS + 1)
      .map((cells) => cells.join(','))
      .join('\n')
    await expect(readGuestSheet(csvFile(body))).rejects.toThrow('나눠 올리세요')
  })
})

describe('readGuestSheet — 받지 않는 형식', () => {
  it('구형 .xls는 왜 안 되는지와 무엇을 할지 함께 말한다', async () => {
    await expect(readGuestSheet(new File([''], '명단.xls'))).rejects.toThrow('.xlsx 또는 CSV')
  })

  it('그 밖의 형식은 받지 않는다', async () => {
    await expect(readGuestSheet(new File([''], '명단.pdf'))).rejects.toThrow('CSV 또는 XLSX')
  })
})
