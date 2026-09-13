// 베이스라인 산출물의 정규형(canonical form)과 해시.
//
// 정규화는 **pg_dump가 실행마다 다르게 찍는 메타데이터만** 지웁니다. 스키마의
// 의미(권한·함수 본문·search_path·보안 속성)는 한 글자도 건드리지 않습니다.
// 규칙을 바꾸면 NORMALIZER.version을 올려야 하고, 옛 manifest는 check가 거부합니다.

import crypto from 'node:crypto'

export const NORMALIZER = Object.freeze({
  name: 'yna-baseline-canonical',
  version: 2,
})

// 정규화 규칙(버전 2)
//  1. UTF-8 BOM 제거
//  2. CRLF·CR → LF (체크아웃이 core.autocrlf로 줄바꿈을 바꿔도 해시가 같아야 한다)
//  3. 파일 끝 빈 줄을 정리하고 마지막 줄은 개행 하나로 끝낸다
//  4. psql 메타 명령 `\restrict <토큰>` / `\unrestrict <토큰>` 줄 제거
//     — pg_dump 17.6+ 가 덤프마다 새로 만드는 난수 토큰이라, 스키마가 같아도 매번 달라진다.
//     **줄 모양만 보고 지우지 않는다.** 달러 인용 함수 본문이나 여러 줄 문자열 안에도
//     똑같은 모양의 줄이 있을 수 있으므로, SQL 인용 상태를 따라가며 **인용 밖(top level)**
//     에 있는 줄만 지운다. 그래서 함수 본문은 한 글자도 바뀌지 않는다.
//
// 주석은 지우지 않습니다(Supabase CLI가 덤프 단계에서 이미 걸러냅니다). 정규화가 추가로
// 지우는 것은 위 4번의 메타 명령 줄뿐입니다.
const RESTRICT_META_LINE = /^\\(?:un)?restrict[ \t]+[A-Za-z0-9_]+[ \t]*$/
const DOLLAR_TAG = /^\$[A-Za-z_-￿][A-Za-z0-9_-￿]*\$|^\$\$/
const IDENT_CHAR = /[A-Za-z0-9_-￿]/

/**
 * 한 줄을 훑어 SQL 인용 상태를 갱신한다. 상태는 줄을 넘어 이어진다
 * (달러 인용 본문·블록 주석·여러 줄 문자열).
 * @param {string} line
 * @param {{ kind: string, tag?: string, escapes?: boolean, depth?: number }} state
 */
function scanLine(line, state) {
  let i = 0
  while (i < line.length) {
    const c = line[i]
    const next = line[i + 1]
    if (state.kind === 'normal') {
      if (c === '-' && next === '-') return state // 줄 주석 — 이 줄의 나머지는 상태를 바꾸지 않는다
      if (c === '/' && next === '*') {
        state = { kind: 'block', depth: 1 }
        i += 2
        continue
      }
      if (c === "'") {
        // E'...' 만 역슬래시 이스케이프가 살아 있다(standard_conforming_strings = on).
        const prev = line[i - 1]
        const prev2 = line[i - 2]
        const escapes = (prev === 'e' || prev === 'E') && !(prev2 && IDENT_CHAR.test(prev2))
        state = { kind: 'single', escapes }
        i += 1
        continue
      }
      if (c === '"') {
        state = { kind: 'double' }
        i += 1
        continue
      }
      if (c === '$') {
        const tag = DOLLAR_TAG.exec(line.slice(i))
        if (tag) {
          state = { kind: 'dollar', tag: tag[0] }
          i += tag[0].length
          continue
        }
      }
      i += 1
      continue
    }
    if (state.kind === 'single') {
      if (state.escapes && c === '\\') {
        i += 2
        continue
      }
      if (c === "'") {
        if (next === "'") {
          i += 2
          continue
        }
        state = { kind: 'normal' }
      }
      i += 1
      continue
    }
    if (state.kind === 'double') {
      if (c === '"') {
        if (next === '"') {
          i += 2
          continue
        }
        state = { kind: 'normal' }
      }
      i += 1
      continue
    }
    if (state.kind === 'block') {
      if (c === '/' && next === '*') {
        state = { kind: 'block', depth: state.depth + 1 } // PostgreSQL의 블록 주석은 중첩된다
        i += 2
        continue
      }
      if (c === '*' && next === '/') {
        state = state.depth > 1 ? { kind: 'block', depth: state.depth - 1 } : { kind: 'normal' }
        i += 2
        continue
      }
      i += 1
      continue
    }
    // dollar — 같은 태그가 다시 나올 때까지 전부 본문이다
    if (c === '$' && line.startsWith(state.tag, i)) {
      i += state.tag.length // 길이를 먼저 쓴다 — state를 바꾸면 tag가 사라진다
      state = { kind: 'normal' }
      continue
    }
    i += 1
  }
  return state
}

/** 텍스트를 정규형(LF, BOM 없음, 끝 개행 하나)으로 바꾼다. 내용은 바꾸지 않는다. */
export function toCanonicalText(input) {
  let text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  text = text.replace(/\r\n?/g, '\n')
  text = text.replace(/\n+$/, '')
  return text === '' ? '' : `${text}\n`
}

/** 정규형 바이트(UTF-8)의 SHA-256. LF로 체크아웃된 파일이라면 sha256sum 결과와 같다. */
export function canonicalSha256(input) {
  return crypto.createHash('sha256').update(Buffer.from(toCanonicalText(input), 'utf8')).digest('hex')
}

/**
 * pg_dump 출력에서 비결정 메타데이터만 걷어낸 정규형을 만든다.
 * @returns {{ text: string, droppedRestrictLines: number }}
 */
export function normalizeDump(raw) {
  const canonical = toCanonicalText(raw)
  if (canonical === '') return { text: '', droppedRestrictLines: 0 }

  let dropped = 0
  let state = { kind: 'normal' }
  const kept = []
  for (const line of canonical.slice(0, -1).split('\n')) {
    // 인용 밖에 있는 메타 명령만 지운다. 인용 안이면 상태를 갱신하고 그대로 둔다.
    if (state.kind === 'normal' && RESTRICT_META_LINE.test(line)) {
      dropped += 1
      continue
    }
    state = scanLine(line, state)
    kept.push(line)
  }

  return { text: toCanonicalText(kept.join('\n')), droppedRestrictLines: dropped }
}
