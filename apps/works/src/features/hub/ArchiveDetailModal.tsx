import {
  Badge,
  Button,
  DensityProvider,
  InfoField,
  InfoGrid,
  Modal,
  useToast,
} from '@ynarcher/ui'
import { Download } from 'lucide-react'
import { useState } from 'react'
import type { BoardPost } from '@/features/hub/boardData'
import { downloadMaterial, formatBytes, type Material } from '@/features/networks/materialHooks'

interface ArchiveDetailModalProps {
  open: boolean
  post: BoardPost | null
  /** 이 자료의 파일(없을 수 있다 — 메타만 등록되고 업로드가 실패한 경우). */
  material: Material | undefined
  busy: boolean
  onEdit: () => void
  onClose: () => void
}

/**
 * 자료 상세 모달 — 자료실은 상세페이지가 없으므로 이 창이 그 자리를 대신한다.
 *
 * 종전에는 목록의 '관리' 열에 [수정]·[비활성화] 버튼이 서 있었다. 표에서 그것을 걷어낸 이유는
 * 두 가지다. 첫째, 그 두 버튼이 행마다 반복되면서 정작 자료명·설명보다 눈에 먼저 들어왔다.
 * 둘째, 비활성화는 되돌리기 어려운 일인데 목록을 훑는 손이 지나는 자리에 놓여 있었다 —
 * 어느 자료에 대고 하는 일인지 확인하지 않고 누를 수 있는 버튼은 그 자체가 위험하다.
 *
 * 이 창이 갖는 것은 **읽는 일과 되돌릴 수 있는 일**뿐이다(조회·다운로드·수정으로 넘어가기).
 * 비활성화는 여기 두지 않고 수정 화면(`ArchiveEditor`)이 갖는다 — 자료를 내리는 판단은 그
 * 내용을 펼쳐 놓고 하는 일이지, 요약을 훑다가 하는 일이 아니다.
 *
 * 다운로드만은 표에도 남긴다 — 자료실을 여는 사람이 가장 자주 하는 일이고, 되돌릴 것이 없는
 * 조회 행위다.
 */
export function ArchiveDetailModal({
  open,
  post,
  material,
  busy,
  onEdit,
  onClose,
}: ArchiveDetailModalProps) {
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)

  if (!post) return null

  const inactive = Boolean(post.deletedAt)

  const download = () => {
    if (!material) return
    setDownloading(true)
    void downloadMaterial(material)
      .catch(() => toast.show('다운로드에 실패했습니다. 권한을 확인하세요.', 'danger'))
      .finally(() => setDownloading(false))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={post.title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            닫기
          </Button>
          <Button variant="outline" onClick={onEdit} disabled={busy}>
            수정
          </Button>
          <Button onClick={download} disabled={busy || downloading || !material}>
            <Download className="mr-1.5 size-3.5" />
            {downloading ? '내려받는 중…' : '다운로드'}
          </Button>
        </>
      }
    >
      <DensityProvider value="card">
        <div className="space-y-3">
          {inactive && (
            <Badge tone="danger">비활성 자료 — 목록에서 흐리게 표시됩니다</Badge>
          )}

          <InfoGrid columns={2}>
            <InfoField label="자료명" value={post.title} valueClassName="truncate" />
            <InfoField label="파일명" value={material?.file_name ?? null} valueClassName="truncate" />
            <InfoField label="용량" value={formatBytes(material?.byte_size ?? null)} />
            <InfoField label="고정" value={post.pinned ? '최상단 고정' : '고정 안 함'} />
            <InfoField label="생성자" value={post.author} />
            <InfoField label="수정일" value={post.date} />
          </InfoGrid>

          {/*
            설명은 격자 밖에 따로 둔다 — 자료실에서 이 한 줄이 유일한 안내 문구라, 두 칸짜리
            격자에 끼워 넣으면 폭이 절반으로 잘려 정작 가장 읽혀야 할 값이 말줄임표로 끝난다.
          */}
          <InfoField label="설명" value={post.summary ?? null} valueClassName="whitespace-pre-line" />
        </div>
      </DensityProvider>
    </Modal>
  )
}
