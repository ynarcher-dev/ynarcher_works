/**
 * 브라우저 안에서 도는 검사식.
 *
 * (이 문자열 안에서는 백틱을 쓰지 않는다 — 바깥 템플릿 리터럴을 그 자리에서 닫아 버린다.)
 * 전부 **문자열로 넘겨 `page.evaluate` 안에서 실행**한다 — 이 폴더는 번들 대상이 아니라
 * Node와 브라우저가 같은 모듈 그래프를 공유하지 않기 때문이다. 각 검사는 `{ ok, detail }` 을
 * 돌려주고, 러너가 그것을 이름과 함께 JSON에 적는다.
 *
 * 재는 것은 **보이는 결과**다. "클래스가 붙어 있다"가 아니라 "상자 밖으로 나갔다 / 스크롤로
 * 닿을 수 있다"로 판정한다 — 클래스는 붙어 있어도 부모가 잘라 버리면 사람은 못 읽는다.
 */

/** 부동소수 반올림과 서브픽셀 때문에 1px은 넘침으로 세지 않는다. */
const EPS = 1

export const IN_PAGE = `
const EPS = ${EPS};

/*
  overflow는 **아무 조상에게나 먹지 않는다.** position:absolute 인 요소는 '위치를 가진'
  조상(= 포함 블록)만이 자를 수 있고, static 조상의 overflow:hidden은 그 요소를 통과시킨다.
  position:fixed 는 뷰포트 말고는 아무것도 자르지 못한다. 이 규칙을 빼먹으면 스크롤 상자를
  빠져나와 페이지를 미는 요소(sr-only 캡션 같은 것)를 "잘렸으니 괜찮다"고 잘못 봐준다.
*/
function isContainingBlockFor(node, position) {
  if (position !== 'absolute') return true;
  const cs = getComputedStyle(node);
  return (
    cs.position !== 'static' ||
    cs.transform !== 'none' ||
    cs.filter !== 'none' ||
    cs.perspective !== 'none' ||
    cs.contain.includes('paint') ||
    cs.willChange.includes('transform')
  );
}

function overflowAncestor(el, kinds) {
  if (!el) return null;
  const position = getComputedStyle(el).position;
  if (position === 'fixed') return null;
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    if (isContainingBlockFor(node, position)) {
      const ox = getComputedStyle(node).overflowX;
      if (kinds.includes(ox)) return node;
      // 스크롤 상자를 만나면 그 위쪽의 잘림은 이 요소 이야기가 아니다(스크롤로 닿는다).
      if (ox !== 'visible') return null;
    }
    node = node.parentElement;
  }
  return null;
}

/** 가로로 스크롤되는 가장 가까운 조상 — 넘침에 손이 닿는 자리. */
function scrollParent(el) {
  return overflowAncestor(el, ['auto', 'scroll']);
}

/** 가로로 잘라 내는 가장 가까운 조상 — 여기 걸리면 스크롤로도 닿을 수 없다. */
function clippedBy(el) {
  return overflowAncestor(el, ['hidden', 'clip']);
}

// 탐침(probe.mjs)이 같은 판정을 빌려 쓴다 — 두 벌이면 서로 다른 답을 낸다.
window.__clipCheck = { scrollParent, clippedBy };

/**
 * 조작부가 실제로 눌리는가 — **그 자리로 옮겨 간 뒤에** 다시 재서 묻는다.
 *
 * 화면 밖에 있는 줄의 좌표를 뷰포트 안으로 끌어다 맞추면(clamp) 엉뚱한 줄을 찍고 "덮였다"는
 * 거짓 실패가 난다. 가로도 함께 맞춘다(inline: center) — 관리 열은 좁은 화면에서 스크롤
 * 너머에 있다. 옮긴 뒤에는 좌표가 달라지므로 'getBoundingClientRect'를 **다시** 부른다.
 */
function hittable(controls, limit) {
  const max = limit ?? 40;
  const bad = [];
  const restoreY = window.scrollY;
  const scrollers = new Map();
  for (const el of controls.slice(0, max)) {
    const box = scrollParent(el);
    if (box && !scrollers.has(box)) scrollers.set(box, box.scrollLeft);

    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) {
      bad.push({ el: describe(el), reason: '크기 0', rect: r.toJSON() });
      continue;
    }
    const clipper = clippedBy(el);
    if (clipper) {
      const c = clipper.getBoundingClientRect();
      if (r.right > c.right + EPS || r.left < c.left - EPS) {
        bad.push({ el: describe(el), reason: '잘림', clipper: describe(clipper) });
        continue;
      }
    }
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
      // 스크롤해도 화면 안으로 들어오지 않는다면 그 자체가 문제다(잡아 두고 넘어가지 않는다).
      bad.push({ el: describe(el), reason: '스크롤해도 화면 밖', rect: r.toJSON() });
      continue;
    }
    /*
      실제로 그 자리를 눌렀을 때 **이 조작부(또는 그 안쪽)** 가 잡히는가.

      조상이 잡히는 것은 통과가 아니다 — 클릭은 조상에게 가고 이 조작부는 눌리지 않는다
      ('pointer-events:none', 덮개, 0 크기 자식이 전부 그 모양으로 나타난다). 다만 가운데
      한 점만 보면 배지·아이콘이 가운데에 겹친 버튼을 거짓으로 떨어뜨리므로, 가운데가 막히면
      **안쪽 네 점**을 더 눌러 보고 한 곳이라도 이 조작부가 잡히면 눌린다고 본다.
    */
    const inset = 2;
    const points = [
      [x, y],
      [r.left + inset, y],
      [r.right - inset, y],
      [x, r.top + inset],
      [x, r.bottom - inset],
    ];
    let hit = null;
    let reached = false;
    for (const [px, py] of points) {
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
      const at = document.elementFromPoint(px, py);
      if (at === el || el.contains(at)) {
        reached = true;
        break;
      }
      if (!hit) hit = at;
    }
    if (!reached) {
      bad.push({
        el: describe(el),
        reason: hit ? '다른 요소가 덮음' : '누를 수 있는 자리가 없음',
        covered: describe(hit),
      });
    }
  }
  for (const [box, left] of scrollers) box.scrollLeft = left;
  window.scrollTo(0, restoreY);
  return { ok: bad.length === 0, detail: { checked: Math.min(controls.length, max), bad } };
}

/**
 * 창 본문 안에서 **가로로 읽히지 않는 요소**를 골라낸다.
 *
 * 창은 가로 스크롤을 주지 않으므로 본문 폭을 넘어간 글자는 사람이 읽을 길이 없다. 두 가지가
 * 문제다 — 본문의 오른쪽·왼쪽 경계를 넘어간 것('밖으로 나감')과, 제 상자 안에서 자기 글자를
 * 잘라 버린 것('자기 안에서 잘림', 말줄임·overflow:hidden). 반대로 아래 둘은 문제가 아니라
 * 정상이므로 셈에서 뺀다: **자기 가로 스크롤 상자 안에 든 것**(창 안의 표는 그 상자로 닿는다)과
 * 보이지 않는 것('sr-only'·크기 0 — 화면 낭독기용이며 눈으로 읽는 자리가 아니다).
 */
function bodyLeaks(root, limit) {
  const rootRect = root.getBoundingClientRect();
  const bad = [];
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const scroller = scrollParent(el);
    if (scroller && scroller !== root && root.contains(scroller)) continue;
    const outside = r.right > rootRect.right + EPS || r.left < rootRect.left - EPS;
    const scrollsItself = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    // 자기 글자가 잘렸는지는 **글자를 직접 담은 요소**에서만 묻는다(자식 상자의 넘침은 그 자식 이야기다).
    const leaf = el.children.length === 0 && (el.textContent ?? '').trim() !== '';
    const selfClipped = leaf && !scrollsItself && el.scrollWidth > el.clientWidth + EPS;
    if (outside || selfClipped) {
      bad.push({
        el: describe(el),
        text: (el.textContent ?? '').trim().slice(0, 40),
        outside,
        selfClipped,
        right: Math.round(r.right),
        limit: Math.round(rootRect.right),
      });
      if (bad.length >= (limit ?? 5)) break;
    }
  }
  return bad;
}

function describe(el) {
  if (!el) return null;
  return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\\s+/).slice(0, 3).join('.') : '');
}

window.__checks = {
  /** 1. 페이지가 통째로 가로로 밀리면 안 된다. 가로 스크롤은 안쪽 표만 가진다. */
  pageNoHorizontalOverflow() {
    const doc = document.documentElement;
    /*
      범인을 고를 때 **스크롤 상자나 잘라 내는 상자 안에 있는 요소는 빼야 한다** — 그것들은
      오른쪽으로 멀리 나가 있어도 제 상자 안에서 처리되며 페이지를 밀지 않는다. 그것까지 세면
      "가장 오른쪽"은 늘 표 안쪽 입력칸이 되어, 정작 페이지를 민 요소를 가린다.
    */
    const culprits = [...document.querySelectorAll('body *')]
      .filter((el) => !scrollParent(el) && !clippedBy(el))
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter((x) => x.right > doc.clientWidth + EPS)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3)
      .map((x) => ({ el: describe(x.el), right: Math.round(x.right) }));
    return {
      ok: doc.scrollWidth <= doc.clientWidth + EPS,
      detail: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, culprits },
    };
  },

  /** 2. 표가 안쪽에서 넘칠 때, 그 넘침에 스크롤로 닿을 수 있어야 한다. */
  treeScrollReachable() {
    const grid = document.querySelector('[role="treegrid"]');
    if (!grid) return { ok: false, detail: { reason: 'treegrid 없음' } };
    const box = scrollParent(grid);
    const overflowing = box ? box.scrollWidth > box.clientWidth + EPS : grid.scrollWidth > grid.clientWidth + EPS;
    if (!box) {
      return {
        ok: !overflowing,
        detail: { reason: '가로 스크롤 상자 없음', overflowing },
      };
    }
    const before = box.scrollLeft;
    box.scrollLeft = box.scrollWidth;
    const reached = box.scrollLeft;
    box.scrollLeft = before;
    return {
      ok: !overflowing || reached > before,
      detail: {
        container: describe(box),
        scrollWidth: box.scrollWidth,
        clientWidth: box.clientWidth,
        overflowing,
        maxScrollLeft: reached,
      },
    };
  },

  /** 3-a. 긴 이름이 잘리지 않는다 — 말줄임도, 상자 밖 유실도 없어야 한다. */
  longTitleNotClipped() {
    // 이름 칸에는 전용 표식이 없다(부품은 검증 도구를 모른다). 첫 칸 안에서 전체 경로를
    // title 속성으로 물고 있는 span이 이름 칸이며, 그것이 곧 우리가 재려는 그 요소다.
    const titles = [...document.querySelectorAll('[data-row-id] td:first-child span[title]')];
    const target = titles.sort((a, b) => b.textContent.length - a.textContent.length)[0];
    if (!target) return { ok: false, detail: { reason: '문항 이름 칸 없음' } };
    const ellipsis = getComputedStyle(target).textOverflow === 'ellipsis';
    const selfClipped = target.scrollWidth > target.clientWidth + EPS;
    const clipper = clippedBy(target);
    let outside = false;
    if (clipper) {
      const a = target.getBoundingClientRect();
      const b = clipper.getBoundingClientRect();
      outside = a.right > b.right + EPS || a.left < b.left - EPS;
    }
    return {
      ok: !ellipsis && !selfClipped && !outside,
      detail: {
        length: target.textContent.length,
        ellipsis,
        selfClipped,
        clipper: describe(clipper),
        outsideClipper: outside,
        rect: target.getBoundingClientRect().toJSON(),
      },
    };
  },

  /** 3-b. 관리 열의 조작부가 잘리거나 겹치지 않는다 — 누를 수 있어야 조작부다. */
  actionsNotClipped() {
    const controls = [...document.querySelectorAll('[data-testid="row-action"], [data-testid="row-input"]')];
    if (controls.length === 0) return { ok: false, detail: { reason: '관리 열 조작부 없음' } };
    return hittable(controls);
  },

  /**
   * 3-c. 화면에 선 **모든 조작부**가 눌리는가.
   *
   * 실제 화면에는 검증용 표식이 없다(부품은 검사 도구를 모른다). 그래서 역할로 고른다 —
   * 버튼·링크·입력칸·선택칸이 곧 사람이 손을 대는 자리다. 보이지 않는 것(크기 0·'sr-only'
   * 파일 선택칸)은 애초에 누르는 자리가 아니므로 셈에서 뺀다.
   */
  controlsHittable() {
    /*
      창이 열려 있으면 **그 창 안만** 본다. 뒤에 남은 화면의 버튼들은 덮개(overlay) 아래에
      있는 것이 정상이며, 그것을 눌러 보려 하면 "덮였다"는 옳은 동작을 실패로 적게 된다.
      창이 눌리는지는 창 안의 조작부가 답한다.
    */
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => {
        const r = d.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && getComputedStyle(d).visibility !== 'hidden';
      })
      .pop();
    const root = dialog ?? document;
    const all = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="tab"]')];
    const visible = all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    if (visible.length === 0) return { ok: false, detail: { reason: '조작부 없음' } };
    const out = hittable(visible, 60);
    return { ok: out.ok, detail: { scope: dialog ? 'dialog' : 'page', ...out.detail } };
  },

  /**
   * 5. 창(모달)이 화면 안에 들어오고, **바닥까지 손이 닿는가.**
   *
   * 가로는 넘치면 그것으로 끝이다(창은 스크롤을 가로로 주지 않는다). 세로는 다르다 — 본문이
   * 길면 스크롤되는 것이 정상이고, 문제는 스크롤해도 닿지 않는 경우다. 그래서 본문을 끝까지
   * 밀어 보고 실제로 바닥에 닿았는지, 그리고 푸터(닫기·검토 버튼)가 창 안에 있는지를 함께 본다.
   */
  modalFits() {
    const panel = document.querySelector('[role="dialog"]');
    if (!panel) return { ok: false, detail: { reason: '창 없음' } };
    const r = panel.getBoundingClientRect();
    const body = [...panel.children].find((c) => {
      const oy = getComputedStyle(c).overflowY;
      return oy === 'auto' || oy === 'scroll';
    });
    const footer = panel.querySelector('footer');
    const before = body ? body.scrollTop : 0;
    let reachedBottom = true;
    let bodyDetail = null;
    if (body) {
      body.scrollTop = body.scrollHeight;
      const max = body.scrollHeight - body.clientHeight;
      reachedBottom = max <= EPS || body.scrollTop >= max - EPS;
      bodyDetail = { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop };
      body.scrollTop = before;
    }
    const footerInside = footer
      ? footer.getBoundingClientRect().bottom <= innerHeight + EPS
      : true;
    const horizontal = r.left >= -EPS && r.right <= innerWidth + EPS;
    const vertical = r.top >= -EPS && r.bottom <= innerHeight + EPS;
    /*
      본문 내용의 가로 읽힘은 **판정이다**(적어만 두는 진단이 아니다). 창은 가로 스크롤을
      주지 않으니 본문 폭을 넘은 글자는 영영 읽히지 않는다. 본문 자신이 가로로 넘치는 경우도
      같은 실패다 — 그 자리에서 오른쪽 끝 글자는 잘려 있다.
      스크롤 상자 안의 표와 'sr-only' 캡션은 'bodyLeaks'가 정상으로 걸러 낸다.
    */
    const leaks = body ? bodyLeaks(body) : [];
    const bodyHorizontal = body ? body.scrollWidth <= body.clientWidth + EPS : true;
    return {
      ok:
        horizontal &&
        vertical &&
        reachedBottom &&
        footerInside &&
        bodyHorizontal &&
        leaks.length === 0,
      detail: {
        rect: r.toJSON(),
        viewport: { width: innerWidth, height: innerHeight },
        horizontal,
        vertical,
        reachedBottom,
        footerInside,
        bodyHorizontal,
        body: bodyDetail,
        // 긴 파일명·무공백 코멘트가 잘리거나 새면 여기에 그 글자가 남는다.
        leaks,
      },
    };
  },

  /** 창 본문을 끝까지 민다(스크린샷 직전에 부른다 — 판정이 아니라 상태를 만드는 자리다). */
  scrollModalToBottom() {
    const panel = document.querySelector('[role="dialog"]');
    const body = panel
      ? [...panel.children].find((c) => {
          const oy = getComputedStyle(c).overflowY;
          return oy === 'auto' || oy === 'scroll';
        })
      : null;
    if (body) body.scrollTop = body.scrollHeight;
    return { ok: Boolean(body), detail: { scrolled: Boolean(body) } };
  },

  /**
   * 6. 파일 이름이 **한 줄을 통째로 쓰고** 끝까지 읽히는가(좁은 화면의 핵심).
   *
   * 이름 칸을 크기·버튼과 한 가로줄에 늘어놓으면 320px에서 이름이 서너 글자로 눌린다. 그래서
   * 이름은 자기 줄을 갖고, 공백 없는 긴 이름도 말줄임 없이 접혀야 한다. 표식이 없으므로
   * '.pdf'로 끝나는 **잎 요소**를 이름 칸으로 본다.
   */
  fileNameReadable() {
    const leaves = [...document.querySelectorAll('span, p, div')].filter(
      (el) => el.children.length === 0 && /\\.pdf$/.test((el.textContent ?? '').trim()),
    );
    if (leaves.length === 0) return { ok: false, detail: { reason: '파일 이름 칸 없음' } };
    const bad = [];
    for (const el of leaves.slice(0, 20)) {
      const row = el.closest('li') ?? el.parentElement;
      const r = el.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const ratio = rowRect.width > 0 ? r.width / rowRect.width : 0;
      const ellipsis = getComputedStyle(el).textOverflow === 'ellipsis';
      const selfClipped = el.scrollWidth > el.clientWidth + EPS;
      const clipper = clippedBy(el);
      const outside = clipper
        ? r.right > clipper.getBoundingClientRect().right + EPS ||
          r.left < clipper.getBoundingClientRect().left - EPS
        : false;
      // 이름이 제 줄의 3/5에도 못 미치면 옆에 무엇이 함께 선 것이다(그 줄에서 이름이 눌린다).
      if (ellipsis || selfClipped || outside || ratio < 0.6) {
        bad.push({
          text: (el.textContent ?? '').slice(0, 30),
          ratio: Math.round(ratio * 100) / 100,
          ellipsis,
          selfClipped,
          outside,
          width: Math.round(r.width),
          rowWidth: Math.round(rowRect.width),
        });
      }
    }
    return { ok: bad.length === 0, detail: { checked: Math.min(leaves.length, 20), bad } };
  },

  /**
   * 7. 표가 넘칠 때 그 넘침이 **표 안에서** 처리되는가.
   *
   * 'treeScrollReachable'이 문항 트리 하나를 보는 자리라면, 이쪽은 화면에 선 모든 표를 본다
   * (관제 탭에는 표가 셋이다). 넘치는 표는 자기 스크롤 상자를 가져야 하고, 그 상자는 실제로
   * 끝까지 밀려야 한다 — 밀리지 않으면 오른쪽 열은 존재하지만 닿을 수 없는 열이다.
   */
  tableScrollContained() {
    const tables = [...document.querySelectorAll('table')];
    if (tables.length === 0) return { ok: false, detail: { reason: '표 없음' } };
    const rows = [];
    for (const table of tables) {
      const box = scrollParent(table);
      const overflowing = table.scrollWidth > (box ? box.clientWidth : table.clientWidth) + EPS;
      let reachable = true;
      if (box && overflowing) {
        const before = box.scrollLeft;
        box.scrollLeft = box.scrollWidth;
        reachable = box.scrollLeft > before;
        box.scrollLeft = before;
      }
      rows.push({
        caption: (table.querySelector('caption')?.textContent ?? '').trim().slice(0, 24),
        container: describe(box),
        overflowing,
        reachable,
        ok: !overflowing || (Boolean(box) && reachable),
      });
    }
    return { ok: rows.every((r) => r.ok), detail: { tables: rows } };
  },

  /** 4-a. 표의 첫 줄에 탭으로 닿을 수 있어야 한다(로빙 tabindex). */
  rowsFocusable() {
    const rows = [...document.querySelectorAll('[data-row-id]')];
    const tabbable = rows.filter((r) => r.getAttribute('tabindex') === '0');
    return {
      ok: rows.length > 0 && tabbable.length === 1,
      detail: { rows: rows.length, tabbable: tabbable.length },
    };
  },

  /** 4-b. 방향키로 접었을 때 자식 줄이 실제로 사라졌는가(폈을 때 다시 서는가). */
  snapshotRows() {
    const rows = [...document.querySelectorAll('[data-row-id]')];
    const focused = document.activeElement?.closest?.('[data-row-id]');
    return {
      ok: true,
      detail: {
        count: rows.length,
        focusedId: focused?.dataset?.rowId ?? null,
        focusedExpanded: focused?.getAttribute('aria-expanded') ?? null,
        activeTag: document.activeElement?.tagName?.toLowerCase() ?? null,
      },
    };
  },
};
true;
`
