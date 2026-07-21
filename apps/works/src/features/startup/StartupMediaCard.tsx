import { Badge, CardShell, cardText } from '@ynarcher/ui'
import { ExternalLink, ImageOff } from 'lucide-react'
import { MEDIA_KINDS, type MediaItem } from '@/features/startup/startupMedia'

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
        <div className="grid h-16 w-24 shrink-0 place-items-center rounded-radius-sm bg-gray-100 text-gray-400">
          <ImageOff className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.kind && (
            <Badge tone="neutral">
              {item.kind}
            </Badge>
          )}
          {/* 출처는 메타, 제목은 식별 값, 설명은 본문 — 크기는 본문 하나, 위계는 색 3단으로. */}
          <span className="truncate text-body text-gray-500">{item.siteName || item.url}</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-body font-medium text-gray-900">
          <span className="truncate">{item.title || item.url}</span>
          <ExternalLink className="size-3.5 shrink-0 text-gray-400 group-hover:text-brand" />
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-body leading-relaxed text-gray-700">
            {item.description}
          </p>
        )}
      </div>
    </a>
  )
}

/**
 * 미디어를 분류(언론기사·영상·기타)별로 묶는다. 저장 순서는 그룹 안에서 유지하고,
 * 분류가 없거나 알 수 없는 항목은 '기타'로 모은다. 노출 순서는 MEDIA_KINDS 고정.
 */
function groupByKind(media: MediaItem[]): { kind: string; items: MediaItem[] }[] {
  const known = new Set<string>(MEDIA_KINDS)
  const buckets = new Map<string, MediaItem[]>()
  for (const item of media) {
    const kind = item.kind && known.has(item.kind) ? item.kind : '기타'
    const arr = buckets.get(kind) ?? []
    arr.push(item)
    buckets.set(kind, arr)
  }
  return MEDIA_KINDS.filter((k) => buckets.has(k)).map((k) => ({ kind: k, items: buckets.get(k)! }))
}

/**
 * 미디어 카드(스타트업 상세, 활동 내역 아래). 읽기 전용.
 * 언론기사·영상 등 URL을 OG 메타데이터(제목·설명·썸네일·출처)와 함께,
 * 분류별 소제목 아래 1열 리스트로 묶어 보여준다(혼재 방지).
 * 편집·URL 첨부는 통합 수정 폼에서 관리한다.
 */
export function StartupMediaCard({ media }: { media: MediaItem[] }) {
  return (
    <CardShell>
      {media.length === 0 ? (
        <p className="text-body text-gray-600">등록된 미디어가 없습니다.</p>
      ) : (
        <div className="space-y-5">
          {groupByKind(media).map(({ kind, items }) => (
            <div key={kind}>
              <div className="mb-2 flex items-center gap-1 border-b border-gray-100 pb-1.5">
                <span className={cardText.subhead}>{kind}</span>
                <span className={cardText.count}>[{items.length}]</span>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <MediaRow key={i} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}
