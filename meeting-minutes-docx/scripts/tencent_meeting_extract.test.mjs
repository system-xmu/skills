import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Compile the exact standalone function shipped to Playwright MCP, without a
// second implementation or reaching into private parser functions.
const source = await readFile(new URL('./tencent_meeting_extract.js', import.meta.url), 'utf8');
const extract = new Function(`return (${source});`)();
const turn = (n, content = `发言${n}`) => ({ speaker: '教师', time: `00:00:${String(n).padStart(2, '0')}`, content });
const raw = turns => turns.map(t => `${t.speaker}\n${t.time}\n${t.content}`).join('\n');
const snap = (turns, top = 0, height = 100, extra = {}) => ({
  text: raw(turns), scrollTop: top, scrollHeight: height, atTop: top === 0,
  atBottom: top + 100 >= height, loading: false, ...extra,
});
function mockPage(items, { url = 'https://meeting.tencent.com/crm/share?token=a%2Bb', failInit = false,
  failSnapshot = false, failAdvance = false, failCleanup = false } = {}) {
  let i = 0;
  const calls = [];
  const page = {
    url: () => url,
    bringToFront: async () => { calls.push('focus'); },
    evaluate: async (fn, action) => {
      assert.equal(typeof new Function(`return (${fn.toString()});`)(), 'function');
      calls.push(action);
      if (action === 'init') return failInit ? { error: 'transcript_container_not_found' } : { initialized: true };
      if (action === 'snapshot') {
        if (failSnapshot) throw new Error('page disconnected');
        return items[Math.min(i, items.length - 1)];
      }
      if (action === 'advance') {
        if (failAdvance) throw new Error('scroll failed');
        i++;
        return true;
      }
      if (action === 'cleanup') {
        if (failCleanup) throw new Error('cleanup failed');
        return true;
      }
      throw new Error(`Unexpected action ${action}`);
    },
    close: async () => { calls.push('close'); throw new Error('Caller owns the tab'); },
    context: () => { calls.push('context'); throw new Error('Caller owns the tab'); },
    goto: async () => { calls.push('goto'); throw new Error('Caller owns navigation'); },
  };
  return { page, calls };
}
async function run(items, options) {
  const mock = mockPage(items, options);
  const result = JSON.parse(await extract(mock.page));
  assert.equal(result.source, 'browser');
  assert.equal(result.transport, 'playwright');
  assert.equal(mock.calls.some(action => ['close', 'context', 'goto'].includes(action)), false);
  return { result, calls: mock.calls };
}

test('elapsed times normalize minutes/seconds and hours', async () => {
  for (const [input, normalized] of [['36:59', '00:36:59'], ['89:01', '01:29:01'], ['1:02:03', '01:02:03']]) {
    const { result } = await run([snap([], 0, 100, { text: `甲\n${input}\n内容` })]);
    assert.equal(result.complete, true);
    assert.equal(result.turns[0].time, normalized);
  }
});

test('acquisition keeps long discussion, presenter absence, and repeated reports', async () => {
  const turns = [{ speaker: '主讲人', time: '00:36:59', content: '我的第一个汇报' },
    ...Array.from({ length: 9 }, (_, i) => ({ speaker: '教师', time: `00:37:${String(i).padStart(2, '0')}`, content: `讨论${i}` })),
    { speaker: '另一位', time: '00:40:00', content: '下一个汇报' },
    { speaker: '主讲人', time: '00:50:00', content: '第二个汇报' }];
  const { result } = await run([snap([], 0, 100, { text: raw(turns).replace('00:36:59', '36:59') })]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.turns, turns);
});

test('inline headers, multiline content, UI noise, and equal-time duplicates are retained', async () => {
  const text = '逐字稿\n甲 36:59 第一行\n第二行\n乙\n37:00\n同意\n乙\n37:00\n同意\n已复制';
  const { result } = await run([snap([], 0, 100, { text })]);
  assert.equal(result.complete, true);
  assert.equal(result.turns.length, 3);
  assert.equal(result.turns[0].content, '第一行 第二行');
  assert.deepEqual(result.turns[1], result.turns[2]);
});

