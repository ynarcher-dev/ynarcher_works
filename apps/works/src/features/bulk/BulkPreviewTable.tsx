import { Badge, Banner, cn } from '@ynarcher/ui'
import type { BulkImportSpec, BulkParseResult } from '@/features/bulk/bulkImport'

/** 미리보기에 보여 줄 최대 줄 수. 나머지는 건수로만 알린다(수백 줄을 다 그리면 화면이 멈춘다). */
const PREVIEW_LIMIT = 50

/**
 * 읽어 들인 파일의 검수 화면 — 요약 배지 · 오류 목록 · 열 배치 미리보기.
 *
 * 값이 어느 열로 읽혔는지 눈으로 확인하는 자리다. 열이 한 칸씩 밀린 파일은 오류가 아니라
 * "이상한 곳에 들어간 값"으로 나타나므로, 숫자 요약만으로는 걸리지 않는다.
 */
export function BulkPreviewTable({
  spec,
  fileName,
  result,
}: {
  spec: BulkImportSpec
  fileName: string
  result: BulkParseResult
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-caption text-gray-600">
        <span className="font-medium text-gray-800">{fileName}</span>
        <Badge tone="neutral">전체 {result.preview.length}</Badge>
        <Badge tone="success">등록 {result.rows.length}</Badge>
        {result.errors.length > 0 && <Badge tone="danger">오류 {result.errors.length}</Badge>}
      </div>

      {result.errors.length > 0 ? (
        <div className="space-y-2">
          <Banner tone="danger">
            {result.errors.length}개 줄에 문제가 있어 업로드할 수 없습니다. 파일을 고쳐 다시 올리세요
            {result.rows.length > 0 && ` (통과한 줄 ${result.rows.length}건도 함께 보류됩니다)`}.
          </Banner>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-radius-md border border-gray-200 bg-gray-25 p-2">
            {result.errors.map((e, i) => (
              <li key={`${e.line}-${i}`} className="text-caption text-gray-700">
                <span className="font-semibold tabular-nums">{e.line}행</span> · {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Banner tone="success">
          {result.rows.length}건이 확인되었습니다. 업로드를 누르면 등록됩니다.
        </Banner>
      )}

      <div className="overflow-x-auto rounded-radius-md border border-gray-200">
        <table className="w-full text-caption">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-700">
              <th className="w-12 px-3 py-1.5 font-medium">행</th>
              {spec.fields.map((f) => (
                <th key={f.column} className="whitespace-nowrap px-3 py-1.5 font-medium">
                  {f.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.preview.slice(0, PREVIEW_LIMIT).map((r) => {
              const bad = result.errors.some((e) => e.line === r.line)
              return (
                <tr key={r.line} className={cn('border-t border-gray-100', bad && 'bg-danger/5')}>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{r.line}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-1.5 text-gray-800">
                      {c || <span className="text-gray-400">-</span>}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {result.preview.length > PREVIEW_LIMIT && (
        <p className="text-right text-caption text-gray-600">
          외 {result.preview.length - PREVIEW_LIMIT}줄 (업로드에는 모두 포함됩니다)
        </p>
      )}
    </div>
  )
}
