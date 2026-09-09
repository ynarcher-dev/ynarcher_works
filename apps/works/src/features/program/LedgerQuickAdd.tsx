import { Button, Field, Input, Spinner, cardText, cn } from '@ynarcher/ui'
import type { PersonaMatch } from '@/features/program/ledgerMatch'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import type { QuickAddDraft } from '@/features/program/quickAddDraft'

/**
 * 원장에 없는 대상을 **원장에 만들어** 명단에 담는 자리(2026-09-09).
 *
 * 이 화면의 요점은 입력 칸이 아니라 **저장 직전의 되물음**이다. "없는 줄 알고 새로 넣었는데
 * 사실 있었다"를 사후에 수습하는 방법은 병합뿐이고 그건 비싸므로, 막을 자리를 여기 둔다 —
 * 저장을 누르면 먼저 원장을 대조하고(이름·이메일·전화 중 2개 이상 일치), 걸리면 **만들지
 * 않고 그 행을 보여 준다.**
 *
 * 걸렸을 때 기본 행동이 `이 대상 담기`인 것이 규칙이다. `그래도 새로 만들기`는 한 번 더
 * 눌러야 닿는 자리에 둔다 — 동명이인·동명 법인이 실제로 있으므로 길을 막지는 않되, 손이
 * 저절로 가는 쪽은 이미 있는 행이어야 한다.
 *
 * 대조는 이름을 고칠 때마다 돌지 않는다(타이핑마다 원장을 긁으면 그 요청이 실제 저장보다
 * 훨씬 잦다). 저장 한 번에 한 번 돌고, 값을 고치면 결과가 사라진다 — 지나간 대조 결과가
 * 바뀐 값 옆에 남아 있으면 그 화면이 거짓을 말한다.
 *
 * 받는 칸은 명단 표에 서는 넷뿐이고 **이름만 필수**다. 이 자리는 명함 한 장이나 회의 직후의
 * 이름 하나를 들고 오는 곳이라, 더 물으면 등록 자체가 막힌다.
 */
export function LedgerQuickAdd({
  master,
  draft,
  onDraftChange,
  match,
  onMatchChange,
  busy,
}: {
  master: MasterTable
  draft: QuickAddDraft
  onDraftChange: (next: QuickAddDraft) => void
  /** 대조 결과. `null`이면 아직 안 돌았거나 값이 바뀌어 무효가 된 것이다. */
  match: PersonaMatch | null
  onMatchChange: (next: PersonaMatch | null) => void
  busy: boolean
}) {
  const spec = PARTICIPANT_PERSONAS[master]
  // 대상이 곧 사람인 자격(NETWORKS 전문가)은 이름 칸 하나가 명의까지 답한다 — 같은 값을
  // 두 칸으로 받으면 담당자가 둘을 다르게 적을 수 있고, 그때 원장에 남는 것은 하나뿐이다.
  const hasContactField = spec.ledger.person.name !== spec.ledger.matchColumns.name

  const set = (patch: Partial<QuickAddDraft>) => {
    onDraftChange({ ...draft, ...patch })
    // 값이 바뀌면 지나간 대조는 무효다.
    onMatchChange(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={spec.nameHeader} required>
          <Input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            disabled={busy}
            autoFocus
          />
        </Field>
        {hasContactField && (
          <Field label={spec.loginNameHeader}>
            <Input
              value={draft.contactName}
              onChange={(e) => set({ contactName: e.target.value })}
              disabled={busy}
            />
          </Field>
        )}
        <Field label="이메일">
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => set({ email: e.target.value })}
            disabled={busy}
          />
        </Field>
        <Field label="연락처">
          <Input
            value={draft.phone}
            onChange={(e) => set({ phone: e.target.value })}
            disabled={busy}
          />
        </Field>
      </div>

      {match && <MatchNotice match={match} spec={spec} />}
    </div>
  )
}

/**
 * 대조에 걸렸을 때 서는 알림. **무엇이 같아서 걸렸는지**를 밝힌다 — 건수만 말하면 담당자가
 * 동명이인인지 진짜 중복인지 판단할 근거가 없다.
 */
function MatchNotice({
  match,
  spec,
}: {
  match: PersonaMatch
  spec: (typeof PARTICIPANT_PERSONAS)[MasterTable]
}) {
  return (
    <div className="rounded-radius-md border border-warning-200 bg-warning-50 px-3 py-2.5">
      <p className="text-body font-semibold text-gray-900">
        원장에 이미 있습니다 — {match.hits}개 항목이 일치합니다.
      </p>
      <p className={cn('mt-1', cardText.meta)}>
        <span className="font-medium text-gray-800">{match.name}</span>
        {match.loginName && <> · {match.loginName}</>}
        {match.email && <> · {match.email}</>}
        {match.phone && <> · {match.phone}</>}
        {match.retired && <> · 원장 비활성</>}
      </p>
      <p className={cn('mt-1.5', cardText.meta)}>
        {match.retired
          ? `이 ${spec.label}은(는) 원장에서 내려간 행입니다. 담으면 명단에 서되 '원장 비활성'으로 표시됩니다.`
          : '새로 만들지 않고 이 행을 담는 것이 정본을 하나로 지키는 길입니다.'}
      </p>
    </div>
  )
}

/**
 * 저장 버튼 묶음. 대조 전/후로 **누를 것이 달라진다** — 전에는 `확인 후 등록` 하나이고,
 * 걸린 뒤에는 `이 대상 담기`가 주 행동이 되고 새로 만들기는 물러선다.
 */
export function LedgerQuickAddActions({
  match,
  canSubmit,
  busy,
  onCheckAndCreate,
  onCreateAnyway,
  onUseMatch,
}: {
  match: PersonaMatch | null
  canSubmit: boolean
  busy: boolean
  onCheckAndCreate: () => void
  onCreateAnyway: () => void
  onUseMatch: () => void
}) {
  if (busy) {
    return (
      <span className="flex items-center gap-2">
        <Spinner />
        <span className={cardText.meta}>처리 중…</span>
      </span>
    )
  }
  if (!match) {
    return (
      <Button onClick={onCheckAndCreate} disabled={!canSubmit}>
        확인 후 등록
      </Button>
    )
  }
  return (
    <>
      {/* 동명이인·동명 법인이 실제로 있으므로 길을 막지는 않되, 손이 저절로 가는 쪽은
          이미 있는 행이어야 한다. */}
      <Button variant="outline" onClick={onCreateAnyway}>
        그래도 새로 만들기
      </Button>
      <Button onClick={onUseMatch}>이 대상 담기</Button>
    </>
  )
}

