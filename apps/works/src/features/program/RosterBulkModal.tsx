import { Button, Modal, Spinner, cardText, cn, useToast } from '@ynarcher/ui'
import { useRef, useState } from 'react'
import { downloadCsv } from '@/lib/csv'
import { findPersonaMatches } from '@/features/program/ledgerMatch'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import {
  buildEntries,
  buildTemplateCsv,
  parseBulkCsv,
  summarize,
  type BulkDecision,
  type BulkEntry,
} from '@/features/program/rosterBulk'
import { RosterBulkReviewTable } from '@/features/program/RosterBulkReviewTable'
import { useBulkAddRoster, useRosterCandidates } from '@/features/program/rosterHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 명단 CSV파일 업로드 — **파일을 올려 원장과 대조하고, 확인한 뒤 한 번에 담는다**(2026-09-09).
 *
 * 부르는 이름이 '대용량 담기'에서 바뀐 것은 2026-09-10 사용자 지정이다. 같은 창 안에서 손으로
 * 여러 줄을 적는 길(`신규 등록`)이 생긴 뒤로 '대용량'은 두 길을 가르지 못한다 — 가르는 것은
 * 건수가 아니라 **목록을 무엇이 정하는가**(파일 / 손)이므로, 이름도 그 사실을 적는다.
 *
 * 이 창의 본체는 업로드가 아니라 **리뷰**다. 파일에 적힌 이름 중 무엇이 이미 원장에 있고
 * 무엇이 없는지를 먼저 가리고, 그 판정을 사람이 보고 실행한다 — 바로 넣으면 3번(대용량)이
 * 4번(중복)을 만드는 기능이 된다.
 *
 * **모달인 이유**: 대상이 이 사업의 명단 하나라서다. 원장 대용량 등록은 전사 원장에 행을
 * 만드는 일이라 페이지(`/startup/bulk`)를 갖지만, 여기서 만드는 것은 이 사업의 참가 사실이고
 * 그 자리는 사업 상세 안이다 — 페이지로 빼면 어느 사업으로 돌아가야 하는지를 주소가 지고
 * 다녀야 한다.
 *
 * 판정은 등록 창과 **같은 함수**를 쓴다(`findPersonaMatches`). 두 화면이 같은 파일을 두고
 * 다른 답을 내면 담당자는 어느 쪽을 믿어야 할지 알 수 없다.
 */
export function RosterBulkModal({
  open,
  onClose,
  programId,
  master,
}: {
  open: boolean
  onClose: () => void
  programId: string
  master: MasterTable
}) {
  const toast = useToast()
  const config = useProgramWorkspace()
  const spec = PARTICIPANT_PERSONAS[master]
  const [entries, setEntries] = useState<BulkEntry[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 이미 담긴 대상을 알아야 '이미 담김'으로 잠글 수 있다. 검색어 없이 명단 전체를 읽는다.
  const { data: candidates } = useRosterCandidates(programId, master, '')
  const run = useBulkAddRoster(programId)

  const close = () => {
    setEntries(null)
    setFileName('')
    onClose()
  }

  const fail = (e: unknown, fallback: string) =>
    toast.show(e instanceof Error ? e.message : fallback, 'danger')

  const readFile = async (file: File) => {
    setReading(true)
    try {
      const rows = parseBulkCsv(await file.text())
      if (rows.length === 0) {
        toast.show('읽을 줄이 없습니다. 이름 열이 있는지 확인해 주세요.', 'warning')
        return
      }
      // 대조는 파일 전체를 한 번에 던진다 — 줄마다 왕복하면 수백 건에서 화면이 멈춘다.
      const matches = await findPersonaMatches(
        master,
        rows.map((r) => ({ name: r.name, email: r.email, phone: r.phone })),
      )
      const mapped = new Set((candidates ?? []).filter((c) => c.alreadyMapped).map((c) => c.id))
      setEntries(buildEntries(master, rows, matches, mapped))
      setFileName(file.name)
    } catch (e) {
      // 대조에 실패하면 표를 세우지 않는다 — '중복 없음'으로 보이는 표가 곧 대량 중복이다.
      fail(e, '파일을 읽거나 원장과 대조하는 데 실패했습니다.')
    } finally {
      setReading(false)
    }
  }

  const setDecision = (index: number, decision: BulkDecision) =>
    setEntries((prev) =>
      prev ? prev.map((e, i) => (i === index ? { ...e, decision } : e)) : prev,
    )

  const counts = entries ? summarize(entries) : { link: 0, create: 0, skip: 0 }
  const total = counts.link + counts.create

  const submit = () => {
    if (!entries) return
    run.mutate(
      {
        master,
        linkIds: entries.filter((e) => e.decision === 'link' && e.match).map((e) => e.match!.id),
        creates: entries.filter((e) => e.decision === 'create').map((e) => e.row),
      },
      {
        onSuccess: ({ linked, created }) => {
          toast.show(
            `${config.rosterLabel}에 ${linked + created}건을 담았습니다(원장 신규 ${created}건).`,
            'success',
          )
          close()
        },
        onError: (e) => fail(e, '담기에 실패했습니다. 권한을 확인하세요.'),
      },
    )
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={`${spec.label} CSV파일 업로드`}
      help="파일을 올리면 먼저 원장과 대조합니다. 원장에 있는 대상은 그 행을 담고, 없는 대상만 새로 만듭니다."
      size="2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {entries && (
            <span className={cn('mr-auto', cardText.meta)}>
              담기 {counts.link}건 · 신규 등록 {counts.create}건 · 제외 {counts.skip}건
            </span>
          )}
          <Button variant="ghost" onClick={close} disabled={run.isPending}>
            취소
          </Button>
          <Button onClick={submit} disabled={!entries || total === 0 || run.isPending}>
            {run.isPending ? '담는 중…' : `담기 (${total})`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 파일 입력을 라벨로 감싸 직접 꾸미지 않는다 — 그러면 컨트롤 높이를 손으로 적게
              되고, 그 규격이 앱 안에서 갈린다. 보이는 것은 공식 버튼이고 입력은 숨어 있다. */}
          <Button onClick={() => fileRef.current?.click()} disabled={run.isPending}>
            {entries ? '파일 다시 고르기' : 'CSV 파일 고르기'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            // 같은 파일을 고쳐서 다시 올리는 일이 잦다 — 값을 비우지 않으면 change가 안 뜬다.
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void readFile(file)
            }}
          />
          <Button
            variant="ghost"
            onClick={() =>
              downloadCsv(`${spec.label}_명단_템플릿.csv`, buildTemplateCsv(master))
            }
          >
            템플릿 내려받기
          </Button>
          {fileName && <span className={cardText.meta}>{fileName}</span>}
        </div>

        {reading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : entries ? (
          <RosterBulkReviewTable master={master} entries={entries} onDecision={setDecision} />
        ) : (
          // 빈 상태는 접지 않는다 — 무엇을 올려야 하는지가 여기서 답해야 할 물음이다.
          <p className="rounded-radius-md border border-dashed border-gray-300 px-3 py-8 text-center text-body text-gray-600">
            {spec.nameHeader} 열이 있는 CSV를 올리면 원장과 대조한 결과가 여기 섭니다.
            <br />
            <span className={cardText.meta}>
              받는 열은 명단에 서는 넷뿐입니다. 나머지 값은 원장에서 채웁니다.
            </span>
          </p>
        )}
      </div>
    </Modal>
  )
}
