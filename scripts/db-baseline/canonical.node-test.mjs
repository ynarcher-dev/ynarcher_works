// 정규화는 "비결정 메타데이터만 지우고 의미는 그대로 둔다"는 약속을 검사한다.
// 구현을 그대로 베끼지 않도록, 단언은 전부 **해시가 같아야 하는가 / 달라야 하는가**로 쓴다.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canonicalSha256, normalizeDump, toCanonicalText } from './lib/canonical.mjs'

const DUMP = [
  'SET statement_timeout = 0;',
  '',
  'CREATE FUNCTION public.current_app_role() RETURNS text',
  '    LANGUAGE sql STABLE SECURITY DEFINER',
  '    SET search_path TO \'public\', \'pg_temp\'',
  '    AS $$',
  '  -- 주석도 본문의 일부다',
  '  select role from public.users where id = auth.uid();',
  '$$;',
  '',
  'GRANT SELECT, INSERT ON TABLE public.startups TO authenticated;',
  'REVOKE TRUNCATE ON TABLE public.startups FROM anon;',
].join('\n')

function hashOf(text) {
  return canonicalSha256(normalizeDump(text).text)
}

describe('줄바꿈과 BOM은 해시를 바꾸지 않는다', () => {
  it('LF·CRLF·CR 체크아웃이 같은 해시를 낸다', () => {
    const lf = DUMP
    const crlf = DUMP.replace(/\n/g, '\r\n')
    const cr = DUMP.replace(/\n/g, '\r')
    assert.equal(hashOf(crlf), hashOf(lf))
    assert.equal(hashOf(cr), hashOf(lf))
  })

  it('UTF-8 BOM이 붙어도 같은 해시를 낸다', () => {
    assert.equal(hashOf(`\uFEFF${DUMP}`), hashOf(DUMP))
  })

  it('끝의 빈 줄 수가 달라도 같은 해시를 낸다', () => {
    assert.equal(hashOf(`${DUMP}\n\n\n`), hashOf(DUMP))
    assert.equal(hashOf(DUMP.replace(/\n$/, '')), hashOf(DUMP))
  })

  it('정규형은 항상 LF이고 개행 하나로 끝난다', () => {
    const text = toCanonicalText('a\r\nb\r\n\r\n')
    assert.equal(text, 'a\nb\n')
    assert.equal(toCanonicalText(''), '')
  })
})

