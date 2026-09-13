import { Badge, Banner, Button, Modal, cardText, cn, tableText, useToast } from '@ynarcher/ui'
import { useMemo, useRef, useState } from 'react'
import {
  buildStructureTemplateCsv,
  parseBulkStructure,
  type BulkParsedRow,
} from '@/features/program/fileCollection/structureBulk'
import type { BulkBranch } from '@/features/program/fileCollection/structureDraft'
import { downloadCsv } from '@/lib/csv'

/**
 * 문항 대용량 등록 창 — **양식을 받아 채워 올리고, 읽힌 결과를 보고, 초안에 담는다.**
 *
 * 창의 본체는 올리기가 아니라 **미리보기**다. 채워 온 칸이 어느 자리로 읽혔는지 보이지
 * 않으면 수십 줄이 한꺼번에 어긋난 채로 표에 들어가고, 그것을 되돌리는 일은 한 줄씩 지우는
 * 일이 된다. 그래서 담기 전에 줄마다 읽힌 칸과 못 읽은 이유를 먼저 세운다.
 *
 * 담아도 **서버에 적히지는 않는다** — 표의 초안에 줄이 설 뿐이고, 적히는 것은 '구성 저장'
 * 하나뿐이다(이 화면의 다른 조작과 같은 규칙).
 */
export function StructureBulkModal({
  open,
  onClose,
  levels,
  onApply,
}: {
  open: boolean
  onClose: () => void
  levels: readonly string[]
  onApply: (branches: BulkBranch[]) => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseBulkStructure(text, levels), [text, levels])
  const names = levels.length ? levels : ['문항']
  const failed = parsed.rows.filter((row) => row.error)

  const close = () => {
    setText('')
    setFileName('')
    onClose()
  }

  /** 올린 파일은 글자로 풀어 그대로 읽는다. 읽기와 판정은 순수 함수가 하고 여기서는 나르기만 한다. */
  const readFile = async (file: File) => {
    try {
      const raw = await file.text()
      if (raw.trim() === '') {
        toast.show('빈 파일입니다. 양식을 내려받아 채운 뒤 올려 주세요.', 'warning')
        return
      }
      setText(raw)
      setFileName(file.name)
    } catch {
      toast.show('파일을 읽지 못했습니다. CSV로 저장한 파일인지 확인해 주세요.', 'danger')
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title="문항 대용량 등록"
      help="양식을 내려받아 엑셀에서 채운 뒤 올립니다. 칸 순서는 화면의 표와 같습니다 — 단계 이름들 · 필수 · 문항 안내. 담아도 '구성 저장'을 누르기 전에는 서버에 적히지 않습니다."
      size="3xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className={cn('mr-auto', cardText.meta)}>
            읽은 줄 {parsed.rows.length}개 · 담을 줄 {parsed.valid.length}개
            {failed.length > 0 && ` · 못 읽은 줄 ${failed.length}개`}
          </span>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button
            disabled={parsed.valid.length === 0}
            onClick={() => {
              onApply(parsed.valid)
              close()
            }}
          >
            {parsed.valid.length > 0 ? `${parsed.valid.length}줄 담기` : '담기'}
          </Button>
        </div>
      }
    >
      <div className="min-w-0 space-y-3">
        {/* 양식을 받아 채우고 올린다. 그 사이에 화면이 할 말은 없다 — 읽힌 결과가 말한다. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv('문항_대용량_등록_양식.csv', buildStructureTemplateCsv(names))
            }
          >
            양식 내려받기(CSV)
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            채운 파일 올리기
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // 같은 파일을 고쳐 다시 올릴 수 있어야 한다 — 값을 비우지 않으면 change가 안 온다.
              e.target.value = ''
              if (file) void readFile(file)
            }}
          />
          {fileName && <span className={cardText.meta}>{fileName}</span>}
        </div>

        {/* 붙여 넣기 칸은 두지 않는다 — 같은 일을 하는 길이 둘이면 어느 쪽이 진짜인지 묻게
            된다. 올린 파일이 어떻게 읽혔는지는 아래 미리보기가 답한다. */}
        <p className={cardText.meta}>
          양식의 머리글({[...names, '필수', '문항 안내'].join(' · ')})은 그대로 두고 예시 줄만
          지운 뒤 채웁니다. 위 단계 칸을 비우면 바로 위 줄과 같은 분류로 잇고, 이미 있는 분류와
          이름이 같으면 그 아래에 붙습니다. 필수 칸은 비우거나 <strong>Y/N</strong>으로 적습니다.
        </p>

        {failed.length > 0 && (
          <Banner tone="warning">
            {failed.length}개 줄은 담지 않습니다. 아래 표에서 이유를 확인하고 파일을 고쳐 다시
            올려 주세요.
          </Banner>
        )}

        {parsed.rows.length > 0 && <BulkPreview rows={parsed.rows} names={names} />}
      </div>
    </Modal>
  )
}

/** 읽힌 결과 표 — 화면의 문항 표와 같은 칸 순서로 세워, 어디가 어긋났는지 눈으로 대조한다. */
function BulkPreview({ rows, names }: { rows: readonly BulkParsedRow[]; names: readonly string[] }) {
  return (
    <div className="relative max-h-80 min-w-0 max-w-full overflow-auto rounded-radius-md border border-gray-200">
      <table className="w-full border-collapse">
        <caption className="sr-only">올린 문항 표 미리보기</caption>
        <thead className="sticky top-0 bg-gray-25">
          <tr className="border-b border-gray-200">
            <th scope="col" className={cn('w-10 px-2 py-1.5 text-right', tableText.head)}>
              줄
            </th>
            {names.map((name, level) => (
              <th key={level} scope="col" className={cn('px-2 py-1.5 text-left', tableText.head)}>
                {name || `${level + 1}단계`}
              </th>
            ))}
            <th scope="col" className={cn('w-12 px-2 py-1.5 text-center', tableText.head)}>
              필수
            </th>
            <th scope="col" className={cn('px-2 py-1.5 text-left', tableText.head)}>
              문항 안내
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-b border-gray-100 align-top">
              <td className={cn('px-2 py-1 text-right text-gray-500', tableText.meta)}>
                {row.line}
              </td>
              {row.error ? (
                <td colSpan={names.length + 2} className={cn('px-2 py-1', tableText.body)}>
                  <span className="text-danger">{row.error}</span>{' '}
                  <span className="text-gray-500">{row.cells.join(' | ')}</span>
                </td>
              ) : (
                <>
                  {row.branch.titles.map((title, level) => (
                    <td
                      key={level}
                      className={cn('px-2 py-1 break-words [overflow-wrap:anywhere]', tableText.body)}
                    >
                      {title}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center">
                    {row.branch.isRequired ? (
                      <Badge tone="warning">필수</Badge>
                    ) : (
                      <span className={tableText.meta}>선택</span>
                    )}
                  </td>
                  <td
                    className={cn('px-2 py-1 break-words [overflow-wrap:anywhere]', tableText.body)}
                  >
                    {row.branch.guide}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
