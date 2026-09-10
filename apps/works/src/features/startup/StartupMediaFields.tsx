import { Button, Input, Select, useToast } from '@ynarcher/ui'
import { useCallback } from 'react'
import { patchAt, removeAt } from '@/components/ItemRows'
import { MEDIA_KINDS, useAutoLinkMetadata, type MediaItem } from '@/features/startup/startupMedia'

interface Props {
  media: MediaItem[]
  setMedia: (m: MediaItem[]) => void
}

/**
 * 통합 수정 폼의 '미디어' 입력 섹션.
 *
 * **주소를 넣으면 제목·설명·썸네일·출처가 알아서 따라온다**(2026-09-10 사용자 지정). 줄마다
 * 있던 '메타데이터 불러오기' 버튼을 걷었다 — 그 버튼이 하는 일은 언제나 같고 안 누를 이유도
 * 없어서, 누르지 않은 줄은 정보가 없는 줄이 아니라 담당자가 한 번 더 눌러야 했던 줄이었다.
 * 채우는 규칙은 `useAutoLinkMetadata`가 갖는다(비어 있는 칸만 채운다).
 *
 * **배치는 두 줄이다**(2026-09-10 사용자 지정): 위는 담당자가 넣는 것(분류·주소), 아래는
 * 그래서 따라온 것(썸네일·제목·설명). 목록 한 줄 규격(`ItemRows`)을 쓰지 않는 이유가 바로
 * 썸네일이다 — 그림 한 장은 글자 한 줄에 담기지 않아 줄 높이를 자기 쪽으로 끌어간다. 항목
 * 상자가 남는 자리는 *한 항목이 한 줄에 담기지 않을 때*뿐이고, 여기가 그 자리다.
 *
 * **라벨 줄을 두지 않는다.** 상자 안에 라벨을 세우면 항목마다 그 말을 다시 적게 되고, 그
 * 반복이 곧 화면에 남는 여백이다. 분류는 값이 스스로 보이고 나머지 셋은 자리 표시가 답한다 —
 * 게다가 이 칸들은 대부분 자동으로 차므로, 담당자가 이름을 읽고 채워 넣는 칸이 아니다.
 *
 * **손으로 적는 것은 못 읽어 온 줄뿐이다.** 그 줄임을 제목 칸의 자리 표시가 말한다 — 실패를
 * 알리는 자리가 토스트뿐이면 잠시 뒤 그 줄은 그냥 '제목이 빈 줄'이 되어, 자동이 아직 안
 * 왔는지 영영 안 오는지 화면이 답하지 못한다.
 *
 * **칸을 잠그지는 않는다.** 자동으로 온 제목은 사이트 이름이 뒤에 붙어 오는 일이 잦아 손으로
 * 다듬을 자리가 남아 있어야 하고, 잠근 칸은 그 다듬기를 막는 대신 아무것도 지키지 못한다
 * (덮어쓰기는 이미 '비어 있는 칸만 채운다'가 막고 있다).
 *
 * 출처(`siteName`)는 칸을 세우지 않고 저장만 한다. 자동으로 오는 값이고 손으로 고칠 일이
 * 없는데, 칸을 세우면 아래 줄에서 제목·설명이 그만큼 좁아진다.
 */
export function StartupMediaFields({ media, setMedia }: Props) {
  const toast = useToast()
  const onError = useCallback((message: string) => toast.show(message, 'danger'), [toast])
  const { loadingUrl, failedUrls } = useAutoLinkMetadata(media, setMedia, onError)

  const patch = (i: number, p: Partial<MediaItem>) => setMedia(patchAt(media, i, p))

  return (
    <div className="space-y-2">
      {media.map((m, i) => {
        const url = (m.url ?? '').trim()
        const loading = loadingUrl !== null && url === loadingUrl
        const failed = failedUrls.has(url)
        return (
          <div key={i} className="space-y-2 rounded-radius-md border border-gray-200 p-3">
            {/* 담당자가 넣는 것 — 분류와 주소. 삭제는 줄 끝이다(목록 규격과 같은 자리). */}
            <div className="flex items-center gap-2">
              {/* 분류 칸의 폭은 아래 줄 썸네일과 같다(`w-28`) — 두 줄의 왼쪽 끝이 한 세로줄로
                  맞아야 위가 '넣는 것', 아래가 '따라온 것'이라는 두 층이 눈에 보인다. */}
              <Select
                className="w-28 shrink-0"
                value={m.kind ?? ''}
                onChange={(e) => patch(i, { kind: e.target.value })}
              >
                {MEDIA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              <Input
                className="min-w-0 flex-1"
                placeholder="https://…"
                value={m.url ?? ''}
                onChange={(e) => patch(i, { url: e.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => setMedia(removeAt(media, i))}
              >
                삭제
              </Button>
            </div>

            {/* 그래서 따라온 것 — 썸네일과 제목·설명. 썸네일 높이는 오른쪽 두 칸이 정한다
                (`items-stretch`): 그림에 고정 높이를 주면 입력 규격이 바뀌는 날 둘이 어긋난다. */}
            <div className="flex items-stretch gap-2">
              <div className="w-28 shrink-0 overflow-hidden rounded-radius-sm border border-gray-200 bg-gray-100">
                {m.image && <img src={m.image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  placeholder={
                    loading
                      ? '불러오는 중…'
                      : failed
                        ? '자동으로 못 읽었습니다 — 제목을 직접 적어 주세요'
                        : '제목'
                  }
                  value={m.title ?? ''}
                  onChange={(e) => patch(i, { title: e.target.value })}
                />
                <Input
                  placeholder={loading ? '불러오는 중…' : '설명'}
                  value={m.description ?? ''}
                  onChange={(e) => patch(i, { description: e.target.value })}
                />
              </div>
            </div>
          </div>
        )
      })}
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
