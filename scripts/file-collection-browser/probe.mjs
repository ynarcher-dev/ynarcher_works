import { createRequire } from 'node:module'
import { importFromApp } from './resolve.mjs'
import { findBrowser, startFixtureServer } from './harness.mjs'
import { IN_PAGE } from './checks.mjs'

/**
 * 한 화면을 열어 **무엇이 페이지를 가로로 밀었는지** 손으로 캐 보는 자리.
 *
 * 판정(`checks.mjs`)과 나누어 둔다 — 판정은 통과·실패만 말하면 되고, 여기서는 "왜"를 찾느라
 * 요소를 통째로 훑는다. 클리핑 판정 자체는 `checks.mjs`의 것을 그대로 빌려 쓴다(두 벌이 되면
 * 탐침이 맞다고 한 것을 판정이 틀렸다고 하는 일이 생긴다).
 *
 * 실행: `node scripts/file-collection-browser/probe.mjs [폭] [쿼리]`
 */
const require = createRequire(import.meta.url)

const width = Number(process.argv[2] ?? 320)
const query = process.argv[3] ?? 'case=tree&scenario=deep&stage=card'

const { chromium } = require('playwright-core')
const { server, base } = await startFixtureServer(await importFromApp('vite'))
const browser = await chromium.launch({ executablePath: findBrowser(), headless: true })

try {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(`${base}/?${query}`, { waitUntil: 'load' })
  await page.locator('[role="treegrid"] [data-row-id]').first().waitFor({ timeout: 15000 })
  await page.evaluate(IN_PAGE)

  const found = await page.evaluate(`(() => {
    const doc = document.documentElement;
    const d = (el) => el && el.tagName.toLowerCase() + '.' + String(el.className || '').split(/\\s+/).slice(0, 4).join('.');
    const over = () => doc.scrollWidth > doc.clientWidth + 1;

    /*
      **끄고 재 보는 이분법.** 넘침의 범인은 좌표만 봐서는 못 고른다 — 절대 위치·표 레이아웃·
      스크롤 상자가 얽히면 "오른쪽으로 나간 요소"와 "페이지를 민 요소"가 다르기 때문이다.
      그래서 실제로 감춰 보고(display:none) 넘침이 사라지는지로 가른다. 사라지면 그 가지 안에
      범인이 있고, 아니면 없다. 한 단씩 좁혀 내려가 마지막에 남는 것이 범인이다.
    */
    function narrow(el, depth) {
      const trail = [];
      let node = el;
      while (depth-- > 0) {
        const kids = [...node.children];
        let next = null;
        for (const kid of kids) {
          const prev = kid.style.display;
          kid.style.display = 'none';
          const gone = !over();
          kid.style.display = prev;
          if (gone) { next = kid; break; }
        }
        if (!next) break;
        trail.push({ el: d(next), pos: getComputedStyle(next).position, right: Math.round(next.getBoundingClientRect().right) });
        node = next;
      }
      return { trail, last: d(node), lastHtml: node.outerHTML.slice(0, 300) };
    }

    const before = { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, bodyScrollWidth: document.body.scrollWidth };
    if (!over()) return { before, verdict: '넘침 없음' };

    /* 범인을 좁힌 뒤에는 **무엇을 바꾸면 사라지는지**를 따로 잰다 — 고칠 자리를 고르기 위해서다. */
    const table = document.querySelector('[role="treegrid"]');
    const scroller = table.parentElement;
    const trials = {};
    const trial = (name, apply, undo) => { apply(); trials[name] = doc.scrollWidth; undo(); };
    trial('표 최소폭 해제', () => (table.style.minWidth = '0'), () => (table.style.minWidth = ''));
    trial('스크롤 상자 overflow:hidden', () => (scroller.style.overflowX = 'hidden'), () => (scroller.style.overflowX = ''));
    trial('thead 감춤', () => (document.querySelector('thead').style.display = 'none'), () => (document.querySelector('thead').style.display = ''));
    trial('caption 감춤', () => (document.querySelector('caption').style.display = 'none'), () => (document.querySelector('caption').style.display = ''));
    trial('표 table-layout:auto', () => (table.style.tableLayout = 'auto'), () => (table.style.tableLayout = ''));
    trial('스크롤 상자 position:relative', () => (scroller.style.position = 'relative'), () => (scroller.style.position = ''));
    trial('스크롤 상자 contain:paint', () => (scroller.style.contain = 'paint'), () => (scroller.style.contain = ''));
    trial('바깥 상자 감춤', () => (scroller.parentElement.style.display = 'none'), () => (scroller.parentElement.style.display = ''));
    /* 스크롤 상자를 빠져나간 절대 위치 요소 — 포함 블록이 없어 초기 포함 블록(=문서)에 걸린 것들. */
    trials.__escapees = [...scroller.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).position === 'absolute')
      .filter((el) => {
        let n = el.parentElement;
        while (n && n !== scroller) {
          const cs = getComputedStyle(n);
          if (cs.position !== 'static' || cs.transform !== 'none' || cs.filter !== 'none') return false;
          n = n.parentElement;
        }
        return true;
      })
      .slice(0, 5)
      .map((el) => d(el) + ' → ' + el.outerHTML.slice(0, 120));
    trials.__thHtml = document.querySelector('th').outerHTML.slice(0, 200);
    trials.__scrollerRect = JSON.stringify(scroller.getBoundingClientRect());
    trials.__htmlRect = JSON.stringify(doc.getBoundingClientRect());

    return { before, trials, ...narrow(document.body, 25) };
  })()`)
  console.log(JSON.stringify(found, null, 1))
} finally {
  await browser.close()
  await server.close()
}
