// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeRichText } from '@/lib/richText'

/**
 * `sanitizeRichText` 회귀.
 *
 * **실제 DOM이 필요합니다.** 정화기는 `DOMParser`로 파싱하고 `HTMLElement`·CSSOM
 * (`style.textAlign`)을 만집니다. 이 함수의 안전성은 전부 브라우저 HTML 파서의 실제 동작
 * — 전개(unwrap), 네임스페이스, raw-text 요소, 직렬화 이스케이프 — 에 기대고 있어서,
 * 파서를 흉내 낸 가짜는 정확히 그 부분을 검증하지 못합니다. 그래서 이 파일만 위 pragma로
 * jsdom에 올립니다(러너 기본값은 다른 테스트를 위해 `node` 그대로 둡니다).
 *
 * **판정 방법**: 출력 문자열에서 위험해 보이는 낱말을 찾지 않습니다. 그런 검사는
 * `&lt;img onerror=…&gt;`처럼 **무해하게 이스케이프된 글자**까지 실패로 몰아, 정화기가
 * 실제로 한 일을 가립니다. 대신 앱과 같은 경로(`innerHTML` — `dangerouslySetInnerHTML`이
 * 하는 일)로 **출력을 다시 파싱해서**, 그 트리에 허용 밖 요소·이벤트 속성·허용 밖 주소가
 * 하나도 없음을 봅니다.
 *
 * > [!NOTE]
 * > **이 파일이 증명하지 않는 것.** jsdom은 브라우저가 아닙니다. 실제 브라우저에서 무엇이
 * > 실행되는지는 여기서 확인할 수 없고(그 몫은 E2E-1입니다), 통과가 곧 **모든 mXSS 변종에
 * > 안전하다는 뜻도 아닙니다.** 여기 적힌 입력에 대해 현재 허용 목록이 무엇을 남기고 무엇을
 * > 버리는지를 고정할 뿐이며, 허용 목록이 한 줄 바뀌면 그 사실을 알려 주는 것이 목적입니다.
 */

/** 정화기가 남겨도 되는 태그(소문자). `richText.ts`의 `ALLOWED_TAGS`와 짝입니다. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
])

/** 정화기가 남기거나 스스로 붙이는 속성. 이 밖의 속성이 살아남으면 계약 위반입니다. */
const ATTR_CONTRACT: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'loading']),
}

/** 정렬(`style="text-align:…"`)이 되살아나도 되는 태그. */
const ALIGNABLE = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const HTML_NS = 'http://www.w3.org/1999/xhtml'

interface Audit {
  /** 허용 목록 밖 태그(`script`·`template`·`form` …). */
  disallowedTags: string[]
  /** HTML 네임스페이스가 아닌 요소(SVG·MathML). */
  foreignElements: string[]
  /** `on*` 속성. 이스케이프된 **글자**는 요소가 아니므로 여기 잡히지 않습니다. */
  eventAttributes: string[]
  /** 계약에 없는 속성. */
  unexpectedAttributes: string[]
  /** `http(s)`가 아닌 `<a href>`(href 없는 `<a>` 포함). */
  unsafeHrefs: string[]
  /** `data:image/`·`https:`가 아닌 `<img src>`(src 없는 `<img>` 포함). */
  unsafeImgSrcs: string[]
}

const CLEAN: Audit = {
  disallowedTags: [],
  foreignElements: [],
  eventAttributes: [],
  unexpectedAttributes: [],
  unsafeHrefs: [],
  unsafeImgSrcs: [],
}

/** 앱과 같은 경로로 출력을 다시 파싱합니다 — `dangerouslySetInnerHTML`이 하는 일입니다. */
function reparse(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

function auditOf(sanitized: string): Audit {
  const report: Audit = {
    disallowedTags: [], foreignElements: [], eventAttributes: [],
    unexpectedAttributes: [], unsafeHrefs: [], unsafeImgSrcs: [],
  }
  for (const el of Array.from(reparse(sanitized).querySelectorAll('*'))) {
    const tag = el.localName
    if (el.namespaceURI !== HTML_NS) report.foreignElements.push(`${el.namespaceURI}|${tag}`)
    if (!ALLOWED_TAGS.has(tag)) report.disallowedTags.push(tag)

    const contract = ATTR_CONTRACT[tag]
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        report.eventAttributes.push(`${tag}@${name}`)
        continue
      }
      if (name === 'style' && ALIGNABLE.has(tag)) continue
      if (!contract?.has(name)) report.unexpectedAttributes.push(`${tag}@${name}`)
    }

    if (tag === 'a') {
      const href = el.getAttribute('href')
      if (!href || !/^https?:\/\//i.test(href)) report.unsafeHrefs.push(String(href))
    }
    if (tag === 'img') {
      const src = el.getAttribute('src')
      if (!src || !/^(data:image\/|https:\/\/)/i.test(src)) report.unsafeImgSrcs.push(String(src))
    }
  }
  return report
}

