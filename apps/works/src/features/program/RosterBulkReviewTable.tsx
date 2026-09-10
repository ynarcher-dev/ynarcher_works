import { Select, cardText, cn } from '@ynarcher/ui'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { entryGapText, type BulkDecision, type BulkEntry } from '@/features/program/rosterBulk'

/**
 * CSV파일 업로드 리뷰 표 — **파일이 원장과 어떻게 맞물렸는가**를 줄마다 보여 준다.
 *
 * `DataTable`을 쓰지 않는다. 저 부품은 원장 목록의 규격(정렬·페이저·표준 열·선택)을 갖고
 * 있는데, 여기 서는 것은 원장 행이 아니라 **아직 저장되지 않은 판정**이고 페이지를 넘기면
 * 안 되는 목록이다(넘긴 페이지의 결정을 못 본 채 실행하게 된다).
 *
 * 결정 드롭다운의 선택지가 대조 결과에 따라 다른 것이 요점이다 — **중복인 줄에는 '새로
 * 만들기'가 없다.** 한 줄씩 예외를 열면 그 예외가 파일 단위로 반복되어, 손으로 하나 만드는
 * 것과 달리 수십 건의 중복이 한 번에 들어온다. 이미 담긴 줄은 아예 잠긴다.
 */
export function RosterBulkReviewTable({
  master,
  entries,
  onDecision,
}: {
  master: MasterTable
  entries: BulkEntry[]
  onDecision: (index: number, decision: BulkDecision) => void
}) {
  const spec = PARTICIPANT_PERSONAS[master]

  return (
    <div className="max-h-[24rem] overflow-auto rounded-radius-md border border-gray-200">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-200">
            <Th className="w-12 text-right">줄</Th>
            <Th>{spec.nameHeader}</Th>
            <Th className="w-56">원장 대조</Th>
            <Th className="w-40">처리</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={entry.row.line} className="border-b border-gray-100 last:border-b-0">
              <td className={cn('px-3 py-2 text-right tabular-nums', cardText.meta)}>
                {entry.row.line}
              </td>
              <td className="px-3 py-2">
                <span className="block truncate text-body font-medium text-gray-900">
                  {entry.row.name}
                </span>
                {/* 파일에 적힌 값을 그대로 되읽는다 — 무엇을 올렸는지 확인하는 자리다. */}
                <span className={cn('block truncate', cardText.meta)}>
                  {[entry.row.contactName, entry.row.email, entry.row.phone]
                    .filter(Boolean)
                    .join(' · ') || '연락처 없음'}
                </span>
              </td>
              <td className="px-3 py-2">
                <MatchCell entry={entry} master={master} />
              </td>
              <td className="px-3 py-2">
                <Select
                  value={entry.decision}
                  onChange={(e) => onDecision(i, e.target.value as BulkDecision)}
                  // 빈 칸이 있는 줄은 담을 수 없다 — 고를 것이 없으므로 잠근다.
                  disabled={entry.alreadyMapped || entry.gaps.length > 0}
                >
                  {/* 중복인 줄에 '신규 등록'을 두지 않는다 — 위 주석 참조. */}
                  {entry.gaps.length === 0 &&
                    (entry.match ? (
                      <option value="link">이 행 담기</option>
                    ) : (
                      <option value="create">신규 등록 후 담기</option>
                    ))}
                  <option value="skip">담지 않음</option>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-3 py-2 text-left text-body-sm font-semibold text-gray-700', className)}>
      {children}
    </th>
  )
}

/**
 * 대조 결과 칸. **무엇이 같아서 걸렸는지**까지 적는다 — 이름만 보여 주면 동명이인인지
 * 진짜 중복인지 판단할 근거가 없고, 그때 담당자가 할 수 있는 일은 통째로 믿는 것뿐이다.
 */
function MatchCell({ entry, master }: { entry: BulkEntry; master: MasterTable }) {
  /*
    빈 칸이 가장 먼저 답한다 — 대조에 걸렸는지보다 **담을 수 있는지**가 담당자가 지금 할 일을
    정한다. 어디를 고쳐야 하는지도 함께 적는다: 있는 행을 담는 줄은 원장을, 새로 만드는 줄은
    파일을 고쳐야 한다.
  */
  if (entry.gaps.length > 0) {
    return (
      <span className="block">
        <span className="block truncate text-body-sm text-danger">
          {entryGapText(entry, master)}
        </span>
        <span className={cn("block truncate", cardText.meta)}>
          {entry.match ? "원장에서 채운 뒤 담을 수 있습니다" : "파일의 빈 칸을 채워 주세요"}
        </span>
      </span>
    )
  }
  if (entry.alreadyMapped) {
    return <span className={cardText.meta}>이미 담김</span>
  }
  if (!entry.match) {
    return <span className="text-body-sm text-info">원장에 없음</span>
  }
  return (
    <span className="block">
      <span className="block truncate text-body-sm text-gray-800">{entry.match.name}</span>
      <span className={cn('block truncate', cardText.meta)}>
        {entry.match.hits}개 일치
        {entry.match.retired && ' · 원장 비활성'}
      </span>
    </span>
  )
}
