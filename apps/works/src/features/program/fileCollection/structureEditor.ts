/**
 * 파일받기 구성 편집기의 **상태 기계**.
 *
 * 화면(React)에서 떼어 둔 이유는 하나다 — 여기서 틀리면 사람이 쓰던 것이 사라지거나, 이미
 * 만든 가지가 한 번 더 생긴다. 그 판단들("서버 값을 따라가도 되는가", "지금 저장하면 무엇을
 * 기준으로 삼는가", "실패했을 때 무엇을 남기는가")을 조회·렌더링 없이 그대로 시험할 수 있어야 한다.
 *
 * 세 가지를 구분해 들고 있다.
 *   · `server` — 마지막으로 본 서버 값. 조회가 늦게 와도 여기로만 들어온다.
 *   · `baseline` — 지금 초안이 만들어진 기준. **저장 페이로드의 기준 시각과 삭제 목록이 여기서 나온다.**
 *   · `touched` — 사람이 실제로 손을 댔는가. 화면이 기본 이름을 채워 넣은 것은 손댄 것이 아니다.
 *
 * 손대지 않았으면 서버 값을 조용히 따라가고(처음 조회가 늦게 와도 화면이 빈 표로 굳지 않는다),
 * 손댔으면 **덮어쓰지 않는다**. 머리글만 바뀐 것(제목·안내 저장)은 구성 충돌이 아니므로
 * 기준 시각만 조용히 새로 맞춘다 — 그러지 않으면 자기가 방금 누른 안내 저장 때문에 자기 구성
 * 저장이 충돌로 거절된다.
 */
import type { FileCollectionNodeDto } from '@ynarcher/master-data'
import {
  draftFromNodes,
  isStructureDirty,
  structureChanges,
  structureDeletes,
  structurePayload,
  structureSignature,
  type StructureChanges,
  type StructureDeleteItem,
  type StructureDraft,
  type StructurePayloadItem,
} from '@/features/program/fileCollection/structureDraft'

export interface StructureSnapshot {
  nodes: FileCollectionNodeDto[]
  levels: string[]
  /** 머리 행의 낙관적 잠금 기준값. */
  collectionUpdatedAt: string | null
}

export interface StructureEditorState {
  /** 마지막으로 본 서버 값. 늦게 온 옛 값이어도 여기에는 담는다(되돌리기의 탈출구다). */
  server: StructureSnapshot | null
  /** 마지막으로 본 값이 **저장보다 오래된 것**인가. 오래된 값으로는 기준을 세우지 않는다. */
  serverStale: boolean
  baseline: StructureSnapshot | null
  draft: StructureDraft
  touched: boolean
  /**
   * 저장 직후 반드시 있어야 하는 마디 id들.
   *
   * 저장 전에 떠난 조회가 저장 뒤에 도착하면 방금 만든 줄이 **없는** 트리가 온다. 그것을
   * 그대로 들이면 새 줄이 id 없는 상태로 되살아나고, 다시 저장할 때 같은 가지가 한 번 더 생긴다.
   */
  expectedNodeIds: string[]
}

export type StructureEditorAction =
  /** 조회가 값을 물어왔다(처음이든 갱신이든). */
  | { type: 'server'; snapshot: StructureSnapshot }
  /** 사람이 표를 고쳤다. */
  | { type: 'edit'; draft: StructureDraft }
  /** 서버 값을 다시 불러온다(되돌리기·충돌 해소). */
  | { type: 'reload' }
  /** 저장이 성공했다. 스냅샷은 **RPC가 답한 트리**여야 한다(조회를 기다리지 않는다). */
  | { type: 'saved'; snapshot: StructureSnapshot }

const EMPTY_DRAFT: StructureDraft = { levels: [], rows: [] }

export function initialStructureEditor(): StructureEditorState {
  return {
    server: null,
    serverStale: false,
    baseline: null,
    draft: EMPTY_DRAFT,
    touched: false,
    expectedNodeIds: [],
  }
}

/** 마디만의 지문 — 단계 이름은 빼고 본다(머리글·이름 변경과 트리 변경을 가르기 위해서다). */
function nodeKey(snapshot: StructureSnapshot | null): string {
  return snapshot ? structureSignature(snapshot.nodes, []) : ''
}

function levelsKey(snapshot: StructureSnapshot | null): string {
  return (snapshot?.levels ?? []).join('')
}

/** 구성(트리 + 단계 이름)이 같은가. 머리 행의 시각은 보지 않는다. */
function sameStructure(a: StructureSnapshot | null, b: StructureSnapshot | null): boolean {
  return Boolean(a) && Boolean(b) && nodeKey(a) === nodeKey(b) && levelsKey(a) === levelsKey(b)
}

function adopt(snapshot: StructureSnapshot, expectedNodeIds: string[] = []): StructureEditorState {
  return {
    server: snapshot,
    serverStale: false,
    baseline: snapshot,
    draft: draftFromNodes(snapshot.nodes, snapshot.levels),
    touched: false,
    expectedNodeIds,
  }
}

