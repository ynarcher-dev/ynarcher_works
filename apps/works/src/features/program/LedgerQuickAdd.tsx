import { Button, Input, Spinner, cardText, cn, formText } from '@ynarcher/ui'
import { ItemRows } from '@/components/ItemRows'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import {
  isQuickAddRowReady,
  type QuickAddDraft,
  type QuickAddRow,
} from '@/features/program/quickAddDraft'
import { entryGapText, type BulkDecision, type BulkEntry } from '@/features/program/rosterBulk'

/**
 * 원장에 없는 대상을 **원장에 만들어** 명단에 담는 자리(2026-09-09 / 2026-09-10 여러 줄로).
 *
 * 이 화면의 요점은 입력 칸이 아니라 **저장 직전의 되물음**이다. "없는 줄 알고 새로 넣었는데
 * 사실 있었다"를 사후에 수습하는 방법은 병합뿐이고 그건 비싸므로, 막을 자리를 여기 둔다 —
 * 저장을 누르면 먼저 원장을 대조하고(이름·이메일·전화 중 2개 이상 일치), 걸리면 **만들지
 * 않고 그 행을 보여 준다.**
 *
 * 걸렸을 때 기본 행동이 `있는 행 담기`인 것이 규칙이다. `그래도 새로 만들기`는 한 번 더
 * 눌러야 닿는 자리에 둔다 — 동명이인·동명 법인이 실제로 있으므로 길을 막지는 않되, 손이
 * 저절로 가는 쪽은 이미 있는 행이어야 한다.
 *
 * **한 줄에 네 칸, 줄은 늘린다**(2026-09-10 사용자 지정). 명함 여러 장을 한 번에 정리하는
 * 자리라 한 건씩 창을 열고 닫는 것이 실제 불편이었다. 규격은 폼의 목록 입력 그대로다
 * (`ItemRows` — 머리글 한 줄 + 항목 한 줄 + 줄 끝 삭제), 그래서 이 창만의 목록 모양이
 * 새로 생기지 않는다.
 *
 * 받는 칸은 명단 표에 서는 넷뿐이고 **넷 다 필수**다(2026-09-10 사용자 결정). 종전에는 이름
 * 하나만 받았다 — 명함 한 장을 들고 오는 자리라 더 물으면 등록이 막힌다는 것이 근거였는데,
 * 그렇게 들어온 반쪽 행이 나중에 계정 생성 창에서 보완되면서 **원장을 고치는 자리가 둘**이
 * 됐다. 값의 집은 원장이므로 담는 문 앞에서 한 번 묻고 그 뒤로는 묻지 않는다. 이름만 아는
 * 대상은 명단이 아니라 원장에서 먼저 만든다(그쪽은 여전히 이름 하나로 선다).
 */
export function LedgerQuickAdd({
  master,
  rows,
  entries,
  onPatch,
  onAdd,
  onRemove,
  onDecide,
  busy,
}: {
  master: MasterTable
  rows: readonly QuickAddRow[]
  /** 대조 결과. `null`이면 아직 안 돌았거나 값이 바뀌어 무효가 된 것이다. */
  entries: BulkEntry[] | null
  onPatch: (index: number, patch: Partial<QuickAddDraft>) => void
  onAdd: () => void
  onRemove: (index: number) => void
  onDecide: (line: number, decision: BulkDecision) => void
  busy: boolean
}) {
  const spec = PARTICIPANT_PERSONAS[master]
  // 대상이 곧 사람인 자격(NETWORKS 전문가)은 이름 칸 하나가 명의까지 답한다 — 같은 값을
  // 두 칸으로 받으면 담당자가 둘을 다르게 적을 수 있고, 그때 원장에 남는 것은 하나뿐이다.
  const hasContactField = spec.ledger.person.name !== spec.ledger.matchColumns.name

  /*
    넷 다 필수다(2026-09-10) — 명단에 담긴 것은 계정을 열 수 있어야 하고, 그 셋(명의·이메일·
    연락처)이 없으면 열지 못한다. 종전에는 이름만 필수여서 "나중에 원장에서 채운다"였는데,
    그 나중이 계정 생성 창이 되어 원장을 고치는 자리가 둘이 됐다.
  */
  const cols = [
    { label: `${spec.nameHeader} *`, kind: 'text' as const },
    ...(hasContactField ? [{ label: `${spec.loginNameHeader} *`, kind: 'name' as const }] : []),
    { label: '이메일 *', kind: 'text' as const },
    { label: '연락처 *', kind: 'code' as const },
  ]

  /** 이름은 적었는데 아직 빈 칸이 남은 줄 번호. 담당자가 화면에서 세는 줄과 같은 번호다. */
  const incomplete = rows
    .map((r, i) => ({ line: i + 1, r }))
    .filter(({ r }) => r.name.trim() && !isQuickAddRowReady(master, r))
    .map(({ line }) => line)

  /** 그 줄에 대해 할 말이 있는 판정만 남긴다 — 새로 만들 줄은 알림에 서지 않는다. */
  const notices = (entries ?? []).filter((e) => e.match || e.decision === 'skip')

  return (
    <div className="space-y-4">
      <ItemRows
        cols={cols}
        rows={rows}
        rowKey={(r) => r.key}
        onAdd={onAdd}
        onRemove={onRemove}
        addLabel="줄 추가"
      >
        {(row, i) => (
          <>
            <Input
              value={row.name}
              onChange={(e) => onPatch(i, { name: e.target.value })}
              disabled={busy}
              aria-label={spec.nameHeader}
            />
            {hasContactField && (
              <Input
                value={row.contactName}
                onChange={(e) => onPatch(i, { contactName: e.target.value })}
                disabled={busy}
                aria-label={spec.loginNameHeader}
              />
            )}
            <Input
              type="email"
              value={row.email}
              onChange={(e) => onPatch(i, { email: e.target.value })}
              disabled={busy}
              aria-label="이메일"
            />
            <Input
              value={row.phone}
              onChange={(e) => onPatch(i, { phone: e.target.value })}
              disabled={busy}
              aria-label="연락처"
            />
          </>
        )}
      </ItemRows>

      {/*
        왜 아직 등록할 수 없는지 — 차단 안내라 접지 않는다(CLAUDE.md 안내 규칙의 예외).
        버튼만 흐려 두면 담당자는 어느 칸이 모자란지 눌러 보고도 알 수 없다.
      */}
      {incomplete.length > 0 && (
        <p className={formText.hint}>
          {incomplete.join(", ")}번 줄에 빈 칸이 있습니다 — 명단에 담긴 대상은 계정을 열 수
          있어야 하므로 표시된 칸을 모두 채워 주세요.
        </p>
      )}

      {notices.length > 0 && (
        <MatchNotices notices={notices} master={master} onDecide={onDecide} />
      )}
    </div>
  )
}

