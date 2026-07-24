import {
  Button,
  ExpandToggleButton,
  FullscreenPanel,
  Modal,
  Spinner,
} from '@ynarcher/ui'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import {
  fetchMaterialBlobUrl,
  fetchMaterialText,
  materialPreviewKind,
  type Material,
  type PreviewKind,
} from '@/features/networks/materialHooks'

/**
 * 자료 간이 뷰어(공용). 확장자별로 렌더가 갈리는 인라인 미리보기 모달이다.
 * - pdf/image/video: Signed URL에 다운로드 디스포지션이 붙어 있어 요소에 직접 넣으면
 *   다운로드되므로, 바이트를 받아 blob URL로 만들어 브라우저 내장 렌더로 띄운다.
 * - text: 바이트를 텍스트로 받아 <pre>로 표시한다(html/svg도 텍스트로만 렌더 → XSS 없음).
 * 자료 접근은 서버가 RLS·access_logs를 강제하는 material-download 경유다.
 *
 * '크게보기'는 로드된 blob/텍스트를 유지한 채 모달 ↔ 전체화면 오버레이만 갈아 끼워,
 * 토글해도 파일을 다시 받지 않는다(로딩은 material에만 의존).
 */
export function MaterialPreviewModal({
  material,
  onClose,
}: {
  material: Material
  onClose: () => void
}) {
  const kind = materialPreviewKind(material)
  // blob(pdf/image/video)과 text(text)는 로드 방식이 달라 둘 다 상태로 둔다.
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [text, setText] = useState<{ text: string; truncated: boolean } | null>(null)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!kind) return
    let objectUrl: string | null = null
    let alive = true
    setBlobUrl(null)
    setText(null)
    setError(false)

    if (kind === 'text') {
      fetchMaterialText(material)
        .then((t) => alive && setText(t))
        .catch(() => alive && setError(true))
    } else {
      fetchMaterialBlobUrl(material)
        .then((u) => {
          objectUrl = u
          if (alive) setBlobUrl(u)
          else URL.revokeObjectURL(u)
        })
        .catch(() => alive && setError(true))
    }

    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [material, kind])

  const viewer = error ? (
    <p className="py-10 text-center text-body text-danger">
      미리보기를 불러오지 못했습니다. 다운로드해 확인해 주세요.
    </p>
  ) : (
    <PreviewBody
      kind={kind}
      fileName={material.file_name}
      blobUrl={blobUrl}
      text={text}
    />
  )

  const toggle = (
    <ExpandToggleButton
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      expandIcon={<Maximize2 className="mr-1.5 size-4" />}
      collapseIcon={<Minimize2 className="mr-1.5 size-4" />}
    />
  )

  if (expanded) {
    return (
      <FullscreenPanel
        open
        onClose={onClose}
        title={
          <span className="truncate text-title-sm font-medium text-gray-900">
            {material.file_name}
          </span>
        }
        actions={
          <>
            {toggle}
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
          </>
        }
      >
        <div className="h-full w-full">{viewer}</div>
      </FullscreenPanel>
    )
  }

  return (
    <Modal open onClose={onClose} title={material.file_name} size="2xl">
      <div className="flex h-[75vh] w-full flex-col gap-3">
        <div className="flex shrink-0 justify-end">{toggle}</div>
        <div className="min-h-0 flex-1">{viewer}</div>
      </div>
    </Modal>
  )
}

/** 종류별 실제 렌더. 로드 전에는 스피너를 보여준다. */
function PreviewBody({
  kind,
  fileName,
  blobUrl,
  text,
}: {
  kind: PreviewKind | null
  fileName: string
  blobUrl: string | null
  text: { text: string; truncated: boolean } | null
}): ReactNode {
  const loading = (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  )

  if (kind === 'text') {
    if (!text) return loading
    return (
      <div className="h-full w-full overflow-auto rounded-radius-sm border border-gray-200 bg-white">
        <pre className="whitespace-pre px-3 py-2 font-mono text-caption text-gray-800">
          {text.text}
        </pre>
        {text.truncated && (
          <p className="border-t border-gray-200 px-3 py-1.5 text-caption text-gray-500">
            파일이 커서 앞부분만 표시했습니다. 전체 내용은 다운로드해 확인해 주세요.
          </p>
        )}
      </div>
    )
  }

  if (!blobUrl) return loading

  if (kind === 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto rounded-radius-sm border border-gray-200 bg-gray-50">
        <img src={blobUrl} alt={fileName} className="max-h-full max-w-full object-contain" />
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-radius-sm border border-gray-200 bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={blobUrl} controls className="max-h-full max-w-full" />
      </div>
    )
  }

  // pdf
  return (
    <iframe
      title={fileName}
      src={blobUrl}
      className="h-full w-full rounded-radius-sm border border-gray-200"
    />
  )
}
