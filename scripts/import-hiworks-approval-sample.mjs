/* global Buffer, console, process */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const root = process.cwd()
const backupRoot = resolve(root, 'hiworks_backup')
const dataPath = join(backupRoot, 'data', 'data.js')
const infoPath = join(backupRoot, 'data', 'data_info.js')

function parseAssignment(path, variable) {
  const raw = readFileSync(path, 'utf8')
  const prefix = new RegExp(`^\\s*${variable}\\s*=\\s*`)
  return { raw, value: JSON.parse(raw.replace(prefix, '').replace(/;?\s*$/, '')) }
}

function hash(value, algorithm = 'sha256') {
  return createHash(algorithm).update(value).digest('hex')
}

function stableUuid(key) {
  const hex = hash(`ynarcher:approval:legacy:${key}`).slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function sql(value) {
  if (value === null || value === undefined || value === '') return 'null'
  const text = String(value)
  if (text.includes('\0')) throw new Error('NUL 문자는 PostgreSQL text에 저장할 수 없습니다.')
  return `'${text.replaceAll("'", "''")}'`
}

function jsonb(value) {
  return `${sql(JSON.stringify(value ?? {}))}::jsonb`
}

function timestamp(value) {
  if (!value) return 'null'
  const normalized = String(value).replace(' ', 'T')
  return `${sql(/[+-]\d\d:\d\d$|Z$/i.test(normalized) ? normalized : `${normalized}+09:00`)}::timestamptz`
}

function cleanHtml(value) {
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

function normalizeLabel(value) {
  return cleanHtml(value)
    .replace(/\s+/g, '')
    .replace(/[()[\]（）]/g, '')
    .replace(/[.:：]/g, '')
}

function extractTableRows(html) {
  return [...String(html ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        cleanHtml(cell[1]),
      ),
    )
    .filter((row) => row.some(Boolean))
}

function labeledValue(rows, ...aliases) {
  const wanted = new Set(aliases.map(normalizeLabel))
  for (const row of rows) {
    for (let index = 0; index < row.length - 1; index += 1) {
      if (wanted.has(normalizeLabel(row[index]))) return row[index + 1]
    }
  }
  return ''
}

function moneyValue(value) {
  const match = String(value ?? '').match(/-?[\d,]+(?:\.\d+)?/)
  return match ? match[0].replaceAll(',', '') : ''
}

function rowsAfterHeader(rows, isHeader) {
  const headerIndex = rows.findIndex(isHeader)
  if (headerIndex < 0) return { header: [], rows: [] }
  const header = rows[headerIndex]
  const values = []
  for (const row of rows.slice(headerIndex + 1)) {
    const first = normalizeLabel(row[0])
    if (!first || first === '합계' || first === '총계') break
    if (isHeader(row)) break
    if (row.length < Math.min(2, header.length)) break
    values.push(row)
  }
  return { header, rows: values }
}

function cellByHeader(header, row, ...aliases) {
  const wanted = new Set(aliases.map(normalizeLabel))
  const index = header.findIndex((cell) => wanted.has(normalizeLabel(cell)))
  return index < 0 ? '' : (row[index] ?? '')
}

function classifyLegacyForm(title) {
  if (title.includes('근무시간')) return 'work_time'
  if (title.includes('휴가')) return 'leave'
  if (title.includes('출장')) return 'travel'
  if (title.includes('전문가')) return 'expert_expense'
  if (title.includes('인건비')) return 'labor_expense'
  if (title.includes('지출결의')) return 'expense'
  return 'generic'
}

const paymentColumns = [
  { key: 'vendor', label: '거래처', type: 'TEXT', wide: true },
  { key: 'bank', label: '은행명', type: 'TEXT' },
  { key: 'account_number', label: '계좌번호', type: 'TEXT', wide: true },
  { key: 'account_holder', label: '예금주', type: 'TEXT' },
  { key: 'amount', label: '송금액', type: 'MONEY' },
  { key: 'requested_date', label: '송금 요청일', type: 'DATE' },
]

const expenseBaseFields = [
  { key: 'project_name', label: '프로젝트명', type: 'TEXT' },
  { key: 'project_account', label: '프로젝트 통장', type: 'TEXT' },
  { key: 'budget_item', label: '예산항목(잔액)', type: 'TEXTAREA' },
  { key: 'expense_amount', label: '지출금액', type: 'MONEY', primaryAmount: true },
]

const legacyFormDefinitions = {
  expense: {
    name: '지출결의서 (하이웍스 복원)', abbrev: 'HW지결',
    fields: [
      ...expenseBaseFields,
      { key: 'account', label: '계정과목', type: 'TEXT' },
      { key: 'purpose', label: '사용목적', type: 'TEXTAREA' },
      { key: 'expense_breakdown', label: '지출 산출내역', type: 'TABLE', columns: [
        { key: 'organization', label: '소속/거래처', type: 'TEXT', wide: true },
        { key: 'supply_amount', label: '공급가액', type: 'MONEY' },
        { key: 'tax_amount', label: '부가세액', type: 'MONEY' },
        { key: 'paid_amount', label: '실지급액', type: 'MONEY' },
      ] },
      { key: 'payments', label: '지급표', type: 'TABLE', columns: paymentColumns },
    ],
  },
  expert_expense: {
    name: '전문가 지출결의서 (하이웍스 복원)', abbrev: 'HW전문',
    fields: [],
  },
  labor_expense: {
    name: '인건비 지출결의서 (하이웍스 복원)', abbrev: 'HW인건',
    fields: [],
  },
  work_time: {
    name: '근무시간수정요청서 (하이웍스 복원)', abbrev: 'HW근무',
    fields: [
      { key: 'employee', label: '대상자', type: 'TEXT' },
      { key: 'work_date', label: '근무일', type: 'TEXT' },
      { key: 'changes', label: '수정 요청', type: 'TABLE', columns: [
        { key: 'status', label: '근무상태', type: 'TEXT' },
        { key: 'checked_time', label: '체크시간', type: 'TEXT' },
        { key: 'requested_time', label: '수정요청시간', type: 'TEXT' },
      ] },
    ],
  },
  leave: {
    name: '휴가신청서 (하이웍스 복원)', abbrev: 'HW휴가',
    fields: [
      { key: 'employee', label: '사용자', type: 'TEXT' },
      { key: 'department', label: '부서', type: 'TEXT' },
      { key: 'leave_request', label: '휴가 신청', type: 'TEXTAREA' },
      { key: 'duration', label: '신청한 휴가일수', type: 'TEXT' },
      { key: 'reason', label: '사유', type: 'TEXTAREA' },
    ],
  },
  travel: {
    name: '출장품의서 (하이웍스 복원)', abbrev: 'HW출장',
    fields: [
      { key: 'travel_type', label: '구분', type: 'TEXT' },
      { key: 'destination', label: '출장 목적지', type: 'TEXT' },
      { key: 'host_department', label: '주관 부서', type: 'TEXT' },
      { key: 'period', label: '출장 기간', type: 'TEXT' },
      { key: 'purpose', label: '출장 목적', type: 'TEXTAREA' },
      { key: 'traveler', label: '출장자', type: 'TEXT' },
      { key: 'companions', label: '출장 동행자', type: 'TEXT' },
      { key: 'funding', label: '재원', type: 'TEXT' },
      { key: 'card_number', label: '카드번호', type: 'TEXT' },
      { key: 'expected_cost', label: '출장 예상 비용', type: 'TEXTAREA' },
    ],
  },
  generic: {
    name: '일반결재 (하이웍스 복원)', abbrev: 'HW일반',
    fields: [{ key: 'body', label: '내용', type: 'RICHTEXT' }],
  },
}

const expertFields = [
  ...expenseBaseFields,
  { key: 'occurrence_date', label: '발생일자', type: 'TEXT' },
  { key: 'event_description', label: '행사내용', type: 'TEXTAREA' },
  { key: 'payees', label: '지급대상자', type: 'TEXT' },
  { key: 'payment_standard', label: '지급기준', type: 'TEXTAREA' },
  { key: 'expert_items', label: '전문가 지급내역', type: 'TABLE', columns: [
    { key: 'sequence', label: '연번', type: 'NUMBER' },
    { key: 'affiliation', label: '소속', type: 'TEXT', wide: true },
    { key: 'position', label: '직책', type: 'TEXT' },
    { key: 'name', label: '성명', type: 'TEXT' },
    { key: 'gross_amount', label: '전문가 활용비', type: 'MONEY' },
    { key: 'withholding', label: '원천징수액', type: 'MONEY' },
    { key: 'net_amount', label: '송금액', type: 'MONEY' },
  ] },
  { key: 'payments', label: '지급표', type: 'TABLE', columns: paymentColumns },
]
legacyFormDefinitions.expert_expense.fields = expertFields
legacyFormDefinitions.labor_expense.fields = expertFields

function extractStructuredDocument(document) {
  const rows = extractTableRows(document.content)
  const formKey = classifyLegacyForm(document.form_title ?? '')

  if (formKey === 'generic') {
    return { formKey, values: { body: document.content }, amount: null }
  }
  if (formKey === 'leave') {
    return { formKey, amount: null, values: {
      employee: labeledValue(rows, '사용자'),
      department: labeledValue(rows, '부서'),
      leave_request: labeledValue(rows, '휴가 신청'),
      duration: labeledValue(rows, '신청한 휴가일수'),
      reason: labeledValue(rows, '사유'),
    } }
  }
  if (formKey === 'travel') {
    return { formKey, amount: null, values: {
      travel_type: labeledValue(rows, '구분'),
      destination: labeledValue(rows, '출장 목적지'),
      host_department: labeledValue(rows, '주관 부서'),
      period: labeledValue(rows, '출장 기간'),
      purpose: labeledValue(rows, '출장 목적'),
      traveler: labeledValue(rows, '출장자'),
      companions: labeledValue(rows, '출장 동행자'),
      funding: labeledValue(rows, '재원'),
      card_number: labeledValue(rows, '카드번호'),
      expected_cost: labeledValue(rows, '출장 예상 비용'),
    } }
  }
  if (formKey === 'work_time') {
    const changeTable = rowsAfterHeader(rows, (row) => {
      const labels = row.map(normalizeLabel)
      return labels.includes('근무상태') && labels.includes('수정요청시간')
    })
    const titleMatch = String(document.title ?? '').match(/\(([^)]+)\).*?(\d{4}년\s*\d{1,2}월\s*\d{1,2}일)/)
    return { formKey, amount: null, values: {
      employee: titleMatch?.[1] ?? '',
      work_date: titleMatch?.[2] ?? '',
      changes: changeTable.rows.map((row) => ({
        status: cellByHeader(changeTable.header, row, '근무상태'),
        checked_time: cellByHeader(changeTable.header, row, '체크시간'),
        requested_time: cellByHeader(changeTable.header, row, '수정요청시간'),
      })),
    } }
  }

  const paymentTable = rowsAfterHeader(rows, (row) => {
    const labels = row.map(normalizeLabel)
    return labels.includes('거래처') && labels.includes('은행명') && labels.includes('송금액')
  })
  const payments = paymentTable.rows.map((row) => ({
    vendor: cellByHeader(paymentTable.header, row, '거래처'),
    bank: cellByHeader(paymentTable.header, row, '은행명'),
    account_number: cellByHeader(paymentTable.header, row, '계좌번호'),
    account_holder: cellByHeader(paymentTable.header, row, '예금주'),
    amount: moneyValue(cellByHeader(paymentTable.header, row, '송금액')),
    requested_date: cellByHeader(paymentTable.header, row, '송금 요청일', '송금요청일'),
  }))
  const expertTable = rowsAfterHeader(rows, (row) => {
    const labels = row.map(normalizeLabel)
    return labels.some((label) => label.includes('원천징수')) && labels.some((label) => label.includes('송금액'))
  })
  const expertItems = expertTable.rows.map((row, index) => ({
    sequence: cellByHeader(expertTable.header, row, '연번', '번호') || String(index + 1),
    affiliation: cellByHeader(expertTable.header, row, '소속'),
    position: cellByHeader(expertTable.header, row, '직책', '직위'),
    name: cellByHeader(expertTable.header, row, '이름', '성명'),
    gross_amount: moneyValue(cellByHeader(expertTable.header, row, '전문가활용비원A', '전문가 활용비원A')),
    withholding: moneyValue(cellByHeader(expertTable.header, row, '원천징수액원B', '원천징수원B')),
    net_amount: moneyValue(cellByHeader(expertTable.header, row, '송금액원A-B')),
  }))
  const breakdownTable = rowsAfterHeader(rows, (row) => {
    const labels = row.map(normalizeLabel)
    return labels.some((label) => label.includes('공급가액')) && labels.some((label) => label.includes('부가세액'))
  })
  const expenseBreakdown = breakdownTable.rows.map((row) => ({
    organization: cellByHeader(breakdownTable.header, row, '소속', '거래처'),
    supply_amount: moneyValue(cellByHeader(breakdownTable.header, row, '공급가액원')),
    tax_amount: moneyValue(cellByHeader(breakdownTable.header, row, '부가세액원')),
    paid_amount: moneyValue(cellByHeader(breakdownTable.header, row, '실지급액원')),
  })).filter((row) =>
    Boolean(row.supply_amount || row.tax_amount || row.paid_amount) ||
    (Boolean(row.organization) && !/^\[[A-Z-]+\]$/i.test(row.organization)),
  )
  const explicitAmount = moneyValue(labeledValue(rows, '지출금액'))
  const calculatedGross = expertItems.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0)
  const expenseAmount = explicitAmount || (calculatedGross ? String(calculatedGross) : '')
  return { formKey, amount: expenseAmount ? Number(expenseAmount) : null, values: {
    project_name: labeledValue(rows, '프로젝트명', '프 로젝트명', '프 로 젝 트명'),
    project_account: labeledValue(rows, '프로젝트통장'),
    budget_item: labeledValue(rows, '예산항목(잔액)', '예산항목 (잔액)'),
    expense_amount: expenseAmount,
    occurrence_date: labeledValue(rows, '발생일자'),
    event_description: labeledValue(rows, '행사내용'),
    payees: labeledValue(rows, '지급대상자'),
    account: labeledValue(rows, '계정과목'),
    purpose: labeledValue(rows, '사용목적'),
    payment_standard: labeledValue(rows, '강사료규정 지급기준'),
    expert_items: expertItems,
    expense_breakdown: expenseBreakdown,
    payments,
  } }
}

