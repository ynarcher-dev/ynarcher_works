import { Badge, Banner, BackButton, Button, DetailTopBar, PageHeader, cn, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { downloadCsv } from '@/lib/csv'
import { supabase } from '@/lib/supabase'
import { createUploadBatch } from '@/features/networks/hooks'
import {
  buildTemplateCsv,
  parseBulkCsv,
  type BulkImportSpec,
  type BulkParseResult,
} from '@/features/bulk/bulkImport'

/** 미리보기에 보여 줄 최대 줄 수. 나머지는 건수로만 알린다(수백 줄을 다 그리면 화면이 멈춘다). */
const PREVIEW_LIMIT = 50

/**
 * 원장 공용 대용량 업로드 화면(모달 아닌 전용 페이지).
 *
 * 목록에서 '대용량 업로드' 버튼으로 진입한다 — 사이드바 메뉴로 두면 업로드가 어느 원장으로
 * 들어가는지가 메뉴 이름에 드러나지 않아, 화면을 열고 나서야 대상을 알게 된다.
 *
 * 한 줄이라도 문제가 있으면 업로드 버튼을 잠근다. 부분 저장을 허용하면 "몇 줄이 들어갔는지"를
 * 원장에서 되짚어 지워야 하는데, 그 일이 파일을 고쳐 다시 올리는 일보다 훨씬 번거롭다.
 */
export function BulkImportPage({ spec }: { spec: BulkImportSpec }) {
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<BulkParseResult | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadFile = async (file: File) => {
    const text = await file.text()
    const parsed = parseBulkCsv(text, spec)
    if (parsed.preview.length === 0 && parsed.errors.length === 0) {
      toast.show('헤더와 최소 1개 데이터 행이 필요합니다.', 'warning')
      return
    }
    setFileName(file.name)
    setResult(parsed)
  }

  const reset = () => {
    setFileName('')
    setResult(null)
  }

  const ready = Boolean(result && result.rows.length > 0 && result.errors.length === 0)

  const commit = async () => {
    if (!result || !ready) return
    setBusy(true)
    try {
      const batchId = await createUploadBatch({
        filename: fileName,
        // 이 화면은 중복 병합을 하지 않아 파일 해시로 되짚을 것이 없다(이력 표기용 배치만 남긴다).
        contentHash: '',
        total: result.preview.length,
        inserted: result.rows.length,
        merged: 0,
        skipped: result.preview.length - result.rows.length,
      })
      // 원장 INSERT와 기여 로그를 한 트랜잭션에 넣는다(SECURITY INVOKER — RLS는 그대로 걸린다).
      const { error } = await supabase.rpc('upload_insert_entities', {
        p_table: spec.table,
        p_rows: result.rows,
        p_batch_id: batchId,
      })
      if (error) throw error
      for (const key of spec.invalidateKeys) await qc.invalidateQueries({ queryKey: [...key] })
      toast.show(`${result.rows.length}건을 등록했습니다.`, 'success')
      navigate(spec.backTo)
    } catch {
      toast.show('업로드에 실패했습니다. 값과 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <DetailTopBar
        back={<BackButton as={Link} to={spec.backTo} />}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => downloadCsv(spec.templateName, buildTemplateCsv(spec))}
            >
              템플릿 내려받기
            </Button>
            {result && (
              <Button variant="secondary" onClick={reset} disabled={busy}>
                다시 선택
              </Button>
            )}
            <Button onClick={() => void commit()} disabled={!ready || busy}>
              {busy ? '업로드 중…' : `${result?.rows.length ?? 0}건 업로드`}
            </Button>
          </>
        }
      />

      <PageHeader title={`${spec.noun} 대용량 업로드`} />

      <p className="text-body text-gray-600">{spec.guide}</p>

      {!result ? (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) void loadFile(file)
          }}
          className={cn(
            'flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-radius-lg border-2 border-dashed text-center transition-colors',
            dragging ? 'border-brand bg-brand/5' : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
          )}
        >
          <span className="text-body font-medium text-gray-700">
            CSV 파일을 여기로 드래그하거나 클릭해 선택하세요
          </span>
          <span className="text-caption text-gray-600">.csv (UTF-8)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void loadFile(file)
            }}
          />
        </label>
      ) : (
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
                {result.errors.length}개 줄에 문제가 있어 업로드할 수 없습니다. 파일을 고쳐 다시
                올리세요
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

          {/* 값이 어느 열로 읽혔는지 눈으로 확인하는 자리다 — 열이 밀린 파일은 여기서 걸린다. */}
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
                    <tr
                      key={r.line}
                      className={cn('border-t border-gray-100', bad && 'bg-danger/5')}
                    >
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
      )}
    </div>
  )
}
