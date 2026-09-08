import {
  DataTable,
  EmptyValue,
  IconButton,
  Input,
  Modal,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { Download, ExternalLink, Eye, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MaterialPreviewModal } from '@/features/networks/MaterialPreview'
import {
  downloadMaterial,
  formatBytes,
  isLinkMaterial,
  materialDisplayName,
  materialPreviewKind,
  openMaterialLink,
  type Material,
} from '@/features/networks/materialHooks'
import { materialLocationLabel } from '@/features/networks/materialRefs'

/** 모달 한 쪽에 세우는 건수. 패널 목록(5건)보다 크게 잡아 훑어보는 자리로 쓴다. */
const PAGE_SIZE = 10

/** 파일명 끝의 확장자(대문자). 없으면 표에서 빈 값으로 둔다. */
function extensionOf(fileName: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(fileName)
  return m?.[1] ? m[1].toUpperCase() : null
}

/**
 * 검색 대상 — 표시명·파일명·주소. 표에 선 이름이 표시명과 파일명 둘 중 하나이므로 둘 다 훑고,
 * 링크는 기억나는 것이 제목이 아니라 주소일 때가 많아 url까지 함께 본다.
 */
function matches(m: Material, keyword: string): boolean {
  const k = keyword.trim().toLowerCase()
  if (!k) return true
  return [m.label, m.file_name, m.url].some((v) => v?.toLowerCase().includes(k))
}

/**
 * 자료 전체보기 모달(공용) — 패널의 자료 목록을 표 한 벌로 펼친다.
 *
 * 패널 목록(`MaterialList`)은 상세 화면을 받치는 곁다리 자리라 한 행이 이름·용량·액션으로
 * 끝나고 한 쪽에 다섯 건만 선다. 자료가 수십 건 쌓인 레코드에서는 그 자리가 목록이 아니라
 * 창(窓)이 되어, 언제 올린 파일인지·어떤 종류인지를 답하지 못한 채 페이저만 넘기게 된다.
 * 그래서 훑어보는 일은 이 모달로 옮긴다 — 검색 한 칸과 표(등록일·형식·용량)와 번호줄 페이저다.
 *
 * 조회·다운로드는 언제나 열려 있고, 삭제는 호출부가 `onDelete`를 줄 때만 노출한다
 * (패널이 조회 모드면 여기서도 지울 수 없다). 업로드는 두지 않는다 — 파일을 놓는 자리는
 * 패널의 드롭존 하나이고, 같은 일을 두 자리에 두면 어느 쪽이 그 레코드의 입구인지 흐려진다.
 *
 * ## 참조 자료와 '위치' 열 (2026-09-08)
 *
 * 다른 대상에서 참조해 온 자료(`refs`)도 **같은 표에 함께** 선다. 패널에서는 소제목으로 갈려
 * 있지만 여기서는 등록일·형식을 견주며 찾는 자리라, 갈라 두면 두 표를 번갈아 보게 된다.
 *
 * 대신 **'위치' 열이 각 행이 어디에 사는지 답한다.** 이 열은 참조가 하나라도 있을 때만 세운다 —
 * 참조가 없는 레코드에서는 모든 행이 같은 값이라, 가르는 것이 없으면서 이름 열의 폭만 가져간다.
 * 참조 행에는 삭제 버튼이 서지 않으며, 왜 없는지는 그 위치 값이 답한다.
 */
export function MaterialBrowseModal({
  title,
  materials,
  refs = [],
  loading = false,
  onDelete,
  deletingId,
  onClose,
}: {
  /** 모달 제목(패널 제목을 그대로 물려받는다). */
  title: string
  materials: Material[]
  /** 다른 대상에서 참조해 온 자료(읽기 전용). 같은 표에 서고 '위치' 열이 출처를 답한다. */
  refs?: Material[]
  loading?: boolean
  /** 미지정 시 삭제 열을 숨긴다(조회 모드). */
  onDelete?: (id: string) => void
  /** 삭제 진행 중인 자료 id(해당 행의 버튼만 비활성화). */
  deletingId?: string
  onClose: () => void
}) {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  // 표 안에서 연 간이 뷰어(모달 위에 겹쳐 뜬다). 목록당 하나만 연다.
  const [preview, setPreview] = useState<Material | null>(null)

  // 자기 자료 다음 참조 — 패널·AI 작성 창과 같은 순서다(화면마다 순서가 다르면 같은 파일을
  // 두 번째로 찾을 때 눈이 자리를 기억하지 못한다).
  const rows = useMemo(() => [...materials, ...refs], [materials, refs])
  // 참조 행은 지울 수 없다. id로 판정하는 이유는 표가 두 목록을 이미 합쳐 들고 있어서다.
  const refIds = useMemo(() => new Set(refs.map((m) => m.id)), [refs])
  const filtered = useMemo(() => rows.filter((m) => matches(m, keyword)), [rows, keyword])

  // 검색어가 바뀌면 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => {
    setPage(0)
  }, [keyword])

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const columns: Column<Material>[] = [
    { key: 'name', header: '이름', type: 'name', render: (m) => materialDisplayName(m) },
    // 위치는 참조가 있을 때만 선다(위 주석). 형식 **앞**에 두는 것은 좁혀 읽는 순서다 —
    // "어디 것인가"가 먼저 정해져야 "무슨 형식인가"가 뜻을 갖는다.
    ...(refs.length > 0
      ? ([
          {
            key: '_location',
            header: '위치',
            type: 'code',
            render: (m: Material) => materialLocationLabel(m.target_type) ?? <EmptyValue />,
          },
        ] as Column<Material>[])
      : []),
    {
      key: 'ext',
      header: '형식',
      type: 'code',
      // 링크에는 확장자가 없다. 빈 칸 대신 '링크'라고 적어 이 행이 무엇인지 표가 답하게 한다.
      render: (m) => (isLinkMaterial(m) ? '링크' : (extensionOf(m.file_name) ?? <EmptyValue />)),
    },
    {
      key: 'size',
      header: '용량',
      type: 'count',
      render: (m) => (isLinkMaterial(m) ? <EmptyValue /> : formatBytes(m.byte_size)),
    },
    {
      key: 'created_at',
      header: '등록일',
      type: 'date',
      render: (m) => m.created_at.slice(0, 10),
    },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (m) => (
        <span className="inline-flex items-center gap-1">
          {materialPreviewKind(m) ? (
            <IconButton
              variant="ghost"
              label={`${materialDisplayName(m)} 미리보기`}
              onClick={() => setPreview(m)}
              icon={<Eye className="size-4" />}
            />
          ) : (
            <span className="size-icon-card shrink-0" aria-hidden />
          )}
          {isLinkMaterial(m) ? (
            <IconButton
              variant="ghost"
              label={`${materialDisplayName(m)} 새 탭에서 열기`}
              onClick={() => openMaterialLink(m)}
              icon={<ExternalLink className="size-4" />}
            />
          ) : (
            <DownloadButton material={m} />
          )}
          {/* 참조 행에는 삭제가 서지 않는다 — 그 자료를 고치는 자리는 원래 사는 화면 하나이고,
              왜 없는지는 같은 줄의 '위치' 값이 답한다. */}
          {onDelete && !refIds.has(m.id) && (
            <IconButton
              variant="ghost"
              danger
              label={`${materialDisplayName(m)} 삭제`}
              disabled={deletingId === m.id}
              onClick={() => onDelete(m.id)}
              icon={<Trash2 className="size-4" />}
            />
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      {/* 읽는 모달이라 바깥을 눌러 가볍게 닫는다(닫아도 잃을 것이 없다). */}
      <Modal open onClose={onClose} title={title} size="2xl">
        <div className="space-y-4">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="파일 이름으로 검색"
            className="max-w-sm"
          />

          {loading ? (
            <div className="py-6">
              <Spinner />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={pageRows}
              rowKey={(m) => m.id}
              standardColumns={false}
              selectable={false}
              // 자동 레이아웃이 기본값이다. 폭을 고정하면 종류를 적지 않은 액션 열이 남는 폭을
              // 통째로 받아, 등록일과 아이콘 사이에 표 절반짜리 빈 구간이 생긴다 — 남는 폭은
              // 이름 열이 받아야 한다(파일명은 잘리면 곤란한 값이라 여유가 가장 쓸모 있는 자리다).
              pagination={{
                page,
                pageSize: PAGE_SIZE,
                total: filtered.length,
                totalAll: materials.length,
                onChange: setPage,
              }}
              emptyText={
                keyword.trim() ? '검색과 일치하는 자료가 없습니다.' : '등록된 자료가 없습니다.'
              }
            />
          )}
        </div>
      </Modal>

      {preview && <MaterialPreviewModal material={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

/** 다운로드 아이콘 버튼 — 진행 중 상태를 행마다 따로 들어야 해서 작은 컴포넌트로 뗀다. */
function DownloadButton({ material }: { material: Material }) {
  const [downloading, setDownloading] = useState(false)
  return (
    <IconButton
      variant="ghost"
      label={`${material.file_name} 다운로드`}
      disabled={downloading}
      onClick={async () => {
        setDownloading(true)
        try {
          await downloadMaterial(material)
        } finally {
          setDownloading(false)
        }
      }}
      icon={<Download className="size-4" />}
    />
  )
}