function profileNumber(profileUrl) {
  return String(profileUrl ?? '').match(/profile_images\/(\d+)\.(?:jpg|png)/i)?.[1] ?? null
}

function extractLinePeople(document) {
  const people = []
  const sectionRole = {
    first_line: 'APPROVER',
    second_line: 'CONFIRMER',
    third_line: 'CC',
    fourth_line: 'OTHER',
    fifth_line: 'OTHER',
    sender_line: 'OTHER',
  }

  for (const [section, html] of Object.entries(document.approval_line ?? {})) {
    if (!html) continue
    const tables = [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    for (const table of tables) {
      const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
        [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]),
      )
      if (rows.length < 3) continue
      const roleCells = rows[0]
      const stampCells = rows[1]
      const nameCells = rows[2]
      for (let index = 0; index < nameCells.length; index += 1) {
        const name = cleanHtml(nameCells[index])
        if (!name) continue
        const stamp = stampCells[index] ?? ''
        const decidedAt = stamp.match(/title=["']([^"']+)["']/i)?.[1] ?? null
        const sourceDecision = stamp.match(/big_stamp_([a-z_]+)\./i)?.[1] ?? null
        people.push({
          name,
          position: cleanHtml(roleCells[index]),
          section,
          stepOrder: index + 1,
          normalizedRole: name === document.user_name ? 'DRAFTER' : sectionRole[section] ?? 'OTHER',
          sourceDecision,
          decidedAt,
        })
      }
    }
  }
  return people
}

