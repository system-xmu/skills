/**
 * Tencent Meeting browser fallback for Playwright MCP browser_run_code_unsafe.
 * Load this file with the tool's filename parameter on the intended recording tab.
 * Returns JSON with all ordered turns and explicit DOM completeness evidence.
 * The caller owns tab creation/selection/closure; this script restores scroll only.
 */
async (page) => {
  const NOISE = new Set([
    '逐字稿', '转写', '纪要', 'AI小助手', '章节', '发言人', '话题', '时间轴',
    '内容由 AI 生成，仅供参考', '定位到正在播放位置', '闪记', '已复制',
    '分享', '另存为', '翻译', '播放视频', '正在讲话：', '智能优化版',
    '元宝提供服务，前往元宝体验更多能力', '展开', '收起',
  ]);

  function normalizeTime(value) {
    if (!/^\d+:\d{2}(?::\d{2})?$/.test(value)) throw new Error('Invalid elapsed time');
    const p = value.split(':').map(Number);
    if (p.at(-1) > 59 || (p.length === 3 && p[1] > 59)) throw new Error('Invalid elapsed time');
    const seconds = p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(n => String(n).padStart(2, '0')).join(':');
  }

  const speakerName = value => value.replace(/[：:]\s*$/, '').trim();
  const signature = turn => JSON.stringify([turn.speaker, turn.time, turn.content]);
  const sameTurn = (a, b) => a.id && b.id ? a.id === b.id : signature(a) === signature(b);

  // Parse transcript-container text only. Keep every occurrence and DOM order.
  function parseTranscript(raw) {
    const lines = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
    // Strip the complete feedback widget group, preserving real speech
    // such as a participant saying '还不错'.
    const feedback = ['这篇会议转写效果如何？', '还不错', '待改进'];
    const feedbackStart = lines.findIndex((line, start) =>
      feedback.every((expected, i) => lines[start + i] === expected));
    if (feedbackStart >= 0) lines.splice(feedbackStart, feedback.length);
    const header = i => {
      const inline = lines[i]?.match(/^(.+?)\s+(\d+:\d{2}(?::\d{2})?)(?:\s+(.+))?$/);
      if (inline && !NOISE.has(speakerName(inline[1]))) {
        normalizeTime(inline[2]);
        return { speaker: speakerName(inline[1]), time: inline[2], content: inline[3] || '', next: i + 1 };
      }
      if (i + 1 < lines.length && !NOISE.has(speakerName(lines[i])) && /^\d+:\d{2}(?::\d{2})?$/.test(lines[i + 1])) {
        normalizeTime(lines[i + 1]);
        return { speaker: speakerName(lines[i]), time: lines[i + 1], content: '', next: i + 2 };
      }
      return null;
    };
    const turns = [];
    for (let i = 0; i < lines.length;) {
      const h = header(i);
      if (!h) { i++; continue; }
      const content = h.content ? [h.content] : [];
      let j = h.next;
      while (j < lines.length && !header(j)) {
        if (!NOISE.has(lines[j])) content.push(lines[j]);
        j++;
      }
      if (!content.length) throw new Error('Transcript turn has no content');
      turns.push({ speaker: h.speaker || '未识别', time: normalizeTime(h.time), content: content.join(' ') });
      i = j;
    }
    return turns;
  }

  function parseSnapshot(snapshot) {
    const plain = parseTranscript(snapshot.text || '');
    const identified = (snapshot.blocks || []).flatMap(block => {
      const turns = parseTranscript(block.text);
      return turns.map((turn, i) => ({ ...turn, id: `${block.id}:${i}` }));
    });
    // Do not discard un-ID'd paragraphs when only some rows have DOM IDs.
    if (identified.length === plain.length && identified.every((t, i) => signature(t) === signature(plain[i]))) {
      return identified;
    }
    return plain;
  }

  // Align stable paragraph IDs or verified adjacent text, never a global text set.
  function mergeBatch(previous, batch, moved = false) {
    if (!previous.length) return { turns: [...batch] };
    if (!batch.length) return { turns: previous, error: 'empty_batch' };
    // Virtual-list reflow can temporarily render a shorter, already-covered
    // window. Align stable IDs anywhere in the collected sequence and retain
    // its known tail; require exact order before appending new paragraphs.
    if (previous.every(t => t.id) && batch.every(t => t.id)) {
      if (new Set(batch.map(t => t.id)).size !== batch.length) {
        return { turns: previous, error: 'duplicate_paragraph_ids' };
      }
      const start = previous.findIndex(t => t.id === batch[0].id);
      if (start < 0) return { turns: previous, error: 'unverified_scroll_gap' };
      const overlap = Math.min(previous.length - start, batch.length);
      const seenIds = new Set(previous.map(t => t.id));
      if (!batch.slice(0, overlap).every((t, i) => t.id === previous[start + i].id)
          || batch.slice(overlap).some(t => seenIds.has(t.id))) {
        return { turns: previous, error: 'paragraph_id_order_changed' };
      }
      const turns = [...previous];
      batch.forEach((t, i) => { turns[start + i] = t; });
      return { turns };
    }
    let overlap = Math.min(previous.length, batch.length);
    while (overlap > 0 && !previous.slice(-overlap).every((t, i) => sameTurn(t, batch[i]))) overlap--;
    if (!overlap) return { turns: previous, error: 'unverified_scroll_gap' };
    // One indistinguishable utterance in a moved virtual viewport is ambiguous.
    if (moved && overlap === 1 && !previous.at(-1).id && !batch[0].id
        && (batch.length === 1 || previous.length === 1)) {
      return { turns: previous, error: 'ambiguous_overlap' };
    }
    return { turns: [...previous.slice(0, previous.length - overlap), ...batch] };
  }

  // Each page.evaluate handles one short DOM operation; collection stays in Node.
  async function collectTranscript(adapter, { maxRounds = 90, stableThreshold = 2 } = {}) {
    let turns = [], stable = 0, previous = null, topReached = false;
    const result = (complete, reason, rounds) => ({
      source: 'browser', complete, reason, top_reached: topReached,
      bottom_reached: Boolean(previous?.atBottom), rounds, turns,
    });
    for (let round = 0; round <= maxRounds; round++) {
      let snapshot;
      try { snapshot = await adapter.snapshot(); }
      catch { return result(false, 'page_evaluate_error', round); }
      if (snapshot.error) return result(false, snapshot.error, round);
      if (!Number.isFinite(snapshot.scrollTop) || !Number.isFinite(snapshot.scrollHeight)) {
        return result(false, 'invalid_scroll_metrics', round);
      }
      if (round === 0) {
        topReached = snapshot.atTop === true;
        if (!topReached) return result(false, 'start_not_at_top', round);
      }
      const moved = previous !== null && snapshot.scrollTop !== previous.scrollTop;
      const before = JSON.stringify(turns);
      let batch;
      try { batch = parseSnapshot(snapshot); }
      catch { return result(false, 'invalid_or_partial_turn_markup', round); }
      const merged = mergeBatch(turns, batch, moved);
      if (merged.error) return result(false, merged.error, round);
      turns = merged.turns;
      const unchanged = previous && before === JSON.stringify(turns)
        && snapshot.scrollHeight === previous.scrollHeight
        && snapshot.scrollTop === previous.scrollTop
        && snapshot.text === previous.text;
      stable = snapshot.atBottom && !snapshot.loading && unchanged ? stable + 1 : 0;
      previous = snapshot;
      if (stable >= stableThreshold) {
        if (!turns.length) return result(false, 'no_transcript', round);
        // Never sort away evidence of a skipped/reordered viewport.
        const seconds = t => t.split(':').reduce((n, p) => n * 60 + Number(p), 0);
        if (turns.some((t, i) => i && seconds(t.time) < seconds(turns[i - 1].time))) {
          return result(false, 'nonmonotonic_turns', round);
        }
        return result(true, 'bottom_stable', round);
      }
      if (round === maxRounds) break;
      try { await adapter.advance(); }
      catch { return result(false, 'scroll_or_load_error', round); }
    }
    return result(false, 'scroll_limit', maxRounds);
  }

  // Playwright serializes this function into the authorized recording tab.
  async function browserStep(action) {
    const key = '__codexTencentTranscriptFallback__';
    const visible = el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    if (action === 'cleanup') {
      const state = globalThis[key];
      if (state?.scroller?.isConnected) state.scroller.scrollTop = state.originalScroll;
      delete globalThis[key];
      return true;
    }
    if (action === 'init') {
      // Wait for SPA hydration and prefer the actual button over a wrapper
      // whose identical text may have no click handler.
      let tab;
      for (let retry = 0; retry < 30 && !tab; retry++) {
        for (const selector of ['button, [role="tab"]', '[class*="tab"]', 'span, div']) {
          tab = [...document.querySelectorAll(selector)].find(el =>
            ['逐字稿', '转写'].includes((el.innerText || '').trim()) && visible(el));
          if (tab) break;
        }
        if (!tab) await delay(300);
      }
      if (tab) {
        tab.click();
        await delay(700);
      }
      const selectors = ['.minutes-module-list', '[class*="minutes-module-list"]',
        '[class*="minutes-container"]', '[class*="minutesContent"]',
        '[class*="transcript"]', '[class*="Transcript"]', '[class*="subtitle"]',
        '[class*="Subtitle"]', '[class*="word"]', '[class*="Word"]'];
      let root;
      for (let retry = 0; retry < 10 && !root; retry++) {
        for (const selector of selectors) {
          const candidates = [...document.querySelectorAll(selector)].filter(visible)
            .map(el => ({ el, count: ((el.innerText || '').match(/\b\d+:\d{2}(?::\d{2})?\b/g) || []).length }))
            .filter(item => item.count > 0).sort((a, b) => b.count - a.count);
          if (candidates.length) { root = candidates[0].el; break; }
        }
        if (!root) await delay(500);
      }
      if (!root) return { error: 'transcript_container_not_found' };
      const scrollable = el => el.scrollHeight > el.clientHeight + 3
        && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY);
      let scroller = [root, ...root.querySelectorAll('*')].find(scrollable);
      for (let parent = root.parentElement; !scroller && parent; parent = parent.parentElement) {
        if (scrollable(parent)) scroller = parent;
      }
      scroller ||= document.scrollingElement || root;
      globalThis[key] = { root, scroller, originalScroll: scroller.scrollTop };
      scroller.scrollTop = 0;
      await delay(500);
      return { initialized: true };
    }
    const state = globalThis[key];
    if (!state?.root?.isConnected || !state?.scroller?.isConnected) return { error: 'transcript_container_lost' };
    const { root, scroller } = state;
    if (action === 'advance') {
      // Overlapping viewports are necessary to detect gaps in virtual lists.
      scroller.scrollTop += Math.max(1, Math.floor(scroller.clientHeight * 0.65));
      await delay(500);
      return true;
    }
    const attrs = ['data-paragraph-id', 'data-pid', 'data-transcript-id'];
    const rows = [...root.querySelectorAll(attrs.map(a => `[${a}]`).join(','))];
    const outerRows = rows.filter(el => !rows.some(other => other !== el && other.contains(el)));
    const blocks = outerRows.map(el => {
      const attr = attrs.find(a => el.hasAttribute(a));
      return { id: `${attr}:${el.getAttribute(attr)}`, text: el.innerText || '' };
    });
    if (new Set(blocks.map(b => b.id)).size !== blocks.length) blocks.length = 0;
    const text = root.innerText || '';
    const loading = root.getAttribute('aria-busy') === 'true'
      || [...root.querySelectorAll('[aria-busy="true"], [class*="loading"], [class*="Loading"]')].some(visible)
      || /^(加载中|正在加载|加载失败|网络异常|重试)[。.!！\s]*$/m.test(text);
    return { text, blocks, scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight,
      atTop: scroller.scrollTop <= 2,
      atBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 3, loading };
  }

  let current;
  try { current = new URL(page.url()); }
  catch { return JSON.stringify({ source: 'browser', transport: 'playwright', complete: false, reason: 'invalid_recording_url', turns: [] }); }
  if (current.protocol !== 'https:' || !/(^|\.)meeting\.tencent\.com$/.test(current.hostname)) {
    return JSON.stringify({ source: 'browser', transport: 'playwright', complete: false, reason: 'not_tencent_recording_page', turns: [] });
  }
  const warnings = [];
  let result;
  try {
    // The recording SPA defers transcript rendering in a background tab.
    await page.bringToFront();
    const init = await page.evaluate(browserStep, 'init');
    if (!init?.initialized) {
      result = { source: 'browser', complete: false, reason: init?.error || 'initialization_failed', turns: [] };
    } else {
      result = await collectTranscript({
        snapshot: () => page.evaluate(browserStep, 'snapshot'),
        advance: () => page.evaluate(browserStep, 'advance'),
      });
    }
  } catch {
    result = { source: 'browser', complete: false, reason: 'playwright_or_page_unavailable', turns: [] };
  } finally {
    try { await page.evaluate(browserStep, 'cleanup'); }
    catch { warnings.push('page_cleanup_failed'); }
  }
  result.transport = 'playwright';
  if (warnings.length) result.warnings = warnings;
  return JSON.stringify(result);
}