test('malformed times and trailing empty turns cannot produce complete evidence', async () => {
  for (const text of ['甲\n36:99\n内容', '甲\n00:60:00\n内容', '甲\n36:59']) {
    const { result } = await run([snap([], 0, 100, { text })]);
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'invalid_or_partial_turn_markup');
  }
});

test('paragraph IDs are used only when they cover every parsed turn', async () => {
  const turns = [turn(1), turn(2)];
  const full = await run([snap(turns, 0, 100, { blocks: [{ id: 'p', text: raw(turns) }] })]);
  assert.deepEqual(full.result.turns.map(t => t.id), ['p:0', 'p:1']);
  const partial = await run([snap(turns, 0, 100, { blocks: [{ id: 'p', text: raw([turns[0]]) }] })]);
  assert.deepEqual(partial.result.turns, turns);
});

test('stable-ID overlap preserves distinct identical utterances', async () => {
  const first = snap([turn(1), turn(1)], 0, 200, { blocks: [
    { id: 'p1', text: raw([turn(1)]) }, { id: 'p2', text: raw([turn(1)]) },
  ] });
  const last = snap([turn(1), turn(2)], 100, 200, { blocks: [
    { id: 'p2', text: raw([turn(1)]) }, { id: 'p3', text: raw([turn(2)]) },
  ] });
  const { result } = await run([first, last, last, last]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.turns.map(t => t.id), ['p1:0', 'p2:0', 'p3:0']);
});

test('adjacent overlap never globally collapses repeated text', async () => {
  const a = turn(0), b = turn(1), c = turn(2), d = turn(3);
  const { result } = await run([snap([a, b, b, c], 0, 200), snap([b, c, d], 100, 200)]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.turns, [a, b, b, c, d]);
});

test('ambiguous overlap and scroll gaps return incomplete evidence', async () => {
  const ambiguous = await run([snap([turn(1)], 0, 200), snap([turn(1)], 100, 200)]);
  assert.equal(ambiguous.result.complete, false);
  assert.equal(ambiguous.result.reason, 'ambiguous_overlap');
  const gap = await run([snap([turn(0), turn(1)], 0, 200), snap([turn(4), turn(5)], 100, 200)]);
  assert.equal(gap.result.reason, 'unverified_scroll_gap');
});

test('virtual scrolling requires bottom and two stable observations', async () => {
  const t = Array.from({ length: 5 }, (_, n) => turn(n));
  const { result } = await run([
    snap(t.slice(0, 3), 0, 300), snap(t.slice(1, 4), 100, 300), snap(t.slice(2), 200, 300),
    snap(t.slice(2), 200, 300), snap(t.slice(2), 200, 300),
  ]);
  assert.equal(result.complete, true);
  assert.equal(result.reason, 'bottom_stable');
  assert.equal(result.top_reached, true);
  assert.equal(result.bottom_reached, true);
  assert.equal(result.rounds, 4);
  assert.deepEqual(result.turns, t);
});

test('stalled scrolling and unresolved loading never silently succeed at the cap', async () => {
  for (const snapshot of [snap([turn(1)], 0, 300), snap([turn(1)], 0, 100, { loading: true })]) {
    const { result } = await run([snapshot]);
    assert.equal(result.complete, false);
    assert.equal(result.reason, 'scroll_limit');
    assert.equal(result.rounds, 90);
  }
});

test('lazy content growing at bottom resets stability and is retained', async () => {
  const a = [turn(1), turn(2)], b = [...a, turn(3)];
  const { result } = await run([snap(a), snap(a), snap(b), snap(b), snap(b)]);
  assert.equal(result.complete, true);
  assert.equal(result.rounds, 4);
  assert.deepEqual(result.turns, b);
});

