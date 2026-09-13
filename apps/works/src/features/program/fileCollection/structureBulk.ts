/**
 * 문항 대용량 등록 — **양식을 받아 채워 올리면 여러 줄이 한 번에 선다.**
 *
 * 길은 CSV 양식 하나다(명단 대용량 등록과 같은 방식). 단계 이름을 그대로 머리글로 쓴 양식을
 * 내려받아 엑셀에서 채우고 올린다 — 받는 모양이 **화면의 표와 같아서** 무엇을 어디에 적어야
 * 하는지 새로 배울 것이 없다. 엑셀·시트에서 복사한 표를 그대로 붙여 넣는 길도 열어 둔다
 * (그쪽은 탭으로 갈라져 온다).
 *
 * 여기서 하는 일은 글자를 줄로 가르는 것까지이고, **트리로 세우는 일은 초안 모델이 한다**
 * (`appendBulkBranches`). 서버에는 여전히 '구성 저장'을 눌러야 적힌다 — 올리기가 곧
 * 저장이면 잘못 올린 수십 줄을 되돌릴 자리가 없다.
 */
import { splitCsvLine } from '@/lib/csv'
import type { BulkBranch } from '@/features/program/fileCollection/structureDraft'

/** 붙여 넣은 한 줄의 판정. 오류가 있어도 줄은 남긴다 — 사람이 표에서 보고 고친다. */
export interface BulkParsedRow {
  /** 원문에서 몇 번째 줄인가(1부터). 빈 줄은 세지 않는다. */
  line: number
  cells: string[]
  branch: BulkBranch
  /** 이 줄을 세울 수 없는 이유. 없으면 통과. */
  error: string | null
}

export interface BulkParseResult {
  rows: BulkParsedRow[]
  /** 세울 수 있는 줄. */
  valid: BulkBranch[]
  /** 구분자 — 화면에 무엇으로 읽었는지 적는다. */
  separator: 'tab' | 'comma'
}

const TRUE_WORDS = new Set(['y', 'yes', 'o', 'true', '1', '필수', '예', '네', 'v'])
const FALSE_WORDS = new Set(['', 'n', 'no', 'x', 'false', '0', '선택', '아니오', '-'])

/** 필수 칸의 값 읽기. 알 수 없는 말은 읽지 못했다고 답한다(조용히 선택으로 만들지 않는다). */
export function parseRequired(raw: string): boolean | null {
  const word = raw.trim().toLowerCase()
  if (TRUE_WORDS.has(word)) return true
  if (FALSE_WORDS.has(word)) return false
  return null
}

/**
 * 붙여 넣은 글자를 줄로 가른다.
 *
 * 구분자는 **글 전체를 보고 한 번** 정한다 — 탭이 하나라도 있으면 탭이고(엑셀·시트에서
 * 복사하면 탭이다), 없으면 쉼표다. 줄마다 다르게 읽으면 안내 문장에 쉼표가 하나 섞인 줄만
 * 칸이 어긋난다.
 *
 * 위 단계 칸이 비면 **바로 위 줄의 값을 잇는다.** 화면의 표가 같은 분류를 세로로 병합해
 * 보여 주므로, 그 표를 그대로 옮겨 적은 사람은 두 번째 줄부터 분류를 비워 둔다.
 */
export function parseBulkStructure(text: string, levels: readonly string[]): BulkParseResult {
  const names = levels.length ? levels : ['문항']
  const depth = names.length
  // 엑셀이 붙이는 BOM은 첫 칸 앞에 붙어 머리글을 어긋나게 한다. 여기서 걷어낸다.
  const body = text.startsWith('﻿') ? text.slice(1) : text
  const header = bulkTemplateRows(names)[0]!
  const separator: 'tab' | 'comma' = body.includes('\t') ? 'tab' : 'comma'
  const split = separator === 'tab' ? '\t' : ','
  const rows: BulkParsedRow[] = []
  const carried: string[] = Array.from({ length: depth }, () => '')
  let line = 0

  for (const raw of body.split(/\r?\n/)) {
    if (raw.trim() === '') continue
    line += 1
    // 쉼표로 온 표는 CSV 규칙(따옴표 안의 쉼표는 칸을 가르지 않는다)으로 읽는다 —
    // 안내 문장에 쉼표를 쓴 줄만 칸이 밀리면 양식을 채운 사람이 이유를 알 수 없다.
    const cells =
      separator === 'comma' ? splitCsvLine(raw) : raw.split(split).map((cell) => cell.trim())
    // 양식의 머리글이 그대로 올라온다(예시만 지우고 저장하므로). 머리글과 같은 첫 줄은
    // 값이 아니므로 세지 않는다.
    if (line === 1 && header.every((name, i) => (cells[i] ?? '') === name)) {
      line = 0
      continue
    }
    const titles: string[] = []
    for (let level = 0; level < depth; level += 1) {
      const cell = cells[level] ?? ''
      // 문항(맨 아래)은 잇지 않는다 — 같은 문항이 두 줄로 늘어나는 것이 사람의 뜻일 리 없다.
      const title = cell !== '' || level === depth - 1 ? cell : (carried[level] ?? '')
      titles.push(title)
      carried[level] = title
    }
    const requiredRaw = cells[depth] ?? ''
    const isRequired = parseRequired(requiredRaw)
    const guide = (cells[depth + 1] ?? '').trim()

    const missing = titles.findIndex((title) => title === '')
    const error =
      missing >= 0
        ? `${missing + 1}번째 단계 이름이 비어 있습니다.`
        : isRequired === null
          ? `필수 칸을 읽지 못했습니다(${requiredRaw}). 비워 두거나 Y/N으로 적어 주세요.`
          : cells.length > depth + 2
            ? '칸이 너무 많습니다. 단계 이름들 · 필수 · 문항 안내 순으로 적어 주세요.'
            : null

    rows.push({
      line,
      cells,
      branch: { titles, guide, isRequired: isRequired ?? false },
      error,
    })
  }

  return { rows, valid: rows.filter((row) => !row.error).map((row) => row.branch), separator }
}

/** 쉼표·따옴표·줄바꿈이 든 값은 CSV 규칙대로 감싼다. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 머리글 + 예시 두 줄. 단계 이름을 그대로 머리글로 써서 어느 칸인지 알게 한다. */
export function bulkTemplateRows(levels: readonly string[]): string[][] {
  const names = levels.length ? [...levels] : ['문항']
  const leaf = names.length - 1
  return [
    [...names.map((name, i) => name || `${i + 1}단계`), '필수', '문항 안내'],
    [
      ...names.map((_, i) => (i === leaf ? '사업자등록증' : `예시 ${i + 1}단계`)),
      'Y',
      'PDF로 올려 주세요',
    ],
    [...names.map((_, i) => (i === leaf ? '통장 사본' : '')), 'N', ''],
  ]
}

/** 내려받는 양식 CSV(머리글 + 예시 두 줄). 예시는 지우고 채우면 된다. */
export function buildStructureTemplateCsv(levels: readonly string[]): string {
  return bulkTemplateRows(levels)
    .map((row) => row.map(csvCell).join(','))
    .join('\n')
}

/** 붙여 넣기 칸에 흐릿하게 세우는 본보기(탭으로 갈라 엑셀 복사본과 같은 모양으로 보인다). */
export function bulkSampleText(levels: readonly string[]): string {
  return bulkTemplateRows(levels)
    .map((row) => row.join('\t'))
    .join('\n')
}