function actionOf(entry) {
  return cleanHtml(entry.title || entry.comment)
}

function eventType(entry, isComment = false) {
  if (isComment) return 'COMMENT'
  const action = actionOf(entry)
  if (action === '기안') return 'DRAFTED'
  if (action === '승인') return 'APPROVED'
  if (action === '확인') return 'CONFIRMED'
  if (action === '문서 내용 수정') return 'CONTENT_UPDATED'
  if (action === '결재선 수정') return 'LINE_UPDATED'
  if (action === '관리자에 의한 삭제') return 'SOURCE_DELETED'
  return 'HISTORY'
}

function participantRole(action) {
  if (action === '승인') return 'APPROVER'
  if (action === '확인') return 'CONFIRMER'
  if (action.includes('재무') && action.includes('합의')) return 'FINANCE_AGREEMENT'
  if (action.includes('합의')) return 'AGREEMENT'
  return null
}

const { raw: rawData, value: allDocuments } = parseAssignment(dataPath, 'HIWORKS_DATA')
const { value: backupInfo } = parseAssignment(infoPath, 'BACKUP_INFO')
const documents = allDocuments.slice(0, 10)
if (documents.length !== 10) throw new Error(`샘플 문서는 10건이어야 합니다. 현재 ${documents.length}건입니다.`)

