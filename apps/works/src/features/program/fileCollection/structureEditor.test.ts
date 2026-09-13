import { describe, expect, it } from 'vitest'
import type { FileCollectionNodeDto } from '@ynarcher/master-data'
import {
  editorChanges,
  editorSavePayload,
  hasServerMoved,
  initialStructureEditor,
  isEditorDirty,
  isEditorReady,
  isStaleSnapshot,
  structureEditorReducer,
  type StructureEditorAction,
  type StructureEditorState,
  type StructureSnapshot,
} from '@/features/program/fileCollection/structureEditor'
import {
  addSiblingBranch,
  setRowTitle,
} from '@/features/program/fileCollection/structureDraft'

/**
 * 구성 편집기의 상태 기계.
 *
 * 여기서 지키려는 것 넷이다 — (1) 조회가 늦게 와도 화면이 빈 표로 굳지 않는다,
 * (2) 사람이 고친 것은 어떤 갱신도 덮어쓰지 않는다, (3) 저장 기준 시각은 **초안을 만든 그때의
 * 값**이다(지금 서버 값을 실으면 충돌 검사가 통과해 버린다), (4) 저장 성공은 서버가 답한
 * 트리로 기준을 다시 세워, 같은 초안을 다시 저장해도 가지가 두 번 생기지 않는다.
 */

const node = (
  id: string,
  parent: string | null,
  type: 'FOLDER' | 'QUESTION',
  title: string,
  sort = 1,
  updatedAt = '2026-09-13T00:00:01.000Z',
): FileCollectionNodeDto => ({
  id,
  collection_id: 'col',
  parent_id: parent,
  node_type: type,
  title,
  guide: null,
  is_required: false,
  sort_order: sort,
  updated_at: updatedAt,
})

const TREE: FileCollectionNodeDto[] = [
  node('f1', null, 'FOLDER', '재무'),
  node('q1', 'f1', 'QUESTION', '재무제표', 1, '2026-09-13T00:00:02.000Z'),
]

// 머리 행 기준 시각은 실제로 오는 모양(ISO)이어야 한다 — 늦게 온 값 판정이 시각을 읽는다.
const LEVELS = ['대분류', '문항']

const snapshot = (
  nodes: FileCollectionNodeDto[],
  levels: string[],
  collectionUpdatedAt: string | null,
): StructureSnapshot => ({ nodes, levels, collectionUpdatedAt })

const run = (actions: StructureEditorAction[], from = initialStructureEditor()) =>
  actions.reduce(structureEditorReducer, from)

