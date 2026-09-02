import { CardShell, InfoField, Pagination, cardText, cn } from '@ynarcher/ui'
import { ImageOff } from 'lucide-react'
import type { PortableAsset } from '@/features/office/assets/portableAssetsApi'

interface PortableAssetsGridProps {
  rows: PortableAsset[]
  /** 대표사진 경로 → Signed URL. 목록 전체를 한 번에 서명한 결과를 화면이 내려준다. */
  urlOf: (path: string) => string | undefined
  onOpen: (asset: PortableAsset) => void
  pagination: { page: number; pageSize: number; total: number; totalAll: number; onChange: (page: number) => void }
}

/**
 * 공용 물품 카드 격자 — **조회 전용**이다.
 *
 * 2026-08-26에 표(`PortableAssetsTable`)에서 카드로 바꿨다. 표가 값을 하는 것은 열을 세로로
 * 훑어 행끼리 비교할 때인데, 이 화면에는 그렇게 읽는 열이 하나도 없다 — 시리얼 번호를 행끼리
 * 견주거나 보유 수량을 합산하는 일이 없고, 그래서 시리얼 열은 폭만 차지한 채 대부분 비어 있었다.
 * 반면 이 화면이 답해야 할 절반인 **식별**("이게 그 빔프로젝터가 맞나")은 이름으로는 끝내
 * 답이 나오지 않는다. 그 답을 가진 값이 사진이므로 사진에 가장 눈에 띄는 자리를 준다.
 *
 * 전수 대사(재물조사)처럼 표가 필요한 용도는 이 화면에 없다 — 원장의 편집·대사는 MANAGEMENT
 * `자산 관리`가 소유한다. 그래서 표/카드 보기 토글을 두지 않는다(무엇으로 볼지는 화면이 정한다).
 *
 * 카드에 적는 값은 **품목명·위치·보유 수량 셋뿐**이다(2026-09-02). 목록에서 하는 일은 물건을
 * 골라내는 것 하나이고, 고르는 데 쓰이는 값은 "그 물건인가(이름·사진)", "가지러 어디로
 * 가나(위치)", "몇 개 있나(수량)"다. 품목·관리자는 고른 다음에 필요한 값이라 상세로 내렸다 —
 * 카드마다 줄이 늘면 격자가 촘촘해지는 것이 아니라 훑는 속도가 느려진다.
 *
 * 시리얼 번호는 이 화면 어디에도 적지 않는다(뷰에서도 내려오지 않는다) — 물건을 찾아가는 데
 * 쓰는 값이 아니라 원장을 대사할 때 쓰는 값이고, 그 일은 MANAGEMENT 자산 관리가 한다.
 */
export function PortableAssetsGrid({
  rows,
  urlOf,
  onOpen,
  pagination,
}: PortableAssetsGridProps) {
  const { page, pageSize, total, totalAll, onChange } = pagination

  return (
    <div className="w-full">
      {rows.length === 0 ? (
        <CardShell className="py-10 text-center">
          <p className={cardText.label}>조건에 맞는 물품이 없습니다.</p>
        </CardShell>
      ) : (
        // 열 수를 breakpoint로 못 박지 않고 **카드 폭을 밴드로 묶는다**(auto-fill + 최소 224px).
        //
        // 열 수를 고정하면 카드 폭이 화면 폭을 그대로 따라가, 넓은 화면에서 목록이 아니라 상세
        // 화면처럼 커진다 — 처음의 `xl:4열`이 1920px에서 카드 396px(사진만 297px)이 된 이유다.
        // 끊는 지점을 더 두어도 계단이 생길 뿐이다(1535px에서 276px이던 카드가 1536px에서 195px).
        // 최소 폭만 정하고 열 수를 화면에 맡기면 어느 폭에서도 236~276px 사이에 머문다.
        //
        // 페이지 크기(24)는 4·6열에서 줄이 딱 떨어지고 나머지 열 수에서도 크게 남지 않는 수다.
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          {rows.map((asset) => (
            <li key={asset.id}>
              <AssetCard
                asset={asset}
                url={asset.photoPaths[0] ? urlOf(asset.photoPaths[0]) : undefined}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page + 1}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        onChange={(p) => onChange(p - 1)}
        info={`${total.toLocaleString()} / ${totalAll.toLocaleString()}건`}
      />
    </div>
  )
}

interface AssetCardProps {
  asset: PortableAsset
  /** 대표사진 Signed URL. 사진이 없거나 아직 서명 전이면 없다. */
  url: string | undefined
  onOpen: (asset: PortableAsset) => void
}

/**
 * 물품 한 장. 위는 사진, 아래는 이 물건에 대해 목록에서 알아야 할 것.
 *
 * 카드 전체가 누르는 자리다 — 사진과 이름 중 어느 쪽을 눌러야 열리는지 고민하게 만들 이유가 없다.
 * 셸을 `CardShell`에 맡기는 이유는 클래스 재사용이 아니라 밀도 맥락(card) 전달이다.
 */
function AssetCard({ asset, url, onOpen }: AssetCardProps) {
  return (
    <CardShell className="h-full overflow-hidden p-0 transition-colors hover:border-gray-400">
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <AssetCover url={url} name={asset.name} />

        <div className="space-y-1 p-3">
          <div className="flex items-baseline gap-1.5">
            {/*
              중요 표시 물품은 이름 순을 건너뛰고 맨 앞에 선다. 표에서는 뜻을 잃은 순번 자리를
              핀에 주었지만(pinMark) 카드에는 순번 칸이 없으므로 이름 앞에 붙인다.
            */}
            {asset.isPinned && (
              <span role="img" aria-label="상단 고정" title="상단 고정" className="shrink-0">
                📌
              </span>
            )}
            <h3 className={cn('min-w-0 truncate', cardText.subhead)} title={asset.name}>
              {asset.name}
            </h3>
          </div>

          {/*
            위치가 수량보다 위다 — 목록을 훑는 사람의 다음 행동은 그 물건을 가지러 가는 것이고,
            몇 개인지는 도착해서 세면 되지만 어디인지는 여기서 알아야 움직일 수 있다.
          */}
          <InfoField label="위치" value={asset.location} valueClassName="truncate" />
          <InfoField label="보유" value={`${asset.quantity}개`} />
        </div>
      </button>
    </CardShell>
  )
}

/**
 * 카드 표지 — 대표사진(`photo_paths[0]`) 한 장.
 *
 * **사진은 선택 항목이고, 없어도 틀의 크기는 같다.** 비율을 4:3으로 고정하고 사진을 잘라 맞추며
 * (`object-cover`), 사진이 없는 물품은 같은 크기의 회색 면에 자리표시를 둔다. 틀을 사진에 맞추면
 * 장마다 높이가 달라져 격자의 줄이 어긋나고, 자리표시를 작게 두면 사진 있는 물품과 없는 물품이
 * 서로 다른 격자에 놓인 것처럼 읽힌다.
 */
function AssetCover({ url, name }: { url: string | undefined; name: string }) {
  return (
    <div className="aspect-[4/3] w-full overflow-hidden border-b border-gray-200 bg-gray-50">
      {url ? (
        <img src={url} alt={name} className="size-full object-cover object-center" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-gray-400">
          <ImageOff className="size-6" />
          <span className="text-caption">사진 없음</span>
        </div>
      )}
    </div>
  )
}