const linePeople = new Map(documents.map((document) => [document.no, extractLinePeople(document)]))
const signalsByName = new Map()

function observeActor(name, values = {}) {
  const normalizedName = cleanHtml(name)
  if (!normalizedName) return
  const current = signalsByName.get(normalizedName) ?? {
    name: normalizedName,
    userNos: new Set(),
    profiles: new Set(),
    departments: new Set(),
    positions: new Set(),
  }
  if (values.userNo) current.userNos.add(String(values.userNo))
  if (values.profile) current.profiles.add(String(values.profile))
  if (values.department) current.departments.add(String(values.department))
  if (values.position) current.positions.add(String(values.position))
  signalsByName.set(normalizedName, current)
}

for (const document of documents) {
  observeActor(document.user_name, {
    userNo: document.office_user_no,
    department: document.node_name,
    position: document.position,
  })
  for (const entry of [...(document.comments_history ?? []), ...(document.comments ?? [])]) {
    observeActor(entry.user_name, { profile: profileNumber(entry.profile_url) })
  }
  for (const person of linePeople.get(document.no) ?? []) {
    observeActor(person.name, { position: person.position })
  }
}

const actors = [...signalsByName.values()].map((actor) => {
  const userNos = [...actor.userNos].sort()
  const profiles = [...actor.profiles].sort()
  const ambiguous = userNos.length > 1 || profiles.length > 1
  const sourceActorKey =
    userNos.length === 1
      ? `user:${userNos[0]}`
      : profiles.length === 1
        ? `profile:${profiles[0]}`
        : `name:${actor.name}`
  return {
    ...actor,
    ambiguous,
    sourceActorKey,
    id: stableUuid(`HIWORKS:ACTOR:${sourceActorKey}`),
  }
})
const actorByName = new Map(actors.map((actor) => [actor.name, actor]))