describe('조회가 늦게 오는 동안', () => {
  it('서버 값을 받기 전에는 준비되지 않았다고 말한다', () => {
    const state = initialStructureEditor()
    expect(isEditorReady(state)).toBe(false)
    expect(editorSavePayload(state)).toBeNull()
    expect(isEditorDirty(state)).toBe(false)
  })

  it('늦게 온 트리로 제자리를 찾는다(빈 표로 굳지 않는다)', () => {
    // 처음에는 빈 목록이 오고(로딩 직후), 잠시 뒤 진짜 트리가 온다.
    const state = run([
      { type: 'server', snapshot: snapshot([], [], '2026-09-13T08:00:00.000Z') },
      { type: 'server', snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T09:00:00.000Z') },
    ])
    expect(state.draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1'])
    expect(isEditorDirty(state)).toBe(false)
    expect(hasServerMoved(state)).toBe(false)
  })

  it('저장된 단계 이름이 없는 옛 파일받기를 열어도 고칠 것이 생기지 않는다', () => {
    const state = run([{ type: 'server', snapshot: snapshot(TREE, [], '2026-09-13T09:00:00.000Z') }])
    expect(state.draft.levels).toEqual(['대분류', '문항'])
    expect(editorChanges(state)).toEqual({
      created: 0,
      updated: 0,
      deleted: 0,
      levelsChanged: false,
    })
  })
})

describe('사람이 고친 뒤', () => {
  const edited = () => {
    const loaded = run([{ type: 'server', snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T09:00:00.000Z') }])
    return structureEditorReducer(loaded, {
      type: 'edit',
      draft: setRowTitle(loaded.draft, 1, '재무제표(수정)'),
    })
  }

  it('갱신이 와도 초안을 덮어쓰지 않는다', () => {
    const moved = structureEditorReducer(edited(), {
      type: 'server',
      snapshot: snapshot(
        [TREE[0]!, node('q1', 'f1', 'QUESTION', '남이 고친 이름', 1, '2026-09-13T09:00:00.000Z')],
        ['대분류', '문항'],
        '2026-09-13T10:00:00.000Z',
      ),
    })
    expect(moved.draft.rows[1]!.title).toBe('재무제표(수정)')
    expect(hasServerMoved(moved)).toBe(true)
  })

  it('머리글만 저장된 것은 충돌이 아니다 — 기준 시각만 새로 맞춘다', () => {
    // 내가 방금 누른 '안내 저장'이 머리 행의 updated_at을 올린다. 구성은 그대로다.
    const after = structureEditorReducer(edited(), {
      type: 'server',
      snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T10:00:00.000Z'),
    })
    expect(hasServerMoved(after)).toBe(false)
    expect(after.draft.rows[1]!.title).toBe('재무제표(수정)')
    expect(editorSavePayload(after)?.expectedUpdatedAt).toBe('2026-09-13T10:00:00.000Z')
  })

  it('되돌리기는 마지막으로 본 서버 값으로 돌아간다', () => {
    const back = structureEditorReducer(edited(), { type: 'reload' })
    expect(back.draft.rows[1]!.title).toBe('재무제표')
    expect(back.touched).toBe(false)
    expect(isEditorDirty(back)).toBe(false)
  })
})

describe('저장 페이로드', () => {
  it('기준 시각은 초안을 만든 그때의 값이다(지금 서버 값이 아니다)', () => {
    const edited = structureEditorReducer(
      run([{ type: 'server', snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T09:00:00.000Z') }]),
      { type: 'edit', draft: { levels: ['대분류', '문항'], rows: [] } },
    )
    // 그 뒤 머리 행이 또 바뀌어도(다른 사람의 안내 저장) 페이로드의 기준은 T1 그대로다.
    const later = structureEditorReducer(edited, {
      type: 'server',
      snapshot: snapshot(
        [node('f1', null, 'FOLDER', '재무', 1, '2026-09-13T10:00:00.000Z')],
        ['대분류', '문항'],
        '2026-09-13T12:00:00.000Z',
      ),
    })
    expect(editorSavePayload(later)?.expectedUpdatedAt).toBe('2026-09-13T09:00:00.000Z')
  })

  it('지운 줄만 삭제 목록에 오르고 기준 시각을 함께 싣는다', () => {
    const loaded = run([{ type: 'server', snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T09:00:00.000Z') }])
    const cleared = structureEditorReducer(loaded, {
      type: 'edit',
      draft: { levels: loaded.draft.levels, rows: [] },
    })
    const payload = editorSavePayload(cleared)!
    expect(payload.nodes).toEqual([])
    expect(payload.deletes).toEqual([
      { node_id: 'f1', expected_updated_at: '2026-09-13T00:00:01.000Z' },
      { node_id: 'q1', expected_updated_at: '2026-09-13T00:00:02.000Z' },
    ])
  })
})

describe('저장 뒤', () => {
  /** 새 가지를 하나 세운 초안. 저장 전에는 id가 없다. */
  const withNewBranch = (): StructureEditorState => {
    const loaded = run([{ type: 'server', snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T09:00:00.000Z') }])
    return structureEditorReducer(loaded, {
      type: 'edit',
      draft: addSiblingBranch(loaded.draft, 0),
    })
  }

  const SAVED: FileCollectionNodeDto[] = [
    node('f1', null, 'FOLDER', '재무', 1, '2026-09-13T11:00:00.000Z'),
    node('q1', 'f1', 'QUESTION', '재무제표', 1, '2026-09-13T00:00:02.000Z'),
    node('f2', null, 'FOLDER', '새 분류', 2, '2026-09-13T11:00:00.000Z'),
    node('q2', 'f2', 'QUESTION', '새 문항', 1, '2026-09-13T11:00:00.000Z'),
  ]

  it('서버가 답한 트리로 기준을 다시 세운다(조회를 기다리지 않는다)', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, ['대분류', '문항'], '2026-09-13T10:00:00.000Z'),
    })
    expect(saved.draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1', 'f2', 'q2'])
    expect(isEditorDirty(saved)).toBe(false)
    expect(saved.touched).toBe(false)
  })

  it('저장 직후 다시 저장하면 새 가지를 또 만들지 않는다', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, ['대분류', '문항'], '2026-09-13T10:00:00.000Z'),
    })
    const again = editorSavePayload(saved)!
    expect(again.nodes.every((item) => item.node_id !== null)).toBe(true)
    expect(again.deletes).toEqual([])
    expect(again.expectedUpdatedAt).toBe('2026-09-13T10:00:00.000Z')
  })

  it('저장한 뒤 다시 고쳐 저장하면 새 기준으로 나간다', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, ['대분류', '문항'], '2026-09-13T10:00:00.000Z'),
    })
    const edited = structureEditorReducer(saved, {
      type: 'edit',
      draft: setRowTitle(saved.draft, 3, '고친 문항'),
    })
    const payload = editorSavePayload(edited)!
    expect(editorChanges(edited).updated).toBe(1)
    expect(payload.expectedUpdatedAt).toBe('2026-09-13T10:00:00.000Z')
    expect(payload.nodes.find((item) => item.node_id === 'q2')?.expected_updated_at).toBe(
      '2026-09-13T11:00:00.000Z',
    )
  })

  it('저장에 실패하면(=saved가 오지 않으면) 고치던 것이 그대로 남는다', () => {
    const failing = withNewBranch()
    // 실패는 아무 액션도 만들지 않는다. 그 뒤 조회 갱신이 와도 초안은 지켜져야 한다.
    const after = structureEditorReducer(failing, {
      type: 'server',
      snapshot: snapshot(TREE, ['대분류', '문항'], '2026-09-13T09:00:00.000Z'),
    })
    expect(after.draft.rows).toHaveLength(4)
    expect(editorChanges(after).created).toBe(2)
    expect(editorSavePayload(after)?.expectedUpdatedAt).toBe('2026-09-13T09:00:00.000Z')
  })

  it('늦게 도착한 저장 전 조회 응답이 기준을 되돌리지 않는다', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    // 저장 직전에 떠난 조회가 이제야 도착한다(저장 전 트리 + 옛 머리 행 시각).
    const stale = structureEditorReducer(saved, {
      type: 'server',
      snapshot: snapshot(TREE, LEVELS, '2026-09-13T09:00:00.000Z'),
    })
    expect(isStaleSnapshot(saved, snapshot(TREE, LEVELS, '2026-09-13T09:00:00.000Z'))).toBe(true)
    expect(stale.draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1', 'f2', 'q2'])
    expect(editorSavePayload(stale)?.expectedUpdatedAt).toBe('2026-09-13T10:00:00.000Z')
    expect(editorSavePayload(stale)?.nodes.every((item) => item.node_id !== null)).toBe(true)
    // 늦게 온 값으로 "남이 고쳤다"고 말하지 않는다(거짓 경고를 세우지 않는다).
    expect(hasServerMoved(stale)).toBe(false)
  })

  it('뒤섞인 응답(새 머리 행 + 옛 마디 목록)도 기준을 되돌리지 않는다', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    // 머리 행 조회만 새 값이고 마디 조회는 아직 저장 전 값인 경우.
    const mixed = structureEditorReducer(saved, {
      type: 'server',
      snapshot: snapshot(TREE, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    expect(mixed.draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1', 'f2', 'q2'])
    expect(mixed.serverStale).toBe(true)
  })

  it('반대로 뒤섞인 응답(옛 머리 행 + 새 마디 목록)도 들이지 않는다', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    const mixed = structureEditorReducer(saved, {
      type: 'server',
      snapshot: snapshot(SAVED, ['대분류', '문항', '세분류'], '2026-09-13T09:00:00.000Z'),
    })
    expect(mixed.draft.levels).toEqual(LEVELS)
    expect(mixed.serverStale).toBe(true)
  })

  it('우리 저장보다 나중에 쓰인 값은 들인다(남이 고친 것을 놓치지 않는다)', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    // 남이 우리 문항 하나를 지우고 저장했다 — 머리 행 시각이 우리 것보다 뒤다.
    const after = structureEditorReducer(saved, {
      type: 'server',
      snapshot: snapshot(SAVED.slice(0, 3), LEVELS, '2026-09-13T11:00:00.000Z'),
    })
    expect(after.serverStale).toBe(false)
    expect(after.draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1', 'f2'])
  })

  it('늦게 온 값이어도 되돌리기의 갈 곳은 남는다', () => {
    const saved = structureEditorReducer(withNewBranch(), {
      type: 'saved',
      snapshot: snapshot(SAVED, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    const stale = structureEditorReducer(saved, {
      type: 'server',
      snapshot: snapshot(TREE, LEVELS, '2026-09-13T09:00:00.000Z'),
    })
    expect(stale.server?.nodes).toBe(TREE)
    expect(structureEditorReducer(stale, { type: 'reload' }).draft.rows.map((r) => r.nodeId)).toEqual([
      'f1',
      'q1',
    ])
  })

  it('두 조회가 따로 도착해도(마디 먼저 → 머리 행 나중) 기준이 흔들리지 않는다', () => {
    // 저장 전: 조회 둘이 서로 다른 시점에 끝난다. 손대지 않았으므로 둘 다 들이되,
    // 마지막에 들인 값이 곧 기준이고 초안에 id 없는 줄이 생기지 않아야 한다.
    const first = run([{ type: 'server', snapshot: snapshot(TREE, LEVELS, '2026-09-13T09:00:00.000Z') }])
    const second = structureEditorReducer(first, {
      type: 'server',
      snapshot: snapshot(SAVED, LEVELS, '2026-09-13T10:00:00.000Z'),
    })
    expect(second.draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1', 'f2', 'q2'])
    expect(editorSavePayload(second)?.expectedUpdatedAt).toBe('2026-09-13T10:00:00.000Z')
    expect(isEditorDirty(second)).toBe(false)
  })
})