describe('pg_dump의 난수 토큰만 걷어낸다', () => {
  const withToken = (token) => `\\restrict ${token}\n${DUMP}\n\\unrestrict ${token}`

  it('토큰만 다른 두 덤프가 같은 해시를 낸다', () => {
    assert.equal(hashOf(withToken('AbC123xyzQ')), hashOf(withToken('ZZ9kkPPq11')))
  })

  it('토큰을 걷어낸 결과가 토큰 없는 덤프와 같다', () => {
    assert.equal(hashOf(withToken('AbC123xyzQ')), hashOf(DUMP))
    assert.equal(normalizeDump(withToken('AbC123xyzQ')).droppedRestrictLines, 2)
    assert.equal(normalizeDump(DUMP).droppedRestrictLines, 0)
  })

  it('줄 전체가 메타 명령일 때만 지운다 — SQL 본문 안의 같은 글자는 남는다', () => {
    const inBody = `select '\\restrict abc' as literal;\n  \\restrict indented\n`
    const { text, droppedRestrictLines } = normalizeDump(inBody)
    assert.equal(droppedRestrictLines, 0)
    assert.equal(text, toCanonicalText(inBody))
  })

  // 달러 인용 본문 안에 **줄 전체가 메타 명령 모양인 줄**이 들어 있는 경우.
  // 줄 모양만 보면 지워지고, 인용 상태를 따라가면 남는다 — 함수 본문이 걸린 문제다.
  const BODY_WITH_META = [
    '\\restrict Ab3Cd9',
    'CREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $function$',
    '\\restrict inside_body',
    "  select 'text with '' quote and $notatag$' as v;",
    '\\unrestrict inside_body',
    '$function$;',
    'GRANT EXECUTE ON FUNCTION public.f() TO authenticated;',
    '\\unrestrict Ab3Cd9',
  ].join('\n')

  it('함수 본문 안의 메타 명령 모양 줄은 본문이므로 한 글자도 지우지 않는다', () => {
    const { text, droppedRestrictLines } = normalizeDump(BODY_WITH_META)
    assert.equal(droppedRestrictLines, 2) // 바깥 두 줄만
    assert.ok(text.includes('\\restrict inside_body'))
    assert.ok(text.includes('\\unrestrict inside_body'))
    assert.ok(text.includes("  select 'text with '' quote and $notatag$' as v;"))
    assert.ok(text.includes('GRANT EXECUTE ON FUNCTION public.f() TO authenticated;'))
    assert.ok(!text.includes('Ab3Cd9'))
  })

  it('본문 안의 메타 명령 줄이 바뀌면 해시가 바뀐다(지워진 것이 아니다)', () => {
    assert.notEqual(
      hashOf(BODY_WITH_META.replace('\\restrict inside_body', '\\restrict other_body')),
      hashOf(BODY_WITH_META),
    )
  })

  it('덤프가 어느 줄에서 잘려도 정규화가 터지지 않는다', () => {
    const lines = BODY_WITH_META.split('\n')
    for (let n = 1; n <= lines.length; n += 1) {
      const partial = lines.slice(0, n).join('\n')
      assert.doesNotThrow(() => normalizeDump(partial), `${n}번째 줄까지에서 실패`)
    }
  })

  it('$$ 익명 태그와 태그 있는 본문을 모두 닫는다', () => {
    const anon = 'CREATE FUNCTION g() RETURNS int LANGUAGE sql AS $$\n\\restrict body\n  select 1;\n$$;\n\\restrict tail'
    const { text, droppedRestrictLines } = normalizeDump(anon)
    assert.equal(droppedRestrictLines, 1) // $$ 를 닫은 뒤의 마지막 줄만
    assert.ok(text.includes('\\restrict body'))
  })
})

describe('스키마의 의미가 바뀌면 해시가 반드시 바뀐다', () => {
  const cases = [
    ['권한 부여 대상', (s) => s.replace('TO authenticated', 'TO anon')],
    ['권한 종류', (s) => s.replace('GRANT SELECT, INSERT', 'GRANT SELECT, INSERT, DELETE')],
    ['회수 구문 삭제', (s) => s.replace(/^REVOKE .*$/m, '')],
    ['보안 속성', (s) => s.replace('SECURITY DEFINER', 'SECURITY INVOKER')],
    ['search_path', (s) => s.replace("SET search_path TO 'public', 'pg_temp'", "SET search_path TO 'public'")],
    ['함수 본문', (s) => s.replace('where id = auth.uid()', 'where true')],
    ['본문 안의 주석', (s) => s.replace('-- 주석도 본문의 일부다', '-- 바뀐 주석')],
    ['본문의 공백', (s) => s.replace('  select role', '    select role')],
  ]

  for (const [label, mutate] of cases) {
    it(`${label}을 바꾸면 해시가 달라진다`, () => {
      const mutated = mutate(DUMP)
      assert.notEqual(mutated, DUMP, '테스트 픽스처가 실제로 바뀌지 않았습니다')
      assert.notEqual(hashOf(mutated), hashOf(DUMP))
    })
  }

  it('정규화가 권한·본문 텍스트를 그대로 보존한다', () => {
    const { text } = normalizeDump(`\\restrict tok1\n${DUMP}\n\\unrestrict tok1`)
    assert.ok(text.includes('GRANT SELECT, INSERT ON TABLE public.startups TO authenticated;'))
    assert.ok(text.includes('REVOKE TRUNCATE ON TABLE public.startups FROM anon;'))
    assert.ok(text.includes("SET search_path TO 'public', 'pg_temp'"))
    assert.ok(text.includes('SECURITY DEFINER'))
    assert.ok(text.includes('  -- 주석도 본문의 일부다'))
  })
})