/**
 * 대조에 걸린 줄들. **무엇이 같아서 걸렸는지**를 밝힌다 — 건수만 말하면 담당자가 동명이인인지
 * 진짜 중복인지 판단할 근거가 없다.
 *
 * 줄 안이 아니라 목록 아래에 모아 세우는 이유는 격자다. 입력 줄은 열이 세로로 맞아야 위아래
 * 값을 견줄 수 있는데(`ItemRows`), 그 사이에 폭이 다른 알림 줄이 끼면 그 정렬이 끊긴다.
 * 대신 **몇 번 줄인지**를 알림이 먼저 말한다.
 */
function MatchNotices({
  notices,
  master,
  onDecide,
}: {
  notices: BulkEntry[]
  master: MasterTable
  onDecide: (line: number, decision: BulkDecision) => void
}) {
  return (
    <div className="space-y-2 rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2.5">
      <p className="text-body font-semibold text-gray-900">
        확인이 필요한 줄이 {notices.length}건 있습니다.
      </p>
      {notices.map((e) => (
        <div key={e.row.line} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn('shrink-0 font-medium text-gray-800', cardText.value)}>
            {e.row.line}번 줄 {e.row.name}
          </span>
          <span className={cn('min-w-0 flex-1', cardText.meta)}>
            {e.gaps.length > 0 ? (
              <>
                원장에 <span className="font-medium text-gray-800">{entryGapText(e, master)}</span>
                {e.match
                  ? " — 원장에서 채운 뒤 담을 수 있습니다."
                  : " — 이 줄의 빈 칸을 채워 주세요."}
              </>
            ) : e.alreadyMapped ? (
              <>이미 명단에 담겨 있습니다 — 이 줄은 등록하지 않습니다.</>
            ) : !e.match ? (
              <>앞의 줄과 같은 대상입니다 — 이 줄은 등록하지 않습니다.</>
            ) : (
              <>
                원장에 <span className="font-medium text-gray-800">{e.match.name}</span>
                {e.match.loginName && <> · {e.match.loginName}</>}
                {e.match.email && <> · {e.match.email}</>}
                {e.match.retired && <> · 원장 비활성</>} 가(이) 있습니다({e.match.hits}개 일치).{' '}
                {e.decision === 'link'
                  ? '새로 만들지 않고 이 행을 담습니다.'
                  : '이 행과 별개로 새로 만듭니다.'}
              </>
            )}
          </span>
          {/* 동명이인·동명 법인이 실제로 있으므로 길을 막지는 않되, 손이 저절로 가는 쪽은
              이미 있는 행이어야 한다. 사실로 내려간 줄(이미 담김·폼 안 중복)에는 고를 것이 없다. */}
          {e.match && !e.alreadyMapped && e.gaps.length === 0 && (
            <button
              type="button"
              onClick={() => onDecide(e.row.line, e.decision === 'link' ? 'create' : 'link')}
              className="shrink-0 text-body-sm text-info transition-opacity duration-fast hover:opacity-80"
            >
              {e.decision === 'link' ? '그래도 새로 만들기' : '있는 행 담기'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * 저장 버튼. 대조 전/후로 **누를 것이 달라진다** — 전에는 `확인 후 등록` 하나이고, 대조가
 * 끝나면 무엇을 담고 무엇을 만들지가 정해져 건수를 든 `담기`가 된다.
 */
export function LedgerQuickAddActions({
  entries,
  canSubmit,
  busy,
  onCheck,
  onSubmit,
}: {
  entries: BulkEntry[] | null
  canSubmit: boolean
  busy: boolean
  onCheck: () => void
  onSubmit: () => void
}) {
  if (busy) {
    return (
      <span className="flex items-center gap-2">
        <Spinner />
        <span className={cardText.meta}>처리 중…</span>
      </span>
    )
  }
  if (!entries) {
    return (
      <Button onClick={onCheck} disabled={!canSubmit}>
        확인 후 등록
      </Button>
    )
  }
  const total = entries.filter((e) => e.decision !== 'skip').length
  return (
    <Button onClick={onSubmit} disabled={total === 0}>
      담기 ({total})
    </Button>
  )
}