/** 정화 후 다시 파싱한 트리에 위험이 하나도 없어야 합니다. 정화된 문자열을 돌려줍니다. */
function expectClean(input: string): string {
  const out = sanitizeRichText(input)
  expect(auditOf(out)).toEqual(CLEAN)
  return out
}

// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeRichText — 실행 태그', () => {
  it.each([
    ['script', '<p>앞</p><script>alert(1)</script><p>뒤</p>'],
    ['대문자 SCRIPT', '<p>앞</p><SCRIPT>alert(1)</SCRIPT><p>뒤</p>'],
    ['외부 script', '<p>앞</p><script src="https://evil.test/x.js" defer></script><p>뒤</p>'],
    ['중첩된 script', '<blockquote><p>앞</p><script>alert(1)</script><p>뒤</p></blockquote>'],
    ['style', '<p>앞</p><style>p{background:url("javascript:alert(1)")}</style><p>뒤</p>'],
    ['iframe', '<p>앞</p><iframe src="https://evil.test"></iframe><p>뒤</p>'],
    ['object', '<p>앞</p><object data="https://evil.test/x.swf"></object><p>뒤</p>'],
    ['embed', '<p>앞</p><embed src="https://evil.test/x.swf"><p>뒤</p>'],
  ])('%s는 요소도 내용도 남기지 않는다', (_name, input) => {
    const out = expectClean(input)
    // 본문 글자는 살아남되 실행 태그의 **내용은 글자로도 남지 않습니다** —
    // 전개(unwrap)가 아니라 제거(remove) 경로여야 합니다.
    expect(reparse(out).textContent).toBe('앞뒤')
  })
})

describe('sanitizeRichText — foreign 네임스페이스(SVG·MathML)', () => {
  it.each([
    ['svg 안의 script', '<svg><script>alert(1)</script></svg>'],
    ['svg 안의 style', '<svg><style>*{}</style></svg>'],
    ['svg 자체 이벤트', '<svg onload="alert(1)"><circle r="1"></circle></svg>'],
    ['svg set', '<svg><set attributeName="href" to="javascript:alert(1)"></set></svg>'],
    ['math 안의 script', '<math><mtext><script>alert(1)</script></mtext></math>'],
    ['svg use', '<svg><use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></use></svg>'],
  ])('%s는 남지 않는다', (_name, input) => {
    expectClean(input)
  })

  it('foreignObject 안의 HTML 문단은 글자를 지키되 이벤트를 잃는다', () => {
    const out = expectClean('<svg><foreignObject><p onclick="alert(1)">글자</p></foreignObject></svg>')
    expect(reparse(out).textContent).toBe('글자')
  })
})

describe('sanitizeRichText — 이벤트 속성', () => {
  it.each([
    ['소문자', '<p onclick="alert(1)">글자</p>'],
    ['대문자', '<p ONCLICK="alert(1)">글자</p>'],
    ['대소문자 혼합', '<p oNcLiCk="alert(1)">글자</p>'],
    ['따옴표 없는 값', '<p onclick=alert(1)>글자</p>'],
    ['여러 개', '<p onclick="alert(1)" onmouseover="alert(2)" onfocus="alert(3)">글자</p>'],
    ['링크 위', '<p><a href="https://a.test" onmouseover="alert(1)">글자</a></p>'],
    ['허용 밖 태그 위', '<div onclick="alert(1)"><p>글자</p></div>'],
    ['body 위', '<body onload="alert(1)"><p>글자</p></body>'],
  ])('%s 이벤트 속성은 떨어지고 글자는 남는다', (_name, input) => {
    const out = expectClean(input)
    expect(reparse(out).textContent).toBe('글자')
  })

  it('이미지의 onerror는 이미지째 사라진다 — src가 허용 밖이면 남길 글자가 없다', () => {
    const out = expectClean('<img src=x onerror=alert(1)>')
    expect(reparse(out).querySelector('img')).toBeNull()
  })

  it('허용 src 이미지는 남고 onerror만 떨어진다', () => {
    const out = expectClean('<img src="https://cdn.test/a.png" onerror="alert(1)">')
    const img = reparse(out).querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://cdn.test/a.png')
    expect(img?.hasAttribute('onerror')).toBe(false)
  })
})