/** 시각 비교 — 읽을 수 없는 값은 비교하지 않는다(모르면 오래됐다고 단정하지 않는다). */
function olderThan(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const left = Date.parse(a)
  const right = Date.parse(b)
  if (Number.isNaN(left) || Number.isNaN(right)) return false
  return left < right
}

function newerThan(a: string | null, b: string | null): boolean {
  return olderThan(b, a)
}

/**
 * 늦게 도착한 옛 값인가.
 *
 * 둘 중 하나라도 걸리면 옛 값이다 — 머리 행 시각이 기준보다 **뒤로 갔거나**, 저장하며 받은
 * 마디가 그 트리에 **없거나**. 뒤섞인 응답(새 머리 행 + 옛 마디 목록)도 두 번째 조건에 걸린다.
 * 반대로 우리 저장보다 **분명히 나중에** 쓰인 값(머리 행 시각이 더 큰 값)은 옛 값이 아니다 —
 * 남이 우리 줄을 지웠을 수도 있으므로 그 트리를 받아들여야 한다.
 */
export function isStaleSnapshot(
  state: StructureEditorState,
  snapshot: StructureSnapshot,
): boolean {
  if (!state.baseline) return false
  const base = state.baseline.collectionUpdatedAt
  if (olderThan(snapshot.collectionUpdatedAt, base)) return true
  if (newerThan(snapshot.collectionUpdatedAt, base)) return false
  const ids = new Set(snapshot.nodes.map((node) => node.id))
  return state.expectedNodeIds.some((id) => !ids.has(id))
}

export function structureEditorReducer(
  state: StructureEditorState,
  action: StructureEditorAction,
): StructureEditorState {
  switch (action.type) {
    case 'server': {
      // 늦게 온 옛 값은 **기준으로 삼지 않는다**. 다만 마지막으로 본 값으로는 적어 둔다 —
      // 사람이 '서버 내용 불러오기'를 눌렀을 때 갈 곳이 없으면 화면이 막히기 때문이다.
      if (isStaleSnapshot(state, action.snapshot)) {
        return { ...state, server: action.snapshot, serverStale: true }
      }
      // 손대지 않았으면 서버 값이 정본이다 — 처음 조회가 늦게 와도, 그 사이 화면이 빈 표를
      // 세워 두었더라도 여기서 제자리를 찾는다.
      if (!state.touched) return adopt(action.snapshot)
      // 손댄 뒤라면 초안을 지키되, **구성이 그대로이고 머리 행 시각만 달라진 경우**
      // (내가 방금 누른 안내 저장이 대표적이다)에는 기준 시각만 새로 맞춘다.
      if (sameStructure(action.snapshot, state.baseline)) {
        return {
          ...state,
          server: action.snapshot,
          serverStale: false,
          expectedNodeIds: [],
          baseline: { ...state.baseline!, collectionUpdatedAt: action.snapshot.collectionUpdatedAt },
        }
      }
      return { ...state, server: action.snapshot, serverStale: false, expectedNodeIds: [] }
    }
    case 'edit':
      return { ...state, draft: action.draft, touched: true }
    case 'reload':
      return state.server ? adopt(state.server) : state
    case 'saved':
      return adopt(
        action.snapshot,
        action.snapshot.nodes.map((node) => node.id),
      )
    default:
      return state
  }
}

/** 서버 값을 한 번이라도 받았는가 — 그 전에는 편집·저장·공개를 열지 않는다. */
export function isEditorReady(state: StructureEditorState): boolean {
  return state.baseline !== null
}

export function editorChanges(state: StructureEditorState): StructureChanges {
  if (!state.baseline) return { created: 0, updated: 0, deleted: 0, levelsChanged: false }
  return structureChanges(state.baseline.nodes, state.baseline.levels, state.draft)
}

export function isEditorDirty(state: StructureEditorState): boolean {
  return isStructureDirty(editorChanges(state))
}

/**
 * 내가 보고 있는 기준과 서버가 달라졌는가 — 고치던 것이 있을 때만 뜻이 있다.
 * 늦게 온 옛 값은 셈에 넣지 않는다(그것으로 "남이 고쳤다"고 말하면 거짓 경고가 된다).
 */
export function hasServerMoved(state: StructureEditorState): boolean {
  if (!state.baseline || !state.server || state.serverStale) return false
  return !sameStructure(state.server, state.baseline)
}

export interface StructureSavePayload {
  nodes: StructurePayloadItem[]
  deletes: StructureDeleteItem[]
  levelNames: string[]
  /** **기준 시각은 baseline의 것이다** — 지금 서버 값을 실으면 충돌 검사가 통과해 버린다. */
  expectedUpdatedAt: string | null
}

export function editorSavePayload(state: StructureEditorState): StructureSavePayload | null {
  if (!state.baseline) return null
  return {
    nodes: structurePayload(state.draft),
    deletes: structureDeletes(state.baseline.nodes, state.draft),
    levelNames: state.draft.levels,
    expectedUpdatedAt: state.baseline.collectionUpdatedAt,
  }
}