const archiveSha = hash(rawData)
const batchId = stableUuid(`HIWORKS:BATCH:${backupInfo.file_name}:${archiveSha}`)
const statements = ['begin', "set local statement_timeout = '5min'"]

const legacyForms = Object.fromEntries(
  Object.entries(legacyFormDefinitions).map(([key, definition]) => [key, {
    ...definition,
    id: stableUuid(`HIWORKS:FORM:${key}`),
    versionId: stableUuid(`HIWORKS:FORM:${key}:VERSION:1`),
  }]),
)

for (const form of Object.values(legacyForms)) {
  statements.push(`
insert into public.approval_forms (
  id, name, abbrev, retention, security_grade, is_active, sort_order
) values (
  ${sql(form.id)}::uuid, ${sql(form.name)}, ${sql(form.abbrev)}, '원본 기준', '하이웍스 원본', false, 9000
)
on conflict (id) do update set
  name = excluded.name,
  is_active = false`)
  statements.push(`
insert into public.approval_form_versions (id, form_id, version_no, fields)
values (${sql(form.versionId)}::uuid, ${sql(form.id)}::uuid, 1, ${jsonb(form.fields)})
on conflict (id) do nothing`)
  statements.push(`
update public.approval_forms
   set current_version_id = ${sql(form.versionId)}::uuid
 where id = ${sql(form.id)}::uuid
   and current_version_id is distinct from ${sql(form.versionId)}::uuid`)
}

