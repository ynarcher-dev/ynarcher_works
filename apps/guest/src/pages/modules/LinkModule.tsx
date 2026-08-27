import { Card } from '@ynarcher/ui'
import { ExternalLink } from 'lucide-react'
import { useModuleLinks } from '@/features/moduleHooks'

/**
 * URL첨부 메뉴 — 운영자가 모아 둔 주소를 눌러서 연다.
 *
 * 주소를 글자로 노출하지 않고 라벨 버튼으로만 세운다. 설문 폼처럼 긴 주소가 그대로 놓이면
 * 모바일에서 줄이 깨지고, 무엇을 여는 링크인지는 어차피 라벨이 답한다.
 * 저장 단계에서 http/https만 허용되므로(program_links_url_scheme) 여기서 스킴을 다시 재지 않는다.
 */
export function LinkModule({ moduleId }: { moduleId: string }) {
  const { data } = useModuleLinks(moduleId)
  const links = data ?? []

  return (
    <Card title="링크" count={links.length}>
      <div className="space-y-2">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-between gap-3 rounded-radius-md border border-gray-300 px-3 py-2 transition-colors duration-fast hover:bg-gray-25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
          >
            <span className="min-w-0">
              <span className="block truncate text-body font-medium text-gray-900">
                {link.label}
              </span>
              {link.description && (
                <span className="block truncate text-caption text-gray-600">
                  {link.description}
                </span>
              )}
            </span>
            <ExternalLink aria-hidden className="size-4 shrink-0 text-gray-500" />
          </a>
        ))}
        {links.length === 0 && (
          <p className="py-4 text-center text-caption text-gray-500">
            등록된 링크가 없습니다.
          </p>
        )}
      </div>
    </Card>
  )
}
