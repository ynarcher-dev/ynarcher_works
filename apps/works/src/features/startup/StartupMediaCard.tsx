import { Badge } from '@ynarcher/ui'
import { ExternalLink, ImageOff } from 'lucide-react'
import type { MediaItem } from '@/features/startup/startupMedia'

/** 미디어 1건 카드: 썸네일 + 분류·출처 + 제목 + 설명. 클릭 시 원문 새 탭. */
function MediaRow({ item }: { item: MediaItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex gap-3 rounded-radius-md border border-gray-200 bg-white p-3 transition-colors duration-fast hover:border-gray-300 hover:bg-gray-25"
    >
      {item.image ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          className="h-16 w-24 shrink-0 rounded-radius-sm bg-gray-100 object-cover"
        />
      ) : (
        <div className="grid h-16 w-24 shrink-0 place-items-center rounded-radius-sm bg-gray-100 text-gray-300">
          <ImageOff className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.kind && (
            <Badge tone="neutral" size="sm">
              {item.kind}
            </Badge>
          )}
          <span className="truncate text-caption text-gray-400">{item.siteName || item.url}</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-body font-medium text-gray-900">
          <span className="truncate">{item.title || item.url}</span>
          <ExternalLink className="size-3.5 shrink-0 text-gray-300 group-hover:text-brand" />
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-caption leading-relaxed text-gray-500">
            {item.description}
          </p>
        )}
      </div>
    </a>
  )
}

/**
 * 미디어 카드(스타트업 상세, 활동 내역 아래). 읽기 전용.
 * 언론기사·영상 등 URL을 OG 메타데이터(제목·설명·썸네일·출처)와 함께 목록으로 보여준다.
 * 편집·URL 첨부는 통합 수정 폼에서 관리한다.
 */
export function StartupMediaCard({ media }: { media: MediaItem[] }) {
  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      {media.length === 0 ? (
        <p className="text-body text-gray-400">등록된 미디어가 없습니다.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {media.map((item, i) => (
            <MediaRow key={i} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
