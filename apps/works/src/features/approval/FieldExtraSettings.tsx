import { Field, Input, TextArea } from '@ynarcher/ui'
import { ImagePicker } from '@/components/ImagePicker'
import { RichTextEditor } from '@/components/RichTextEditor'
import { FieldColumnRows } from '@/features/approval/FieldColumnRows'
import { HtmlTemplateField } from '@/features/approval/HtmlTemplateField'
import {
  approvalFormAssetUrl,
  uploadApprovalFormAsset,
} from '@/features/approval/approvalFormAssets'
import {
  htmlTemplateImageSources,
  type FormField,
} from '@/features/approval/fields'

/** 쉼표로 이어진 한 줄을 목록으로 — 빈 칸은 버린다. */
const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * 필드 한 줄 아래에 서는 설정 — 한 줄에 담기지 않는 것들만 온다.
 *
 * 선택지·기본 문구·층 이름은 값 하나지만 길이를 모르는 값이고, 열 정의는 목록이라 줄 안에
 * 들어갈 수 없다. 라벨은 `Field`가 소유한다(화면이 규격 클래스를 직접 쓰지 않는다).
 */
export function FieldExtraSettings({
  field,
  onChange,
}: {
  field: FormField
  onChange: (next: FormField) => void
}) {
  const imageSources = htmlTemplateImageSources(field.defaultValue ?? '')
  const templateAssets = field.htmlAssets ?? {}
  const assetUrls = Object.values(templateAssets)
    .reduce<Record<string, string>>((urls, path) => {
      const url = approvalFormAssetUrl(path)
      if (url) urls[path] = url
      return urls
    }, {})
  const setAsset = (source: string, path?: string) => {
    const next = { ...templateAssets }
    if (path) next[source] = path
    else delete next[source]
    onChange({ ...field, htmlAssets: Object.keys(next).length > 0 ? next : undefined })
  }

  return (
    <div className="space-y-3">
      {field.type === 'SELECT' && (
        <Field label="선택지" hint="쉼표로 구분합니다. 적은 차례대로 목록에 섭니다.">
          <Input
            placeholder="법인카드, 개인카드, 현금"
            value={(field.options ?? []).join(', ')}
            onChange={(e) => onChange({ ...field, options: splitList(e.target.value) })}
          />
        </Field>
      )}

      {/* 본문 기본 문구 — 새 문서가 들고 시작하는 틀(`1. 행사명 : …`).
          옛 결재에서 담당자가 매번 손으로 적던 뼈대라, 양식이 한 번 갖고 있으면 된다. */}
      {field.type === 'RICHTEXT' && (
        <Field label="기본 문구" hint="새 문서가 이 내용으로 시작합니다. 비워 두면 빈 본문입니다.">
          <RichTextEditor
            placeholder="새 문서의 기본 내용을 입력하세요."
            value={field.defaultValue ?? ''}
            onChange={(html) => onChange({ ...field, defaultValue: html })}
          />
        </Field>
      )}

      {field.type === 'HTML_TEMPLATE' && (
        <div className="space-y-3">
          <Field
            label="HTML 원문"
            hint="표·셀 병합·인라인 스타일을 포함한 전체 HTML을 한 번 붙여 넣습니다. 새 문서에서는 아래와 같은 모양의 본문을 직접 편집합니다. script·iframe·form은 표시할 때 제거됩니다."
          >
            <TextArea
              rows={16}
              value={field.defaultValue ?? ''}
              placeholder="<div>...</div> 또는 <table>...</table>"
              onChange={(event) => onChange({ ...field, defaultValue: event.target.value })}
            />
          </Field>

          {imageSources.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {imageSources.map((source) => (
                <Field
                  key={source}
                  label="이미지 경로 교체"
                  hint={`${source} → 우리 시스템에 올린 파일`}
                >
                  <ImagePicker
                    value={templateAssets[source] ? [templateAssets[source]!] : []}
                    onChange={(paths) => setAsset(source, paths[0])}
                    upload={uploadApprovalFormAsset}
                    urls={assetUrls}
                    max={1}
                    maxBytes={2_000_000}
                  />
                </Field>
              ))}
            </div>
          )}

          {(field.defaultValue ?? '').trim() && (
            <Field label="미리보기" as="div">
              <HtmlTemplateField
                assets={templateAssets}
                context={{ title: '문서 제목 미리보기', docNo: '문서번호 미리보기' }}
                value={{ html: field.defaultValue ?? '' }}
              />
            </Field>
          )}
        </div>
      )}

      {/* 층 이름은 **기본값**만 양식이 갖는다 — 사업마다 층 이름과 층 수가 달라
          (대분류·중분류 / 세목·비목·세세목) 못 박으면 그 목록에 없는 사업은 예산을
          적을 수 없다. 문서를 쓰면서 고칠 수 있고, 최종 값은 문서가 갖는다. */}
      {field.type === 'BUDGET_TREE' && (
        <Field
          label="층 이름 기본값"
          hint="쉼표로 구분하며 위에서 아래 순서입니다. 문서를 쓰면서 프로젝트에 맞게 고칠 수 있습니다."
        >
          <Input
            placeholder="세목, 비목, 세세목"
            value={(field.levels ?? []).join(', ')}
            onChange={(e) => onChange({ ...field, levels: splitList(e.target.value) })}
          />
        </Field>
      )}

      {(field.type === 'TABLE' || field.type === 'BUDGET_TREE') && (
        <FieldColumnRows
          title={field.type === 'BUDGET_TREE' ? '예산표의 숫자 열' : '표의 열'}
          columns={field.columns ?? []}
          onChange={(columns) => onChange({ ...field, columns })}
        />
      )}
    </div>
  )
}
