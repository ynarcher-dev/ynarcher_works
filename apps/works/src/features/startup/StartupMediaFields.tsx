import { Button, Input, Select, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { MEDIA_KINDS, useLinkMetadata, type MediaItem } from '@/features/startup/startupMedia'

interface Props {
  media: MediaItem[]
  setMedia: (m: MediaItem[]) => void
}

/**
 * 통합 수정 폼의 '미디어' 입력 섹션.
 * URL을 붙이고 '메타데이터 불러오기'를 누르면 link-metadata Edge Function이 제목·설명·썸네일·출처를
 * 채운다(수동 편집 가능). 저장은 상위 폼이 media jsonb로 통째 반영한다.
 */
export function StartupMediaFields({ media, setMedia }: Props) {
  const toast = useToast()
  const meta = useLinkMetadata()
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null)

  const patch = (i: number, p: Partial<MediaItem>) =>
    setMedia(media.map((m, idx) => (idx === i ? { ...m, ...p } : m)))

  const fetchMeta = async (i: number) => {
    const url = (media[i]?.url ?? '').trim()
    if (!url) {
      toast.show('URL을 먼저 입력하세요.', 'warning')
      return
    }
    setLoadingIndex(i)
    try {
      const m = await meta.mutateAsync(url)
      patch(i, {
        url: m.url || url,
        title: m.title,
        description: m.description,
        image: m.image,
        siteName: m.siteName,
      })
      toast.show('메타데이터를 불러왔습니다.', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '메타데이터를 불러오지 못했습니다.', 'danger')
    } finally {
      setLoadingIndex(null)
    }
  }

  return (
    <div className="space-y-3">
      {media.map((m, i) => (
        <div key={i} className="space-y-2 rounded-radius-md border border-gray-200 p-3">
          {/* URL + 메타데이터 불러오기 + 삭제 */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 block">
              <span className="mb-0.5 block text-caption text-gray-600">URL</span>
              <Input
                placeholder="https://…"
                value={m.url ?? ''}
                onChange={(e) => patch(i, { url: e.target.value })}
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={loadingIndex === i}
              onClick={() => fetchMeta(i)}
            >
              {loadingIndex === i ? '불러오는 중…' : '메타데이터 불러오기'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMedia(media.filter((_, idx) => idx !== i))}>
              삭제
            </Button>
          </div>

          {/* 분류 + 제목 */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-40 block">
              <span className="mb-0.5 block text-caption text-gray-600">분류</span>
              <Select value={m.kind ?? ''} onChange={(e) => patch(i, { kind: e.target.value })}>
                {MEDIA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </label>
            <label className="min-w-56 flex-1 block">
              <span className="mb-0.5 block text-caption text-gray-600">제목</span>
              <Input value={m.title ?? ''} onChange={(e) => patch(i, { title: e.target.value })} />
            </label>
          </div>

          {/* 설명 */}
          <label className="block">
            <span className="mb-0.5 block text-caption text-gray-600">설명</span>
            <TextArea
              rows={2}
              value={m.description ?? ''}
              onChange={(e) => patch(i, { description: e.target.value })}
            />
          </label>

          {/* 썸네일 미리보기 */}
          {m.image && (
            <div className="flex items-center gap-2">
              <img src={m.image} alt="" className="h-12 w-20 rounded-radius-sm bg-gray-100 object-cover" />
              <span className="truncate text-caption text-gray-600">{m.siteName}</span>
            </div>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => setMedia([...media, { url: '', kind: MEDIA_KINDS[0] }])}
      >
        미디어 추가
      </Button>
    </div>
  )
}