statements.push(`
insert into public.approval_legacy_import_batches (
  id, source_system, source_file_name, source_archive_path, source_archive_sha256,
  source_metadata, expected_document_count, imported_document_count, failed_document_count,
  status, started_at, completed_at
) values (
  ${sql(batchId)}::uuid, 'HIWORKS', ${sql(backupInfo.file_name || basename(backupRoot))},
  ${sql('hiworks_backup/data/data.js')}, ${sql(archiveSha)}, ${jsonb(backupInfo)},
  ${documents.length}, ${documents.length}, 0, 'COMPLETED', now(), now()
)
on conflict (id) do update set
  expected_document_count = excluded.expected_document_count,
  imported_document_count = excluded.imported_document_count,
  failed_document_count = 0,
  status = 'COMPLETED',
  completed_at = now()`)

for (const actor of actors) {
  statements.push(`
insert into public.approval_legacy_actors (
  id, source_system, source_actor_key, source_user_no, profile_reference,
  original_name, original_department, original_position, source_metadata
) values (
  ${sql(actor.id)}::uuid, 'HIWORKS', ${sql(actor.sourceActorKey)},
  ${sql([...actor.userNos][0])}, ${sql([...actor.profiles][0])}, ${sql(actor.name)},
  ${sql([...actor.departments][0])}, ${sql([...actor.positions][0])},
  ${jsonb({ ambiguous_identity_signals: actor.ambiguous })}
)
on conflict (source_system, source_actor_key) do update set
  source_user_no = coalesce(approval_legacy_actors.source_user_no, excluded.source_user_no),
  profile_reference = coalesce(approval_legacy_actors.profile_reference, excluded.profile_reference),
  original_department = coalesce(approval_legacy_actors.original_department, excluded.original_department),
  original_position = coalesce(approval_legacy_actors.original_position, excluded.original_position)`)
}

