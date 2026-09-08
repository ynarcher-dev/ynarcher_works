import { Button, Modal, Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program } from '@/features/program/hooks'
import { GuestAccountsPanel } from '@/features/program/detail/GuestAccountsPanel'
import { ProgramAnnouncementsPanel } from '@/features/program/detail/ProgramAnnouncementsPanel'
import { ProgramIntroPanel } from '@/features/program/detail/ProgramIntroPanel'
import { ProgramQnaPanel } from '@/features/program/detail/ProgramQnaPanel'
import type { MasterTable } from '@/features/program/participantPersona'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 버튼이 부르는 이름. 밖에서 부르는 이름이 `와이앤아처 GUEST`로 되돌아왔다(2026-09-09). */
export const GUEST_SETTINGS_LABEL = '와이앤아처 GUEST 설정'

type GuestTab = 'intro' | 'announcements' | 'qna' | 'accounts'

/**
 * 사업 정보 카드와 워크플로우 사이에 서는 `와이앤아처 GUEST 설정` 버튼 — 누르면 이 사업이
 * 밖으로 내보내는 것 전부가 한 모달에 선다(개요 · 공지사항 · Q&A · 계정생성).
 *
 * **넷을 한자리에 모은 이유**(2026-09-09 사용자 지정)는 성격이 같아서다 — 넷 다 *내부 운영*이
 * 아니라 **게스트가 보게 될 것**을 정하는 일이다. 종전에는 셋이 상세의 탭 줄에 서고 계정만
 * 버튼이었는데, 그 탭 줄이 답하는 물음은 '이 사업에서 무엇을 하는가'(워크플로우)라 성격이
 * 다른 셋이 같은 층에 끼어 있었다. 넷을 모으면 탭 줄에는 워크플로우 하나만 남아 그 줄이
 * 무엇을 세우는 자리인지 스스로 답하고, 게스트에게 나가는 것들은 '설정'이라는 한 동사 아래
 * 모인다 — **밖에 무엇이 나가 있는지 확인하려는 사람이 한 곳만 열면 된다.**
 *
 * **첫 탭 이름은 워크스페이스가 답한다**(AC는 사업개요, M&A는 프로젝트개요) — 같은 화면을
 * 부르는 말이 사이드바·목록과 어긋나면 둘이 다른 것인지 되묻게 된다.
 *
 * **계정생성 탭은 자격이 있을 때만 선다.** 나머지 셋은 세 워크스페이스가 모두 운용하므로
 * 버튼 자체는 언제나 서고, 자격이 없는 워크스페이스에서 탭 하나가 빠질 뿐이다 — 눌러도 빈
 * 화면이 뜨는 탭을 두지 않는다.
 *
 * **폭이 꽉 찬 이유**는 아래 `+ 워크플로우 추가`와 같은 규격이기 때문이다 — 한 줄을 통째로
 * 차지하는 버튼은 이 앱에서 이미 '이 자리에서 새로 여는 일'을 뜻한다. 오른쪽 끝에 작게
 * 두면 정보 카드의 액션인지 탭 줄의 것인지 자리가 답하지 못한다.
 */
export function GuestSettingsButton({
  program,
  personas,
}: {
  program: Program
  /** 이 워크스페이스가 쓰는 자격. 창구의 하위 탭과 **같은 한 벌**이다. */
  personas: readonly MasterTable[]
}) {
  const config = useProgramWorkspace()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<GuestTab>('intro')

  const items = [
    { key: 'intro' as const, label: `${config.entityNoun}개요` },
    { key: 'announcements' as const, label: '공지사항' },
    { key: 'qna' as const, label: 'Q&A' },
    ...(personas.length > 0 ? [{ key: 'accounts' as const, label: '계정생성' }] : []),
  ]

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {GUEST_SETTINGS_LABEL}
      </Button>

      {/*
        모달이 넓은 이유는 안에 든 것이 표여서다 — 명부는 검색·선택·페이징·일괄 처리가 함께
        살고, 개요·공지는 리치텍스트다. 좁히면 줄어드는 것이 여백이 아니라 한 번에 보이는 칸 수다.

        바깥 클릭으로 닫지 않는다: 행을 골라 두거나 글을 쓰다가 실수로 닫으면 그것이 통째로
        사라진다.
      */}
      <Modal
        dismissible={false}
        open={open}
        onClose={() => setOpen(false)}
        title={GUEST_SETTINGS_LABEL}
        size="3xl"
        /* 안에 서는 것이 전부 카드다(개요·첨부·공지·Q&A·명부). 흰 바닥 위의 흰 상자는 테두리
           한 줄로만 구획되어, 카드가 둘만 넘어가도 어디까지가 한 묶음인지 눈이 따라가지 못한다. */
        sectioned
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </div>
        }
      >
        <Tabs items={items} value={tab} onChange={(key) => setTab(key as GuestTab)} />
        {tab === 'intro' && <ProgramIntroPanel programId={program.id} />}
        {tab === 'announcements' && <ProgramAnnouncementsPanel programId={program.id} />}
        {tab === 'qna' && <ProgramQnaPanel programId={program.id} />}
        {tab === 'accounts' && <GuestAccountsPanel program={program} personas={personas} />}
      </Modal>
    </>
  )
}
