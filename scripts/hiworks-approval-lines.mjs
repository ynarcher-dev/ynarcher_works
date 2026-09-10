export const HIWORKS_LINE_PARSER_VERSION = 2

const SECTION_ORDER = {
  first_line: 1,
  second_line: 2,
  third_line: 3,
  fourth_line: 4,
  fifth_line: 5,
  sender_line: 6,
}

export function cleanHiworksHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionRole(document, section) {
  if (section === 'first_line') return 'APPROVER'
  if (section === 'third_line') return 'FINANCE_AGREEMENT'
  if (section === 'fourth_line') return 'CC'
  if (section === 'second_line') {
    const printHtml = String(document.print_info?.print_basic ?? '')
    return /<h2\b[^>]*>\s*처리\s*<\/h2>/i.test(printHtml) ? 'CONFIRMER' : 'AGREEMENT'
  }
  return 'OTHER'
}

function normalizedDecision(sourceDecision, role) {
  const value = cleanHiworksHtml(sourceDecision).toLowerCase()
  if (!value) return null
  if (value.includes('reject') || value.includes('반려')) return 'REJECTED'
  if (value.includes('pending') || value.includes('대기')) return 'PENDING'
  if (role === 'CC' || role === 'CONFIRMER' || value.includes('confirm') || value === '확인') {
    return 'CONFIRMED'
  }
  return 'APPROVED'
}

function parseTableSection(document, section, html) {
  const people = []
  const tables = [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
      [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]),
    )
    if (rows.length < 3) continue
    const roleCells = rows[0]
    const stampCells = rows[1]
    const nameCells = rows[2]
    for (let index = 0; index < nameCells.length; index += 1) {
      const name = cleanHiworksHtml(nameCells[index])
      if (!name) continue
      const stamp = stampCells[index] ?? ''
      const decidedAt = stamp.match(/title=["']([^"']+)["']/i)?.[1] ?? null
      const sourceDecision = stamp.match(/big_stamp_([a-z_]+)\./i)?.[1] ?? null
      const normalizedRole = name === cleanHiworksHtml(document.user_name)
        ? 'DRAFTER'
        : sectionRole(document, section)
      people.push({
        name,
        position: cleanHiworksHtml(roleCells[index]),
        section,
        stepOrder: index + 1,
        normalizedRole,
        sourceRole: normalizedRole,
        sourceDecision,
        normalizedDecision: normalizedDecision(sourceDecision, normalizedRole),
        decidedAt,
      })
    }
  }
  return people
}

function attribute(attributes, name) {
  return attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? null
}

function parseReferenceSection(html) {
  const tags = [...String(html).matchAll(/<span\b([^>]*)>/gi)].filter((match) =>
    /\bclass=["'][^"']*\brefer-list\b[^"']*["']/i.test(match[1]),
  )
  return tags.map((tag, index) => {
    const start = (tag.index ?? 0) + tag[0].length
    const end = tags[index + 1]?.index ?? String(html).length
    const segment = String(html).slice(start, end)
    const name = cleanHiworksHtml(segment.split(/<span\b|<img\b/i, 1)[0])
    const confirmationImage = [...segment.matchAll(/<img\b([^>]*)>/gi)]
      .map((match) => match[1])
      .find((attributes) => /confirm_check|alt=["']확인["']/i.test(attributes))
    const decidedAt = confirmationImage ? attribute(confirmationImage, 'title') : null
    return {
      name,
      position: '',
      section: 'fourth_line',
      stepOrder: index + 1,
      normalizedRole: 'CC',
      sourceRole: '참조',
      sourceDecision: decidedAt ? '확인' : null,
      normalizedDecision: decidedAt ? 'CONFIRMED' : null,
      decidedAt,
      sourceUserNo: attribute(tag[1], 'user_no'),
      sourceNodeId: attribute(tag[1], 'node_id'),
      sourceType: attribute(tag[1], 'type'),
    }
  }).filter((person) => person.name)
}

function actionOf(entry) {
  return cleanHiworksHtml(entry.title || entry.comment)
}

function enrichFromHistory(people, history) {
  for (const entry of history ?? []) {
    const action = actionOf(entry)
    if (!['승인', '확인', '반려'].includes(action)) continue
    const name = cleanHiworksHtml(entry.user_name)
    const candidates = people.filter((person) => person.name === name && person.normalizedRole !== 'DRAFTER')
    if (candidates.length === 0) continue
    const preferred = action === '확인'
      ? candidates.find((person) => ['CC', 'CONFIRMER'].includes(person.normalizedRole))
      : candidates.find((person) => !['CC', 'CONFIRMER'].includes(person.normalizedRole))
    const person = candidates.find((candidate) => candidate.decidedAt === entry.regdate)
      ?? preferred
      ?? candidates[0]
    if (!person.decidedAt) person.decidedAt = entry.regdate ?? null
    if (!person.sourceDecision) person.sourceDecision = action
    if (!person.normalizedDecision) {
      person.normalizedDecision = normalizedDecision(action, person.normalizedRole)
    }
  }
  return people
}

export function parseHiworksApprovalParticipants(document) {
  const people = []
  for (const [section, html] of Object.entries(document.approval_line ?? {})) {
    if (!html) continue
    if (section === 'fourth_line') {
      people.push(...parseReferenceSection(html))
      continue
    }
    people.push(...parseTableSection(document, section, html))
  }

  if (!people.some((person) => person.normalizedRole === 'DRAFTER')) {
    people.push({
      name: cleanHiworksHtml(document.user_name),
      position: cleanHiworksHtml(document.position),
      section: 'first_line',
      stepOrder: 1,
      normalizedRole: 'DRAFTER',
      sourceRole: '기안',
      sourceDecision: '기안',
      normalizedDecision: 'APPROVED',
      decidedAt: document.regdate ?? null,
      sourceUserNo: document.office_user_no ? String(document.office_user_no) : null,
    })
  }

  return enrichFromHistory(people, document.comments_history).sort((a, b) => {
    const section = (SECTION_ORDER[a.section] ?? Number.MAX_SAFE_INTEGER)
      - (SECTION_ORDER[b.section] ?? Number.MAX_SAFE_INTEGER)
    if (section !== 0) return section
    return a.stepOrder - b.stepOrder
  })
}