for (const [rowNo, document] of documents.entries()) {
  const documentId = stableUuid(`HIWORKS:DOCUMENT:${document.no}`)
  const createdAt = timestamp(document.regdate)
  const completedAt = timestamp(document.completedate)
  const structured = extractStructuredDocument(document)
  const legacyForm = legacyForms[structured.formKey]

  statements.push(`
insert into public.approval_documents (
  id, title, form_type, drafter_id, amount, body, status, department_id,
  created_at, updated_at, deleted_at, form_id, form_version_id, field_values,
  doc_no, completed_at
) values (
  ${sql(documentId)}::uuid, ${sql(document.title)}, ${sql(document.document_type || 'LEGACY_HIWORKS')},
  null, ${structured.amount ?? 'null'}, null, 'APPROVED', null,
  ${createdAt}, ${createdAt}, null, ${sql(legacyForm.id)}::uuid,
  ${sql(legacyForm.versionId)}::uuid, ${jsonb(structured.values)},
  ${sql(document.document_code)}, ${completedAt}
)
on conflict (id) do update set
  title = excluded.title,
  form_type = excluded.form_type,
  amount = excluded.amount,
  body = excluded.body,
  form_id = excluded.form_id,
  form_version_id = excluded.form_version_id,
  field_values = excluded.field_values,
  doc_no = excluded.doc_no,
  completed_at = excluded.completed_at`)

  const sourceMetadata = {
    attached_file_flag: document.attached_file_flag,
    attached_files: document.attached_file_list ?? [],
    preserved_term: document.preserved_term,
    security_level: document.security_level,
    del_flag: document.del_flag,
    set_preserved_term: document.set_preserved_term,
    set_security_level: document.set_security_level,
    except_preserved_term: document.except_preserved_term,
    universal: document.universal,
    use_api: document.use_api,
    solution_type: document.solution_type,
    use_add_file: document.use_add_file,
    simple_form_line: document.simple_form_line,
  }
  statements.push(`
insert into public.approval_legacy_documents (
  document_id, import_batch_id, source_system, source_document_no, source_document_code,
  source_basic_info_no, source_form_no, source_status, source_document_type,
  source_approval_method, source_office_user_no, source_department_box,
  original_title, original_drafter_name, original_drafter_position,
  original_department_name, original_department_path, source_department_id,
  source_form_title, source_form_category, source_form_abbrev, source_retention,
  source_security_level, source_registered_at, source_completed_at,
  source_was_deleted, source_deleted_at, content_html, content_text,
  approval_line_snapshot, print_snapshot, source_metadata, source_row_no, source_row_sha256
) values (
  ${sql(documentId)}::uuid, ${sql(batchId)}::uuid, 'HIWORKS', ${sql(document.no)},
  ${sql(document.document_code)}, ${sql(document.basic_info_no)}, ${sql(document.approval_form_no)},
  ${sql(document.status)}, ${sql(document.document_type)}, ${sql(document.approval_method)},
  ${sql(document.office_user_no)}, ${sql(document.department_box)}, ${sql(document.title)},
  ${sql(document.user_name)}, ${sql(document.position)}, ${sql(document.node_name)},
  ${sql(document.nodes)}, ${sql(document.node_id)}, ${sql(document.form_title)},
  ${sql(document.form_category)}, ${sql(document.acronym)}, ${sql(document.preserved_term)},
  ${sql(document.security_level)}, ${createdAt}, ${completedAt}, ${document.del_flag === 'Y'},
  ${timestamp(document.deldate)}, ${sql(document.content)}, ${sql(document.content_text)},
  ${jsonb(document.approval_line)}, ${jsonb(document.print_info)}, ${jsonb(sourceMetadata)},
  ${rowNo}, ${sql(hash(JSON.stringify(document)))}
)
on conflict (source_system, source_document_no) do nothing`)

  const participants = new Map()
  const addParticipant = (name, values) => {
    const cleanName = cleanHtml(name)
    const participantActor = actorByName.get(cleanName)
    if (!cleanName || !participantActor) return
    const role = values.normalizedRole ?? 'OTHER'
    const key = `${participantActor.sourceActorKey}:${role}`
    const current = participants.get(key)
    participants.set(key, current ? { ...current, ...Object.fromEntries(Object.entries(values).filter(([, value]) => value)) } : {
      name: cleanName,
      actor: participantActor,
      normalizedRole: role,
      ...values,
    })
  }

  addParticipant(document.user_name, {
    normalizedRole: 'DRAFTER',
    sourceRole: '기안',
    position: document.position,
    department: document.node_name,
    decidedAt: document.regdate,
  })
  for (const person of linePeople.get(document.no) ?? []) addParticipant(person.name, person)
  for (const entry of document.comments_history ?? []) {
    const role = participantRole(actionOf(entry))
    if (role) {
      addParticipant(entry.user_name, {
        normalizedRole: role,
        sourceRole: actionOf(entry),
        sourceDecision: actionOf(entry),
        decidedAt: entry.regdate,
      })
    }
  }

  let participantIndex = 0
  for (const participant of participants.values()) {
    const sourceKey = `${participant.actor.sourceActorKey}:${participant.normalizedRole}`
    statements.push(`
insert into public.approval_legacy_participants (
  id, document_id, actor_id, source_participant_key, source_role, normalized_role,
  source_line_section, step_order, source_decision, normalized_decision, decided_at,
  original_name, original_department, original_position, parsing_confidence, source_metadata
) values (
  ${sql(stableUuid(`HIWORKS:PARTICIPANT:${document.no}:${sourceKey}`))}::uuid,
  ${sql(documentId)}::uuid, ${sql(participant.actor.id)}::uuid, ${sql(sourceKey)},
  ${sql(participant.sourceRole)}, ${sql(participant.normalizedRole)}, ${sql(participant.section)},
  ${participant.stepOrder ?? 'null'}, ${sql(participant.sourceDecision)},
  ${sql(participant.sourceDecision === '승인' ? 'APPROVED' : participant.sourceDecision === '확인' ? 'CONFIRMED' : null)},
  ${timestamp(participant.decidedAt)}, ${sql(participant.name)}, ${sql(participant.department)},
  ${sql(participant.position)}, ${participant.section ? '0.8000' : '1.0000'},
  ${jsonb({ sample_parser_version: 1, source_index: participantIndex })}
)
on conflict (document_id, source_participant_key) where source_participant_key is not null do nothing`)
    participantIndex += 1
  }

  const events = [
    ...(document.comments_history ?? []).map((entry, index) => ({ entry, index, group: 'history', isComment: false })),
    ...(document.comments ?? []).map((entry, index) => ({ entry, index, group: 'comment', isComment: true })),
  ]
  for (const [sequence, event] of events.entries()) {
    const eventActor = actorByName.get(cleanHtml(event.entry.user_name))
    const sourceEventId = `${event.group}:${event.index}`
    statements.push(`
insert into public.approval_document_events (
  id, document_id, source_system, source_event_id, source_sequence, event_type,
  source_event_type, actor_user_id, legacy_actor_id, actor_name_snapshot,
  title_snapshot, comment_snapshot, occurred_at, source_payload
) values (
  ${sql(stableUuid(`HIWORKS:EVENT:${document.no}:${sourceEventId}`))}::uuid,
  ${sql(documentId)}::uuid, 'HIWORKS', ${sql(sourceEventId)}, ${sequence},
  ${sql(eventType(event.entry, event.isComment))}, ${sql(actionOf(event.entry))}, null,
  ${eventActor ? `${sql(eventActor.id)}::uuid` : 'null'}, ${sql(event.entry.user_name)},
  ${sql(event.entry.title)}, ${sql(event.entry.comment)}, ${timestamp(event.entry.regdate)},
  ${jsonb({ type: event.entry.type, profile_url: event.entry.profile_url })}
)
on conflict (document_id, source_system, source_event_id) where source_event_id is not null do nothing`)
  }

  for (const [linkIndex, link] of (document.related_document_list ?? []).entries()) {
    const sourceLinkKey = `related:${linkIndex}:${link.related_document_no ?? link.document_no ?? link.document_code}`
    statements.push(`
insert into public.approval_legacy_document_links (
  id, document_id, source_link_key, target_source_document_no, target_document_code,
  target_title_snapshot, target_actor_name_snapshot, source_metadata
) values (
  ${sql(stableUuid(`HIWORKS:LINK:${document.no}:${sourceLinkKey}`))}::uuid,
  ${sql(documentId)}::uuid, ${sql(sourceLinkKey)},
  ${sql(link.related_document_no ?? link.document_no)}, ${sql(link.document_code)},
  ${sql(link.title)}, ${sql(link.user_name)}, ${jsonb(link)}
)
on conflict (document_id, source_link_key) where source_link_key is not null do nothing`)
  }
}