test('lost container, non-top starts, and reordered turns return incomplete', async () => {
  const lost = await run([{ error: 'transcript_container_lost' }]);
  assert.equal(lost.result.reason, 'transcript_container_lost');
  const middle = await run([snap([turn(1)], 20, 100)]);
  assert.equal(middle.result.reason, 'start_not_at_top');
  const reordered = await run([snap([turn(2), turn(1)])]);
  assert.equal(reordered.result.reason, 'nonmonotonic_turns');
  for (const value of [lost, middle, reordered]) assert.equal(value.result.complete, false);
});

test('page and scroll failures restore state without closing caller-owned tabs', async () => {
  for (const [options, reason] of [
    [{ failInit: true }, 'transcript_container_not_found'],
    [{ failSnapshot: true }, 'page_evaluate_error'],
    [{ failAdvance: true }, 'scroll_or_load_error'],
  ]) {
    const { result, calls } = await run([snap([turn(1)], 0, 300)], options);
    assert.equal(result.complete, false);
    assert.equal(result.reason, reason);
    assert.equal(calls[0], 'focus');
    assert.equal(calls[1], 'init');
    assert.equal(calls.at(-1), 'cleanup');
  }
});

test('failed restoration is reported without concealing transcript evidence', async () => {
  const { result } = await run([snap([turn(1)])], { failCleanup: true });
  assert.equal(result.complete, true);
  assert.deepEqual(result.warnings, ['page_cleanup_failed']);
});

test('non-Tencent pages are rejected without reading or changing their DOM', async () => {
  const { result, calls } = await run([], { url: 'https://example.com/' });
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'not_tencent_recording_page');
  assert.deepEqual(calls, []);
});

test('empty transcript cannot be marked complete', async () => {
  const { result } = await run([snap([])]);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'no_transcript');
});

// The real Tencent page appends its feedback widget after the final paragraph.
// It must not contaminate the last utterance or strip paragraph IDs.
test('recording feedback after the last paragraph is excluded from speech', async () => {
  const turns = [turn(1, '拜拜。')];
  const { result } = await run([snap(turns, 0, 100, {
    text: raw(turns) + '\n这篇会议转写效果如何？\n还不错\n待改进\n内容由 AI 生成，仅供参考',
    blocks: [{ id: 'last', text: raw(turns) }],
  })]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.turns, [{ ...turns[0], id: 'last:0' }]);
});

test('stable IDs retain covered tails during virtual-list shrink and backward reflow', async () => {
  const turns = Array.from({ length: 5 }, (_, n) => turn(n));
  const identified = (subset, top) => snap(subset, top, 400, {
    blocks: subset.map(t => ({ id: t.content, text: raw([t]) })),
  });
  const { result } = await run([
    identified(turns.slice(0, 4), 0),
    identified(turns.slice(1, 3), 100),
    identified(turns.slice(0, 2), 0),
    identified(turns.slice(2), 300),
  ]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.turns.map(({ id, ...t }) => t), turns);
});

test('stable ID alignment rejects an actually missing or reordered paragraph', async () => {
  const identified = (ns, top) => snap(ns.map(n => turn(n)), top, 200, {
    blocks: ns.map(n => ({ id: `p${n}`, text: raw([turn(n)]) })),
  });
  for (const ns of [[4, 5], [1, 0], [2, 0]]) {
    const { result } = await run([identified([0, 1, 2], 0), identified(ns, 100)]);
    assert.equal(result.complete, false);
    assert.ok(['unverified_scroll_gap', 'paragraph_id_order_changed'].includes(result.reason));
  }
});

test('feedback button labels spoken by participants remain actual speech', async () => {
  const { result } = await run([snap([turn(1, '还不错'), turn(2, '待改进')])]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.turns.map(t => t.content), ['还不错', '待改进']);
});
