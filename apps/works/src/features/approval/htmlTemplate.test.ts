import { describe, expect, it } from 'vitest'
import { fillHtmlTemplate } from './htmlTemplate'

describe('fillHtmlTemplate', () => {
  it('편집할 전체 HTML에서 문서 원장 표식만 자동으로 치환한다', () => {
    const html = fillHtmlTemplate(
      '<p>{{# 문서 번호}} / {{# 문서 제목}} / {{# 수신}}</p>',
      { docNo: '공문-001', title: '행사 안내' },
    )

    expect(html).toBe('<p>공문-001 / 행사 안내 / {{# 수신}}</p>')
  })

  it('원장 값은 HTML로 실행되지 않게 이스케이프한다', () => {
    const html = fillHtmlTemplate(
      '<p>{{# 문서 제목}}</p>',
      { docNo: null, title: '<img src=x onerror=alert(1)>' },
    )

    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  })
})
