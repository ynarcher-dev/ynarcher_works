import { Badge, Card, CardShell } from '@ynarcher/ui'
import { ExternalLink, ImageOff } from 'lucide-react'
import { MEDIA_KINDS, type MediaItem } from '@/features/startup/startupMedia'

/**
 * 미디어 1건 카드: 썸네일 + 분류·출처 + 제목 + 설명. 클릭 시 원문 새 탭.
 *
 * 상자의 외곽은 표준 헤어라인(`gray-300`)이다 — 카드·표·입력과 같은 값이라야 한 화면에서
 * 상자의 경계가 하나의 굵기로 읽힌다. 근거: 5_component_spec_rules.md §3.1
 */
function MediaRow({ item }: { item: MediaItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex gap-3 rounded-radius-md border border-gray-300 bg-white p-3 transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25"
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
 * 언론기사·영상 등 URL을 OG 메타데이터(제목·설명·썸네일·출처)와 함께 보여준다.
 * 편집·URL 첨부는 통합 수정 폼에서 관리한다.
 *
 * **분류마다 카드 하나**다. 한 카드 안에 소제목으로 언론기사·영상을 나눠 담았더니 상자는
 * 하나인데 그 안에서 다시 구획이 생겨, 분류가 카드의 층인지 목록의 층인지 읽히지 않았다.
 * '미디어'라는 묶음은 위의 SectionHeading이 이미 답하고 있으므로, 그 아래에서는 분류가
 * 곧 카드다 — 같은 열의 다른 카드들과 같은 간격(부모 space-y-4)으로 선다.
 */
export function StartupMediaCard({ media }: { media: MediaItem[] }) {
  const groups = groupByKind(media)
  if (groups.length === 0) {
    return (
      <CardShell>
        <p className="text-body text-gray-600">등록된 미디어가 없습니다.</p>
      </CardShell>
    )
  }
  return (
    <>
      {groups.map(({ kind, items }) => (
        <Card key={kind} title={kind} count={items.length}>
          <div className="space-y-2">
            {items.map((item, i) => (
              <MediaRow key={i} item={item} />
            ))}
          </div>
        </Card>
      ))}
    </>
  )
}
