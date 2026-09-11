import { describe, expect, it } from 'vitest'
import { fillHtmlTemplate } from './htmlTemplate'

describe('fillHtmlTemplate', () => {
  it('문서 원장 값과 사용자가 입력한 표식을 한 원문에 치환한다', () => {
    const html = fillHtmlTemplate(
      '<p>{{# 문서 번호}} / {{# 문서 제목}} / {{# 수신}}</p>{{#에디터}}',
      { slots: { 수신: '중소벤처기업부', 에디터: '<p><strong>본문</strong></p>' } },
      { docNo: '공문-001', title: '행사 안내' },
    )

    expect(html).toBe(
      '<p>공문-001 / 행사 안내 / 중소벤처기업부</p><p><strong>본문</strong></p>',
    )
  })

  it('일반 입력값은 HTML로 실행되지 않게 이스케이프한다', () => {
    const html = fillHtmlTemplate(
      '<p>{{# 수신}}</p>',
      { slots: { 수신: '<img src=x onerror=alert(1)>' } },
      { docNo: null, title: '' },
    )

    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  })
})
