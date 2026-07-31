import {
  BackButton,
  Button,
  DetailTopBar,
  PageHeader,
  PanelCard,
  Spinner,
  cn,
  useToast,
} from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { downloadCsv } from '@/lib/csv'
import { supabase } from '@/lib/supabase'
import { createUploadBatch } from '@/features/networks/hooks'
import { BulkPreviewTable } from '@/features/bulk/BulkPreviewTable'
import { useBulkTagLookup } from '@/features/bulk/bulkTags'
import {
  buildTemplateCsv,
  parseBulkCsv,
  specTagTables,
  type BulkImportSpec,
} from '@/features/bulk/bulkImport'

/**
 * 원장 공용 대용량 업로드 화면(모달 아닌 전용 페이지).
 *
 * 목록에서 '대용량 업로드' 버튼으로 진입한다 — 사이드바 메뉴로 두면 업로드가 어느 원장으로
 * 들어가는지가 메뉴 이름에 드러나지 않아, 화면을 열고 나서야 대상을 알게 된다.
 *
 * 한 줄이라도 문제가 있으면 업로드 버튼을 잠근다. 부분 저장을 허용하면 "몇 줄이 들어갔는지"를
 * 원장에서 되짚어 지워야 하는데, 그 일이 파일을 고쳐 다시 올리는 일보다 훨씬 번거롭다.
 *
 * 담당자처럼 파일에 담기 어려운 값은 화면에서 한 번 지정해 전 행에 적용한다(spec.assignment).
 * 배정은 등록과 다른 RPC라 한 트랜잭션이 아니므로, 성립 여부를 등록 **전에** 확인한다 —
 * 등록해 놓고 배정에 실패하면 담당자 없는 레코드가 남아 공동관리로 열린다.
 */
export function BulkImportPage({ spec }: { spec: BulkImportSpec }) {
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [assignValue, setAssignValue] = useState<unknown>(spec.assignment?.initial ?? null)

  // 태그 원장을 다 읽은 뒤에 파싱한다(못 읽은 채 검증하면 모든 값이 통과해 버린다).
  const tagTables = useMemo(() => specTagTables(spec), [spec])
  const { lookup, ready: tagsReady } = useBulkTagLookup(tagTables)
  const result = useMemo(
    () => (text && tagsReady ? parseBulkCsv(text, spec, lookup) : null),
    // lookup은 매 렌더 새 객체라 태그 준비 여부와 파일 내용만 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, spec, tagsReady],
  )

  const loadFile = async (file: File) => {
    const body = await file.text()
    const parsed = parseBulkCsv(body, spec, lookup)
    if (parsed.preview.length === 0 && parsed.errors.length === 0) {
      toast.show('헤더와 최소 1개 데이터 행이 필요합니다.', 'warning')
      return
    }
    setFileName(file.name)
    setText(body)
  }

  const reset = () => {
    setFileName('')
    setText('')
  }

  const assignBlocked = spec.assignment?.blockedReason(assignValue) ?? null
  const ready = Boolean(result && result.rows.length > 0 && result.errors.length === 0 && !assignBlocked)

  const commit = async () => {
    if (!result || !ready) return
    setBusy(true)
    try {
      // (1) 배정이 성립하는지 먼저 본다 — 원장에 넣은 뒤 실패하면 되돌릴 방법이 없다.
      if (spec.assignment?.precheck) {
        const reason = await spec.assignment.precheck(result.rows, assignValue)
        if (reason) {
          toast.show(reason, 'warning')
          return
        }
      }
      const batchId = await createUploadBatch({
        filename: fileName,
        // 이 화면은 중복 병합을 하지 않아 파일 해시로 되짚을 것이 없다(이력 표기용 배치만 남긴다).
        contentHash: '',
        total: result.preview.length,
        inserted: result.rows.length,
        merged: 0,
        skipped: result.preview.length - result.rows.length,
      })
      // (2) 원장 INSERT와 기여 로그를 한 트랜잭션에 넣는다(SECURITY INVOKER — RLS는 그대로 걸린다).
      const { data, error } = await supabase.rpc('upload_insert_entities', {
        p_table: spec.table,
        p_rows: result.rows,
        p_batch_id: batchId,
      })
      if (error) throw error
      // (3) 배정 반영. 여기서 실패하면 등록은 남으므로 상세에서 지정하라고 분명히 알린다.
      if (spec.assignment) {
        const ids = (data ?? []) as string[]
        try {
          await spec.assignment.apply(ids, result.rows, assignValue)
        } catch {
          for (const key of spec.invalidateKeys) await qc.invalidateQueries({ queryKey: [...key] })
          toast.show(
            `${result.rows.length}건을 등록했지만 담당자 배정에 실패했습니다. 상세 화면에서 지정해 주세요.`,
            'warning',
          )
          navigate(spec.backTo)
          return
        }
      }
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
            <Button onClick={() => void commit()} disabled={!ready || busy} title={assignBlocked ?? undefined}>
              {busy ? '업로드 중…' : `${result?.rows.length ?? 0}건 업로드`}
            </Button>
          </>
        }
      />

      <PageHeader title={`${spec.noun} 대용량 업로드`} />

      <p className="text-body text-gray-600">{spec.guide}</p>

      {spec.assignment && (
        <PanelCard title={spec.assignment.title}>
          <p className="mb-3 text-body-sm text-gray-500">{spec.assignment.hint}</p>
          {spec.assignment.render(assignValue, setAssignValue)}
        </PanelCard>
      )}

      {!tagsReady ? (
        <Spinner />
      ) : !result ? (
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
        <BulkPreviewTable spec={spec} fileName={fileName} result={result} />
      )}
    </div>
  )
}
