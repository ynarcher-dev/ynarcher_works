import { describe, expect, it } from 'vitest'
import { isOfficeMime, officeText, OFFICE_MIMES } from './officeText.ts'
import { readZipIndex } from './zip.ts'

/**
 * 오피스 파일 읽기 회귀 테스트.
 *
 * 여기서 지키는 것은 **조용한 빈 결과**다. 압축을 잘못 풀거나 XML 규칙을 하나 놓치면 오류가
 * 나는 게 아니라 글자가 안 나오고, 그러면 모델은 근거 없이 빈 초안을 돌려준다 — 담당자는
 * 자료를 넣었는데 왜 아무것도 안 채워졌는지 알 수 없다.
 *
 * ZIP은 테스트 안에서 직접 만든다(압축하지 않은 저장 방식). 실제 오피스 파일은 deflate지만,
 * 푸는 일은 런타임의 `DecompressionStream`이 하고 우리 코드가 하는 일은 **어디서부터 몇 바이트를
 * 읽을지 정하는 것**이라 그 부분은 저장 방식으로도 똑같이 검증된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.2
 */

/** 압축 없이(method 0) 담은 ZIP 하나를 만든다. */
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
    lv.setUint16(8, 0, true) // 저장(압축 없음)
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

const text = async (buf: ArrayBuffer, mime: string) => {
  const out = await officeText(buf, mime, '자료')
  if (typeof out !== 'string') throw new Error(`읽지 못했습니다: ${out.message}`)
  return out
}

describe('zip 리더', () => {
  it('항목 이름과 위치를 읽는다', () => {
    const index = readZipIndex(zipOf({ 'a.xml': '<a/>', 'b/c.xml': '<c/>' }))
    expect([...(index?.keys() ?? [])]).toEqual(['a.xml', 'b/c.xml'])
  })

  it('ZIP이 아니면 null이다(오피스 파일이 아닌 것을 여기까지 들이지 않는다)', () => {
    expect(readZipIndex(new TextEncoder().encode('그냥 글자입니다').buffer)).toBeNull()
  })
})

describe('docx', () => {
  it('문단마다 줄을 바꾸고 본문 글자만 남긴다', async () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>첫째 문단</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">둘째</w:t></w:r><w:r><w:t> 문단</w:t></w:r></w:p>' +
      // 필드 코드는 사람이 읽는 글자가 아니다 — <w:t> 밖이라 따라오지 않아야 한다.
      '<w:p><w:instrText>PAGEREF _Toc1</w:instrText></w:p>' +
      '</w:body></w:document>'
    expect(await text(zipOf({ 'word/document.xml': xml }), OFFICE_MIMES.docx)).toBe('[문단 1-2]\n첫째 문단\n둘째 문단')
  })

  it('XML 엔티티를 되돌린다', async () => {
    const xml = '<w:p><w:r><w:t>A&amp;B &lt;주&gt;</w:t></w:r></w:p><w:p><w:r><w:t>같은 줄 아님</w:t></w:r></w:p>'
    expect(await text(zipOf({ 'word/document.xml': xml }), OFFICE_MIMES.docx)).toBe('[문단 1-2]\nA&B <주>\n같은 줄 아님')
  })
})

describe('pptx', () => {
  it('장표 번호를 붙이고 순서대로 세운다(10장이 2장 앞에 오지 않는다)', async () => {
    const slide = (t: string) => `<p:sld><p:cSld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:cSld></p:sld>`
    const out = await text(
      zipOf({
        'ppt/slides/slide10.xml': slide('열째 장'),
        'ppt/slides/slide2.xml': slide('둘째 장'),
        'ppt/slides/slide1.xml': slide('첫째 장'),
      }),
      OFFICE_MIMES.pptx,
    )
    expect(out).toBe('[슬라이드 1]\n첫째 장\n\n[슬라이드 2]\n둘째 장\n\n[슬라이드 10]\n열째 장')
  })

  it('글자 없는 장표도 번호를 남긴다(비어 있다는 사실도 정보다)', async () => {
    const out = await text(
      zipOf({
        'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>표지</a:t></a:r></a:p></p:sld>',
        'ppt/slides/slide2.xml': '<p:sld><p:pic/></p:sld>',
      }),
      OFFICE_MIMES.pptx,
    )
    expect(out).toContain('[슬라이드 2]\n(글자 없음 — 이미지 장표)')
  })
})

