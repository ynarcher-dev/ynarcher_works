import { Banner, Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { downloadCsv } from '@/lib/csv'
import { useEmployees } from '@/features/hub/hooks'
import {
  ASSET_IMPORT_HEADERS,
  buildAssetTemplateCsv,
  parseAssetCsv,
  type ImportRowError,
} from '@/features/management/assets/assetImport'
import { useBulkCreateAssets } from '@/features/management/assets/assetsApi'
import type { Branch } from '@/features/office/branches/branchesApi'

interface AssetImportModalProps {
  open: boolean
  onClose: () => void
  /** 귀속 후보(활성 지사). CSV의 지사명을 여기서 id로 바꾼다. */
  branches: Branch[]
}

/**
 * 자산 대용량 업로드 — 템플릿 CSV를 붙여 넣거나 파일로 올려 여러 건을 한 번에 등록한다.
 *
 * 검증을 통과한 줄만 세고, 한 줄이라도 문제가 있으면 저장 버튼을 잠근다. 절반만 들어간 원장을
 * 정리하는 일은 파일을 고쳐 다시 올리는 일보다 훨씬 번거롭다 — 그래서 부분 저장을 두지 않는다.
 *
 * 지사·관리자·할당 대상은 이름으로 받아 id로 바꾼다(파일을 만드는 사람이 uuid를 알 이유가 없다).
 * 동명이인처럼 이름만으로 특정할 수 없는 경우는 그 줄을 오류로 돌려보내 화면에서 지정하게 한다.
 */
export function AssetImportModal({ open, onClose, branches }: AssetImportModalProps) {
  const toast = useToast()
  const { data: employees } = useEmployees()
  const bulkCreate = useBulkCreateAssets()
  const [text, setText] = useState('')

  const refs = useMemo(
    () => ({
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      employees: (employees ?? []).map((e) => ({ id: e.id, name: e.name })),
    }),
    [branches, employees],
  )
  const { rows, errors } = useMemo(() => parseAssetCsv(text, refs), [text, refs])
  const ready = rows.length > 0 && errors.length === 0

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setText(await file.text())
  }

  const submit = async () => {
    try {
      await bulkCreate.mutateAsync(rows)
      toast.show(`${rows.length}건을 등록했습니다.`, 'success')
      setText('')
      onClose()
    } catch {
      toast.show('업로드에 실패했습니다. 값과 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="자산 대용량 업로드"
      help={
        '템플릿의 열 순서대로 CSV를 붙여 넣거나 파일을 선택하세요.\n지사·관리자·할당 대상은 이름으로 적고, 분류·상태·결제주기는 화면에서 쓰는 말(구매 · 보유 · 월 구독)을 그대로 적으면 됩니다.\n빈 칸은 기본값(구매 · 보유 · 완납 · 반출 불가)으로 들어가며, 만료일은 상태가 폐기면 폐기일자로 저장됩니다.'
      }
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            className="mr-auto"
            onClick={() => downloadCsv('자산_업로드_템플릿.csv', buildAssetTemplateCsv())}
          >
            템플릿 내려받기
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={bulkCreate.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!ready || bulkCreate.isPending}>
            {bulkCreate.isPending ? '등록 중…' : `${rows.length}건 등록`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void readFile(e.target.files?.[0])}
          className="block w-full text-body text-gray-700"
        />

        <TextArea
          value={text}
          rows={8}
          onChange={(e) => setText(e.target.value)}
          placeholder={ASSET_IMPORT_HEADERS.join(',')}
          className="font-mono"
        />

        {text.trim() !== '' && (
          <ImportResult count={rows.length} errors={errors} />
        )}
      </div>
    </Modal>
  )
}

/**
 * 파싱 결과. 성공 건수와 문제가 있는 줄을 함께 보여 준다 — 몇 줄이 들어갈지 모르는 채로
 * 등록을 누르게 하지 않는다. 오류는 파일의 줄 번호로 돌려준다.
 */
function ImportResult({ count, errors }: { count: number; errors: ImportRowError[] }) {
  if (errors.length === 0) {
    return <Banner tone="success">{count}건이 확인되었습니다. 등록을 누르면 저장됩니다.</Banner>
  }
  return (
    <div className="space-y-2">
      <Banner tone="danger">
        {errors.length}개 줄에 문제가 있어 등록할 수 없습니다. 파일을 고쳐 다시 올리세요
        {count > 0 && ` (통과한 줄 ${count}건도 함께 보류됩니다)`}.
      </Banner>
      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-radius-md border border-gray-200 bg-gray-25 p-2">
        {errors.map((e, i) => (
          <li key={`${e.line}-${i}`} className="text-caption text-gray-700">
            <span className="font-semibold tabular-nums">{e.line}행</span> · {e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