describe('sanitizeRichText — 인코딩·난독화된 javascript: 링크', () => {
  it.each([
    ['평문', 'javascript:alert(1)'],
    ['대소문자 섞기', 'JaVaScRiPt:alert(1)'],
    ['10진 엔티티 중간', 'java&#115;cript:alert(1)'],
    ['10진 엔티티 선두', '&#106;avascript:alert(1)'],
    ['16진 엔티티', '&#x6a;avascript:alert(1)'],
    ['0으로 채운 엔티티', '&#0000106;avascript:alert(1)'],
    ['선행 공백', '   javascript:alert(1)'],
    ['선행 탭', '&#9;javascript:alert(1)'],
    ['선행 개행', '&#10;javascript:alert(1)'],
    ['중간 개행', 'java&#10;script:alert(1)'],
    ['퍼센트 인코딩', '%6a%61vascript:alert(1)'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['data text/html', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['data image/svg(링크 문맥)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
  ])('%s href는 링크를 벗기고 글자만 남긴다', (_name, href) => {
    const out = expectClean(`<p><a href="${href}">링크</a></p>`)
    const host = reparse(out)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toBe('링크')
  })
})

describe('sanitizeRichText — 예상 밖 프로토콜', () => {
  // 정화기는 허용 목록(`^https?://`)이므로 아래는 전부 링크가 벗겨집니다.
  // **현재 동작을 고정할 뿐 정책을 바꾸지 않습니다** — `mailto:`·`tel:`·상대 경로가
  // WORKS 에디터(`safeInlineHref`)에서는 허용되므로, 그 차이가 의도인지는 별도 판단입니다.
  it.each([
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://a.test/x'],
    ['blob', 'blob:https://a.test/0000'],
    ['about', 'about:blank'],
    ['프로토콜 상대', '//evil.test/x'],
    ['절대 경로', '/내부/경로'],
    ['앵커', '#anchor'],
    ['상대 경로', '../위/경로'],
    ['빈 값', ''],
    ['공백만', '   '],
    ['mailto (현재 동작)', 'mailto:a@b.test'],
    ['tel (현재 동작)', 'tel:+8210'],
  ])('%s href는 링크를 벗기고 글자만 남긴다', (_name, href) => {
    const out = expectClean(`<p><a href="${href}">링크</a></p>`)
    const host = reparse(out)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toBe('링크')
  })

  it('href 속성이 아예 없는 <a>도 벗겨진다', () => {
    const out = expectClean('<p><a>링크</a></p>')
    const host = reparse(out)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toBe('링크')
  })
})

describe('sanitizeRichText — img src 제한', () => {
  it.each([
    ['http (https 아님)', '<img src="http://a.test/a.png">'],
    ['javascript', '<img src="javascript:alert(1)">'],
    ['data text/html', '<img src="data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=">'],
    ['data application/javascript', '<img src="data:application/javascript,alert(1)">'],
    ['data (MIME 없음)', '<img src="data:,alert(1)">'],
    ['프로토콜 상대', '<img src="//evil.test/a.png">'],
    ['상대 경로', '<img src="/업로드/a.png">'],
    ['빈 src', '<img src="">'],
    ['src 없음', '<img alt="대체 텍스트">'],
  ])('%s 이미지는 통째로 사라진다', (_name, input) => {
    const out = expectClean(`<p>앞</p>${input}<p>뒤</p>`)
    const host = reparse(out)
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toBe('앞뒤')
  })
})

describe('sanitizeRichText — 허용된 이미지(현재 계약을 지킨다)', () => {
  // WORKS 에디터가 이미지를 base64 `data:image/…`로 인라인 저장합니다
  // (`RichTextEditor.tsx`의 `readAsDataURL`). 이 형식이 살아남는 것이 계약이며,
  // 이 회귀는 그 계약이 조용히 깨지는 것을 막는 쪽으로도 씁니다.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

  it.each([
    ['에디터가 만드는 base64 PNG', PNG],
    ['base64 SVG(현재 허용)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['대문자 스킴·MIME', 'DATA:IMAGE/PNG;base64,iVBORw0KGgo='],
    ['https 업로드 경로', 'https://cdn.test/a.png'],
  ])('%s는 살아남는다', (_name, src) => {
    const out = expectClean(`<img src="${src}" alt="사진">`)
    const img = reparse(out).querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe(src)
    expect(img?.getAttribute('alt')).toBe('사진')
    expect(img?.getAttribute('loading')).toBe('lazy')
  })

  it('앞뒤 공백은 다듬어 남긴다', () => {
    const out = expectClean(`<img src="  ${PNG}  ">`)
    expect(reparse(out).querySelector('img')?.getAttribute('src')).toBe(PNG)
  })

  it('계약 밖 속성(title·width·style·srcset)은 떨어진다', () => {
    const out = expectClean(
      `<img src="${PNG}" alt="사진" title="툴팁" width="100" style="position:fixed" srcset="x 1x">`,
    )
    const img = reparse(out).querySelector('img')
    expect(img?.getAttribute('alt')).toBe('사진')
    expect(Array.from(img?.attributes ?? []).map((a) => a.name).sort()).toEqual(['alt', 'loading', 'src'])
  })
})

describe('sanitizeRichText — 중첩·기형 HTML', () => {
  it.each([
    ['닫히지 않은 태그', '<b><i>글자'],
    ['잘못 겹친 태그', '<b><i>글자</b></i>'],
    ['문단 안의 div', '<p><div><p>글자</p></div></p>'],
    ['표 조각', '<table><tr><td><script>alert(1)</script>셀</td></tr></table>'],
    ['외톨이 li', '<li>외톨이</li>'],
    ['깊은 중첩', '<blockquote><ul><li><p><strong><em>깊다</em></strong></p></li></ul></blockquote>'],
    ['form 입력', '<form><input onfocus=alert(1) autofocus><button formaction="javascript:alert(1)">누르기</button></form>'],
    ['select 안의 style', '<select><option><style><img src=x onerror=alert(1)></style></option></select>'],
    ['a 중첩', '<p><a href="https://a.test"><a href="javascript:alert(1)">중첩</a></a></p>'],
    ['mXSS: math/mglyph/style', '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>'],
    ['mXSS: svg/p/style', '<svg></p><style><a id="</style><img src=x onerror=alert(1)>"></svg>'],
    ['mXSS: noscript 속성 탈출', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">글자</p></noscript>'],
    ['template', '<template><script>alert(1)</script><img src=x onerror=alert(1)></template>'],
    ['주석 안의 태그', '<!--<img src=x onerror=alert(1)>--><p>글자</p>'],
    ['CDATA 흉내', '<![CDATA[<img src=x onerror=alert(1)>]]><p>글자</p>'],
  ])('%s를 넣어도 위험이 남지 않는다', (_name, input) => {
    expectClean(input)
  })

  it.each([
    ['xmp', '<xmp><img src=x onerror=alert(1)></xmp>'],
    ['noembed', '<noembed><img src=x onerror=alert(1)></noembed>'],
    ['plaintext', '<plaintext><img src=x onerror=alert(1)>'],
    // `noframes`는 **본문 뒤에 있을 때만** 여기에 해당합니다(아래 테스트 참조).
    ['noframes(본문 뒤)', '<p>앞</p><noframes><img src=x onerror=alert(1)></noframes>'],
  ])('%s의 raw-text 내용은 요소가 아니라 글자로 남는다', (_name, input) => {
    const out = expectClean(input)
    const host = reparse(out)
    // 이 파일의 판정 방식이 중요한 이유입니다. 출력에는 `onerror`라는 **낱말**이
    // 남지만 그것은 이스케이프된 글자이고, 다시 파싱해도 요소가 되지 않습니다.
    // 낱말 검사였다면 무해한 이 결과를 실패로 몰았을 것입니다.
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('본문 맨 앞의 noframes는 글자로도 남지 않는다 — 파서가 head로 보낸다', () => {
    // HTML 파서의 "in head" 삽입 모드가 `noframes`를 `<head>`에 넣고, 정화기는
    // `doc.body.innerHTML`만 돌려줍니다. 그래서 이 입력만 **내용이 통째로 사라집니다**
    // (다른 raw-text 태그는 body에 들어가 이스케이프된 글자로 남습니다).
    // 더 안전한 쪽이라 고치지 않고 **현재 동작으로 고정**합니다.
    expect(sanitizeRichText('<noframes><img src=x onerror=alert(1)></noframes>')).toBe('')
  })
})

describe('sanitizeRichText — 허용된 서식은 지난다', () => {
  it.each([
    ['문단', '<p>하나</p><p>둘</p>', 'p', 2],
    ['줄바꿈', '<p>줄<br>바꿈</p>', 'br', 1],
    ['굵게(strong)', '<p><strong>굵게</strong></p>', 'strong', 1],
    ['굵게(b)', '<p><b>굵게</b></p>', 'b', 1],
    ['기울임(em)', '<p><em>기울임</em></p>', 'em', 1],
    ['기울임(i)', '<p><i>기울임</i></p>', 'i', 1],
    ['밑줄', '<p><u>밑줄</u></p>', 'u', 1],
    ['취소선', '<p><s>취소</s></p>', 's', 1],
    ['인라인 코드', '<p><code>a=1</code></p>', 'code', 1],
    ['코드 블록', '<pre><code>const a = 1</code></pre>', 'pre', 1],
    ['글머리 목록', '<ul><li>하나</li><li>둘</li></ul>', 'li', 2],
    ['번호 목록', '<ol><li>하나</li></ol>', 'ol', 1],
    ['인용', '<blockquote><p>인용</p></blockquote>', 'blockquote', 1],
    ['구분선', '<p>앞</p><hr><p>뒤</p>', 'hr', 1],
    ['제목 1~3', '<h1>하나</h1><h2>둘</h2><h3>셋</h3>', 'h1,h2,h3', 3],
    // 제목 4~6은 에디터(`levels: [1,2,3]`)가 만들지 않지만 허용 목록에는 있습니다.
    // **현재 계약 그대로** 남는 것을 고정합니다(조판 공백은 이 과제에서 건드리지 않습니다).
    ['제목 4~6', '<h4>넷</h4><h5>다섯</h5><h6>여섯</h6>', 'h4,h5,h6', 3],
  ])('%s는 살아남는다', (_name, input, selector, count) => {
    const out = expectClean(input as string)
    expect(reparse(out).querySelectorAll(selector as string)).toHaveLength(count as number)
  })

  it('허용된 링크에는 target·rel이 붙는다', () => {
    const out = expectClean('<p><a href="https://a.test/x?q=1&amp;r=2">링크</a></p>')
    const a = reparse(out).querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://a.test/x?q=1&r=2')
    expect(a?.getAttribute('target')).toBe('_blank')
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('http 링크도 허용된다 — 이미지와 달리 https로 좁히지 않는다', () => {
    const out = expectClean('<p><a href="http://a.test">링크</a></p>')
    expect(reparse(out).querySelector('a')?.getAttribute('href')).toBe('http://a.test')
  })

  it('에디터가 붙이는 class는 떨어지고 태그는 남는다', () => {
    const out = expectClean('<pre><code class="language-ts">const a = 1</code></pre>')
    const code = reparse(out).querySelector('pre > code')
    expect(code?.textContent).toBe('const a = 1')
    expect(code?.hasAttribute('class')).toBe(false)
  })

  it('글자에 들어간 꺾쇠는 이스케이프되어 그대로 보인다', () => {
    const out = expectClean('<p>a &lt; b &amp;&amp; c &gt; d</p>')
    expect(reparse(out).textContent).toBe('a < b && c > d')
  })
})

describe('sanitizeRichText — 정렬 보존', () => {
  it.each([
    ['가운데', '<p style="text-align:center">글자</p>', 'center'],
    ['오른쪽', '<h2 style="text-align:right">글자</h2>', 'right'],
    ['왼쪽', '<p style="text-align:left">글자</p>', 'left'],
    ['양쪽', '<p style="text-align:justify">글자</p>', 'justify'],
  ])('%s 정렬은 살아남는다', (_name, input, expected) => {
    const out = expectClean(input)
    const el = reparse(out).firstElementChild as HTMLElement
    expect(el.style.textAlign).toBe(expected)
  })

  it('정렬만 남고 나머지 선언은 떨어진다', () => {
    const out = expectClean('<p style="text-align:center;color:red;position:fixed;top:0">글자</p>')
    const el = reparse(out).firstElementChild as HTMLElement
    expect(el.style.textAlign).toBe('center')
    expect(el.style.color).toBe('')
    expect(el.style.position).toBe('')
  })

  it.each([
    ['허용 밖 값(inherit)', '<p style="text-align:inherit">글자</p>'],
    ['허용 밖 값(end)', '<p style="text-align:end">글자</p>'],
    ['정렬 아닌 선언만', '<p style="background:url(javascript:alert(1))">글자</p>'],
    ['정렬 대상 아닌 태그', '<blockquote style="text-align:center">글자</blockquote>'],
    ['목록', '<ul style="text-align:center"><li>글자</li></ul>'],
  ])('%s은 style을 남기지 않는다', (_name, input) => {
    const out = expectClean(input)
    const el = reparse(out).firstElementChild as HTMLElement
    expect(el.getAttribute('style')).toBeNull()
  })

  it('전개되는 태그의 정렬은 자식으로 옮겨 붙지 않는다', () => {
    const out = expectClean('<div style="text-align:center"><p>글자</p></div>')
    const el = reparse(out).firstElementChild as HTMLElement
    expect(el.tagName).toBe('P')
    expect(el.getAttribute('style')).toBeNull()
  })
})

describe('sanitizeRichText — 빈 입력', () => {
  it('빈 문자열·null·undefined는 빈 문자열이다', () => {
    expect(sanitizeRichText('')).toBe('')
    expect(sanitizeRichText(null)).toBe('')
    expect(sanitizeRichText(undefined)).toBe('')
  })

  it('실행 태그만 있는 본문은 빈 문자열이 된다', () => {
    expect(sanitizeRichText('<script>alert(1)</script>')).toBe('')
    expect(sanitizeRichText('<style>p{}</style>')).toBe('')
  })

  it('공백만 있는 본문은 예외 없이 지난다', () => {
    expect(() => sanitizeRichText('   ')).not.toThrow()
    expectClean('   ')
  })

  it('빈 허용 태그는 그대로 둔다', () => {
    const out = expectClean('<p></p>')
    expect(reparse(out).querySelectorAll('p')).toHaveLength(1)
  })
})

describe('sanitizeRichText — 멱등성', () => {
  const NASTY = [
    '<p onclick="alert(1)" style="text-align:center;color:red">가운데</p>',
    '<script>alert(1)</script>',
    '<svg><script>alert(2)</script></svg>',
    '<xmp><img src=x onerror=alert(3)></xmp>',
    '<a href="java&#115;cript:alert(4)">링크</a>',
    '<a href="https://a.test">정상 링크</a>',
    '<img src="data:image/png;base64,iVBORw0KGgo=" alt="사진">',
    '<img src="javascript:alert(5)">',
    '<noscript><p title="</noscript><img src=x onerror=alert(6)>">글자</p></noscript>',
    '<h4>넷</h4>',
  ].join('')

  it('두 번 통과시켜도 결과가 같다 — 재직렬화가 새 위험을 만들지 않는다', () => {
    const once = sanitizeRichText(NASTY)
    const twice = sanitizeRichText(once)
    expect(twice).toBe(once)
    expect(auditOf(once)).toEqual(CLEAN)
  })

  it('허용된 것은 살아남고 위험한 것만 사라진다', () => {
    const host = reparse(sanitizeRichText(NASTY))
    expect(host.querySelectorAll('a')).toHaveLength(1)
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://a.test')
    expect(host.querySelectorAll('img')).toHaveLength(1)
    expect(host.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect((host.firstElementChild as HTMLElement).style.textAlign).toBe('center')
    expect(host.querySelectorAll('h4')).toHaveLength(1)
  })
})