describe('xlsx', () => {
  const book =
    '<workbook><sheets><sheet name="손익계산서" sheetId="1" r:id="rId1"/>' +
    '<sheet name="빈 시트" sheetId="2" r:id="rId2"/></sheets></workbook>'
  const rels =
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'
  const shared = '<sst><si><t>매출</t></si><si><t>영업이익</t></si></sst>'

  it('시트 이름과 표를 그대로 옮긴다(공유 문자열을 풀어서)', async () => {
    const sheet1 =
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1000</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>-320</v></c></row>' +
      '</sheetData></worksheet>'
    const out = await text(
      zipOf({
        'xl/workbook.xml': book,
        'xl/_rels/workbook.xml.rels': rels,
        'xl/sharedStrings.xml': shared,
        'xl/worksheets/sheet1.xml': sheet1,
        'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>',
      }),
      OFFICE_MIMES.xlsx,
    )
    expect(out).toBe('[시트: 손익계산서]\n매출\t1000\n영업이익\t-320')
    // 빈 시트는 세우지 않는다 — 이름만 남으면 모델이 그 이름을 근거로 없는 값을 지어낸다.
    expect(out).not.toContain('빈 시트')
  })

  it('빠진 칸을 채워 열이 어긋나지 않게 한다', async () => {
    // B열이 없는 행. 자리를 비워 두지 않으면 C열 값이 B열로 밀린다.
    const sheet1 =
      '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row></sheetData></worksheet>'
    const out = await text(
      zipOf({
        'xl/workbook.xml': '<workbook><sheets><sheet name="시트1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': sheet1,
      }),
      OFFICE_MIMES.xlsx,
    )
    expect(out).toBe('[시트: 시트1]\n1\t\t3')
  })

  it('셀에 직접 박힌 글자(inlineStr)도 읽는다', async () => {
    const sheet1 =
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>직접 입력</t></is></c></row></sheetData></worksheet>'
    const out = await text(
      zipOf({
        'xl/workbook.xml': '<workbook><sheets><sheet name="시트1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': sheet1,
      }),
      OFFICE_MIMES.xlsx,
    )
    expect(out).toContain('직접 입력')
  })
})

describe('읽지 못하는 경우는 사유를 말한다', () => {
  it('ZIP이 아니면 암호·손상으로 안내한다', async () => {
    const out = await officeText(new TextEncoder().encode('not a zip').buffer, OFFICE_MIMES.docx, '계획서.docx')
    expect(typeof out).not.toBe('string')
    expect((out as { message: string }).message).toContain('계획서.docx')
  })

  it('글자가 없으면 그림뿐인 문서로 안내한다(조용히 빈 결과를 내지 않는다)', async () => {
    const out = await officeText(zipOf({ 'word/document.xml': '<w:body/>' }), OFFICE_MIMES.docx, '표지.docx')
    expect(typeof out).not.toBe('string')
    expect((out as { message: string }).message).toContain('그림만')
  })
})

describe('isOfficeMime', () => {
  it('세 형식만 우리가 연다', () => {
    expect(isOfficeMime(OFFICE_MIMES.xlsx)).toBe(true)
    expect(isOfficeMime(OFFICE_MIMES.docx)).toBe(true)
    expect(isOfficeMime(OFFICE_MIMES.pptx)).toBe(true)
    expect(isOfficeMime('application/pdf')).toBe(false)
    // 구형 오피스는 ZIP이 아니라 다른 이진 형식이라 열 수 없다.
    expect(isOfficeMime('application/vnd.ms-excel')).toBe(false)
  })
})

describe('hwpx', () => {
  /** 구역 XML 한 장. 표준 접두사(`hp:`)로 세운다. */
  const section = (body: string) => `<hml><hp:sec>${body}</hp:sec></hml>`
  const para = (t: string) => `<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`

  it('문단을 줄로 세우고 구역을 번호 순으로 잇는다', async () => {
    const out = await text(
      zipOf({
        // 10번이 2번 앞에 오면 회의록의 앞뒤가 뒤집힌다.
        'Contents/section10.xml': section(para('열째 구역')),
        'Contents/section2.xml': section(para('둘째 구역')),
        'Contents/section0.xml': section(para('첫째 구역')),
      }),
      OFFICE_MIMES.hwpx,
    )
    expect(out).toBe('[문단 1-3]\n첫째 구역\n둘째 구역\n열째 구역')
  })

  it('표를 문단에서 떼어 자기 자리로 세운다', async () => {
    const table =
      '<hp:tbl><hp:tr>' +
      '<hp:tc><hp:subList>' + para('항목') + '</hp:subList></hp:tc>' +
      '<hp:tc><hp:subList>' + para('값') + '</hp:subList></hp:tc>' +
      '</hp:tr></hp:tbl>'
    const out = await text(zipOf({ 'Contents/section0.xml': section(para('앞 문단') + table) }), OFFICE_MIMES.hwpx)
    expect(out).toBe('[문단 1-1]\n앞 문단\n\n[표 1]\n항목\t값')
  })

  it('접두사가 달라도 읽는다(어긋나면 오류가 아니라 빈 결과가 된다)', async () => {
    const xml = '<hml><p><run><t>접두사가 없는 구역 문서입니다</t></run></p></hml>'
    expect(await text(zipOf({ 'Contents/section0.xml': xml }), OFFICE_MIMES.hwpx)).toBe(
      '[문단 1-1]\n접두사가 없는 구역 문서입니다',
    )
  })

  it('XML 엔티티를 되돌린다', async () => {
    const out = await text(
      zipOf({ 'Contents/section0.xml': section(para('㈜알투씨 &amp; 파트너 &lt;주&gt;')) }),
      OFFICE_MIMES.hwpx,
    )
    expect(out).toBe('[문단 1-1]\n㈜알투씨 & 파트너 <주>')
  })
})