statements.push('commit')
const output = `${statements.join(';\n')};;\n`

console.log(
  JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    documents: documents.length,
    actors: actors.length,
    historyEvents: documents.reduce((sum, document) => sum + (document.comments_history?.length ?? 0), 0),
    comments: documents.reduce((sum, document) => sum + (document.comments?.length ?? 0), 0),
    relatedLinks: documents.reduce((sum, document) => sum + (document.related_document_list?.length ?? 0), 0),
    attachmentsDeferred: documents.reduce((sum, document) => sum + (document.attached_file_list?.length ?? 0), 0),
    structuredDocuments: documents.map((document) => {
      const parsed = extractStructuredDocument(document)
      return {
        sourceDocumentNo: document.no,
        form: parsed.formKey,
        populatedFields: Object.values(parsed.values).filter((value) =>
          Array.isArray(value) ? value.length > 0 : Boolean(value),
        ).length,
        paymentRows: Array.isArray(parsed.values.payments) ? parsed.values.payments.length : 0,
      }
    }),
    sqlBytes: Buffer.byteLength(output),
  }),
)

if (apply) {
  const tempPath = join(tmpdir(), `hiworks-approval-sample-${process.pid}.sql`)
  writeFileSync(tempPath, output, { encoding: 'utf8', mode: 0o600 })
  try {
    const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const result = spawnSync(
      command,
      ['exec', 'supabase', 'db', 'query', '--linked', '--file', tempPath],
      { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
    )
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  } finally {
    rmSync(tempPath, { force: true })
  }
}
