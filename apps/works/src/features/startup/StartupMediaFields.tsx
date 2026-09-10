import { Input, Select, useToast } from '@ynarcher/ui'
import { useCallback } from 'react'
import { ItemRows, patchAt, removeAt, type ItemCol } from '@/components/ItemRows'
import { MEDIA_KINDS, useAutoLinkMetadata, type MediaItem } from '@/features/startup/startupMedia'

interface Props {
  media: MediaItem[]
  setMedia: (m: MediaItem[]) => void
}

/** 한 줄에 서는 칸들. 폭은 화면이 아니라 담기는 값의 종류가 정한다. */
const COLS: readonly ItemCol[] = [
  { label: '분류', kind: 'pick' },
  { label: 'URL' },
  { label: '제목' },
  { label: '설명' },
  { label: '출처', kind: 'short' },
]

/**
 * 통합 수정 폼의 '미디어' 입력 섹션.
 *
 * **주소를 넣으면 제목·설명·썸네일·출처가 알아서 따라온다**(2026-09-10 사용자 지정). 줄마다
 * 있던 '메타데이터 불러오기' 버튼을 걷었다 — 그 버튼이 하는 일은 언제나 같고 안 누를 이유도
 * 없어서, 누르지 않은 줄은 정보가 없는 줄이 아니라 담당자가 한 번 더 눌러야 했던 줄이었다.
 * 채우는 규칙은 `useAutoLinkMetadata`가 갖는다(비어 있는 칸만 채운다).
 *
 * **손으로 적는 것은 못 읽어 온 줄뿐이다.** 그래서 그 줄임을 제목 칸의 자리 표시가 말한다 —
 * 실패를 알리는 자리가 토스트뿐이면 잠시 뒤 그 줄은 그냥 '제목이 빈 줄'이 되어, 자동이 아직
 * 안 왔는지 영영 안 오는지 화면이 답하지 못한다. 안내는 제목 칸에만 세운다: 같은 말이 설명
 * 칸에도 서면 한 줄에 같은 문장이 둘 서서 정작 무엇을 적으라는 것인지가 그 반복에 묻힌다.
 *
 * **칸을 잠그지는 않는다.** 자동으로 온 제목은 사이트 이름이 뒤에 붙어 오는 일이 잦아 손으로
 * 다듬을 자리가 남아 있어야 하고, 잠근 칸은 그 다듬기를 막는 대신 아무것도 지키지 못한다
 * (덮어쓰기는 이미 '비어 있는 칸만 채운다'가 막고 있다).
 *
 * 항목 상자를 걷고 목록 한 줄 규격(`ItemRows`)으로 세운다. 상자였을 때 한 항목이 라벨 넷과
 * 삭제 한 줄을 더해 **다섯 줄**을 썼는데, 라벨을 항목마다 다시 적기 때문이었다. 머리글에 한 번만
 * 적으면 항목이 몇이든 열이 세로로 맞아 위아래 줄을 눈으로 견줄 수 있다.
 *
 * 썸네일 자체는 줄에 세우지 않고 출처 칸이 대신한다 — 이 표에서 답해야 할 것은 *무엇이 긁혀
 * 왔는가*이고 그 답은 제목·출처가 이미 한다. 그림 한 장을 열로 두면 줄 높이가 그 열에 끌려간다.
 */
export function StartupMediaFields({ media, setMedia }: Props) {
  const toast = useToast()
  const onError = useCallback(
    (message: string) => toast.show(message, 'danger'),
    [toast],
  )
  const { loadingUrl, failedUrls } = useAutoLinkMetadata(media, setMedia, onError)

  const patch = (i: number, p: Partial<MediaItem>) => setMedia(patchAt(media, i, p))

  return (
    <ItemRows
      cols={COLS}
      rows={media}
      onRemove={(i) => setMedia(removeAt(media, i))}
      onAdd={() => setMedia([...media, { url: '', kind: MEDIA_KINDS[0] }])}
      addLabel="미디어 추가"
    >
      {(m, i) => {
        const url = (m.url ?? '').trim()
        const loading = loadingUrl !== null && url === loadingUrl
        const failed = failedUrls.has(url)
        return (
          <>
            <Select value={m.kind ?? ''} onChange={(e) => patch(i, { kind: e.target.value })}>
              {MEDIA_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Input
              placeholder="https://…"
              value={m.url ?? ''}
              onChange={(e) => patch(i, { url: e.target.value })}
            />
            <Input
              placeholder={
                loading ? '불러오는 중…' : failed ? '자동으로 못 읽었습니다 — 직접 적어 주세요' : ''
              }
              value={m.title ?? ''}
              onChange={(e) => patch(i, { title: e.target.value })}
            />
            <Input
              placeholder={loading ? '불러오는 중…' : ''}
              value={m.description ?? ''}
              onChange={(e) => patch(i, { description: e.target.value })}
            />
            <Input value={m.siteName ?? ''} onChange={(e) => patch(i, { siteName: e.target.value })} />
          </>
        )
      }}
    </ItemRows>
  )
}
