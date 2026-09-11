import { Input, cn } from '@ynarcher/ui'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { approvalFormAssetUrl } from '@/features/approval/approvalFormAssets'
import {
  DEFAULT_OFFICIAL_DOCUMENT_TEMPLATE,
  hasRichTextContent,
  type OfficialDocumentTemplate,
  type OfficialDocumentValue,
} from '@/features/approval/fields'

export interface OfficialDocumentContext {
  title: string
  docNo: string | null
}

interface OfficialDocumentFieldProps {
  template?: OfficialDocumentTemplate
  context: OfficialDocumentContext
  value: OfficialDocumentValue
  onChange?: (value: OfficialDocumentValue) => void
}

const labelCell = 'whitespace-nowrap py-1 pr-1 text-body text-gray-900'
const colonCell = 'w-4 py-1 text-center text-body text-gray-900'
const valueCell = 'py-1 text-body text-gray-900'

function displayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '-'
  const [year, month, day] = value.split('-')
  return `${year}. ${month}. ${day}.`
}

function websiteHref(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z0-9.-]+(?:\/.*)?$/i.test(trimmed)) return `https://${trimmed}`
  return undefined
}

function TemplateImage({
  path,
  alt,
  className,
  editing,
}: {
  path?: string
  alt: string
  className: string
  editing: boolean
}) {
  const src = approvalFormAssetUrl(path)
  if (src) return <img src={src} alt={alt} className={cn('object-contain', className)} />
  return editing ? (
    <span
      className={cn(
        'inline-flex items-center justify-center border border-dashed border-gray-300 text-caption text-gray-400',
        className,
      )}
    >
      이미지 미등록
    </span>
  ) : (
    <span className={cn('inline-block', className)} aria-hidden />
  )
}

/**
 * 하이웍스 공문 틀을 화면용 의미 구조로 다시 그린다.
 *
 * 원본의 1px짜리 열 열두 개는 셀 위치를 맞추기 위한 편집기 산출물이라 그대로 복제하지 않는다.
 * 실제로 보이는 네 칸(항목·콜론·값·오른쪽 값)을 고정 폭으로 세우고, 원본과 같은 653px 종이 폭·
 * 글자 크기·행간·이미지 자리를 유지한다. 입력 가능한 곳은 수신·참조·발송일·본문뿐이다.
 */
export function OfficialDocumentField({
  template = DEFAULT_OFFICIAL_DOCUMENT_TEMPLATE,
  context,
  value,
  onChange,
}: OfficialDocumentFieldProps) {
  const editing = Boolean(onChange)
  const patch = (next: Partial<OfficialDocumentValue>) => onChange?.({ ...value, ...next })
  const href = websiteHref(template.website)

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="mx-auto w-[653px] max-w-none bg-white text-gray-900"
        style={{ fontFamily: 'Malgun Gothic, 맑은 고딕, sans-serif' }}
      >
        <table className="w-full table-fixed border-separate border-spacing-0">
          <colgroup>
            <col className="w-[71px]" />
            <col className="w-4" />
            <col />
            <col className="w-[160px]" />
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={3} className="h-7 align-bottom">
                <p className="m-0 text-title-sm font-bold leading-none">{template.companyName}</p>
              </td>
              <td rowSpan={3} className="text-center align-top">
                <TemplateImage
                  path={template.headerImagePath}
                  alt="공문 상단 이미지"
                  className="h-[66px] w-[77px]"
                  editing={editing}
                />
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="h-5 align-bottom text-caption leading-none">
                {template.address}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="h-5 align-bottom text-caption leading-none">
                Tel. {template.telephone}&nbsp;&nbsp;&nbsp;Fax. {template.fax}&nbsp;&nbsp;&nbsp;
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="text-info underline">
                    {template.website}
                  </a>
                ) : (
                  template.website
                )}
              </td>
            </tr>
            <tr aria-hidden>
              <td colSpan={4} className="h-5" />
            </tr>
            <tr>
              <td className={labelCell}>문서번호</td>
              <td className={colonCell}>:</td>
              <td className={valueCell}>{context.docNo ?? '미채번'}</td>
              <td className="py-1 text-right text-body">
                {editing ? (
                  <Input
                    density="table"
                    type="date"
                    aria-label="발송일"
                    value={value.sentOn}
                    onChange={(event) => patch({ sentOn: event.target.value })}
                  />
                ) : (
                  displayDate(value.sentOn)
                )}
              </td>
            </tr>
            <tr>
              <td className={labelCell}>수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신</td>
              <td className={colonCell}>:</td>
              <td colSpan={2} className={valueCell}>
                {editing ? (
                  <Input
                    density="table"
                    aria-label="수신"
                    value={value.recipient}
                    onChange={(event) => patch({ recipient: event.target.value })}
                  />
                ) : (
                  value.recipient || '-'
                )}
              </td>
            </tr>
            <tr>
              <td className={labelCell}>참&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;조</td>
              <td className={colonCell}>:</td>
              <td colSpan={2} className={valueCell}>
                {editing ? (
                  <Input
                    density="table"
                    aria-label="참조"
                    value={value.reference}
                    onChange={(event) => patch({ reference: event.target.value })}
                  />
                ) : (
                  value.reference || '-'
                )}
              </td>
            </tr>
            <tr>
              <td className={cn(labelCell, 'border-b border-gray-900')}>제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목</td>
              <td className={cn(colonCell, 'border-b border-gray-900')}>:</td>
              <td colSpan={2} className={cn(valueCell, 'border-b border-gray-900')}>
                {context.title || '-'}
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="pt-4">
                {editing ? (
                  <RichTextEditor
                    value={value.body}
                    onChange={(body) => patch({ body })}
                    placeholder="공문 내용을 입력하세요…"
                  />
                ) : hasRichTextContent(value.body) ? (
                  <RichTextViewer html={value.body} />
                ) : (
                  <p className="py-3 text-body text-gray-400">내용이 없습니다.</p>
                )}
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="h-[110px] pt-2 text-center align-top">
                <TemplateImage
                  path={template.footerImagePath}
                  alt="공문 하단 이미지"
                  className="h-[100px] w-[270px]"
                  editing={editing}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
