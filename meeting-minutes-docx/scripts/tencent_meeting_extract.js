/**
 * Tencent Meeting transcript extraction script for Playwright MCP browser_run_code.
 *
 * Usage: Read this file, replace __TARGET_SPEAKER__ and __ANCHOR_TIME__ with actual
 * values, then pass the result to browser_run_code's `code` parameter.
 *
 * Returns compact JSON:
 *   { selected_occurrence, time_range, turns }      on success
 *   { error: "speaker_not_found" | "anchor_too_far" | "no_transcript", detail }  on failure
 */
async (page) => {
  // ── Parameters (replaced by skill before execution) ──────────────────────
  const TARGET_SPEAKER = '__TARGET_SPEAKER__';
  const ANCHOR_TIME = '__ANCHOR_TIME__'; // null string means no anchor
  const LOOKAHEAD = 5;

  const anchorTime = ANCHOR_TIME === 'null' || ANCHOR_TIME === '__ANCHOR_TIME__'
    ? null
    : ANCHOR_TIME;

  // ── Constants ────────────────────────────────────────────────────────────
  const UI_NOISE = new Set([
    '转写', '纪要', 'AI小助手', '章节', '发言人', '话题',
    '内容由 AI 生成，仅供参考', '定位到正在播放位置', '闪记', '已复制',
    '分享', '另存为', '翻译', '播放视频', '正在讲话：',
    '智能优化版', '元宝提供服务，前往元宝体验更多能力',
    '展开', '收起',
  ]);
  const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
  const SCROLL_STEP = 1500;
  const SCROLL_DELAY = 500;
  const MAX_SCROLL_ROUNDS = 60;
  const STABLE_THRESHOLD = 2; // stop after N rounds with no new turns

  // ── Helpers ──────────────────────────────────────────────────────────────
  const isTime = (s) => TIME_RE.test(s);
  const toSeconds = (s) => {
    const p = s.split(':').map(Number);
    return p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
  };
  const dedupeKey = (t) => `${t.speaker}\t${t.time}\t${t.content}`;

  // ── Step 1: Ensure 转写 tab is active ────────────────────────────────────
  try {
    const transcribeTab = page.locator('text=转写').first();
    if (await transcribeTab.isVisible({ timeout: 3000 })) {
      await transcribeTab.click();
      await page.waitForTimeout(1000);
    }
  } catch {
    // Tab may already be active or not found; continue
  }

  // ── Step 2: Locate transcript container ──────────────────────────────────
  const containerSelector = '.minutes-module-list';
  const hasContainer = await page.evaluate((sel) => !!document.querySelector(sel), containerSelector);

  // ── Step 3: Scroll loop with deduplication ───────────────────────────────
  const seenKeys = new Set();
  const allTurns = [];
  let stableCount = 0;

  /**
   * Parse turns from container innerText.
   * Returns newly discovered turns (not yet in seenKeys).
   */
  const extractNewTurns = async () => {
    const raw = await page.evaluate(({ sel, noiseList }) => {
      const el = document.querySelector(sel) || document.body;
      return el.innerText || '';
    }, { sel: containerSelector, noiseList: [...UI_NOISE] });

    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const parsed = [];

    for (let i = 0; i < lines.length - 2; i++) {
      const speaker = lines[i];
      const time = lines[i + 1];
      if (!isTime(time) || UI_NOISE.has(speaker)) continue;

      const content = [];
      let j = i + 2;
      while (j < lines.length) {
        if (j + 1 < lines.length && isTime(lines[j + 1]) && !UI_NOISE.has(lines[j])) break;
        if (!UI_NOISE.has(lines[j])) content.push(lines[j]);
        j++;
      }
      if (content.length) {
        parsed.push({ speaker, time, content: content.join(' ') });
      }
      i = j - 1;
    }

    const newTurns = [];
    for (const turn of parsed) {
      const key = dedupeKey(turn);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        newTurns.push(turn);
      }
    }
    return newTurns;
  };

  // Initial extraction before scrolling
  const initial = await extractNewTurns();
  allTurns.push(...initial);

  if (hasContainer) {
    for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
      // Scroll down
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollTop += 1500;
      }, containerSelector);
      await page.waitForTimeout(SCROLL_DELAY);

      const newBatch = await extractNewTurns();
      if (newBatch.length === 0) {
        stableCount++;
        if (stableCount >= STABLE_THRESHOLD) break;
      } else {
        stableCount = 0;
        allTurns.push(...newBatch);
      }

      // Check if scrolled to bottom
      const atBottom = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return true;
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
      }, containerSelector);
      if (atBottom && stableCount >= 1) break;
    }
  }

  // Sort all turns by timestamp
  allTurns.sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

  // ── Step 4: Validate extraction ──────────────────────────────────────────
  if (allTurns.length === 0) {
    return JSON.stringify({ error: 'no_transcript', detail: 'No transcript turns found on this page.' });
  }

  // ── Step 5: Find target speaker occurrences ──────────────────────────────
  const matches = allTurns
    .map((turn, index) => ({ ...turn, index }))
    .filter((t) => t.speaker === TARGET_SPEAKER);

  if (matches.length === 0) {
    const speakers = [...new Set(allTurns.map((t) => t.speaker))];
    return JSON.stringify({
      error: 'speaker_not_found',
      detail: `Speaker "${TARGET_SPEAKER}" not found. Available speakers: ${speakers.join(', ')}`,
    });
  }

  // ── Step 6: Select occurrence by anchor time ─────────────────────────────
  let chosen;
  if (matches.length === 1 || !anchorTime) {
    chosen = matches[0];
  } else {
    const anchorSec = toSeconds(anchorTime);
    chosen = matches.reduce((best, item) => {
      const diff = Math.abs(toSeconds(item.time) - anchorSec);
      const bestDiff = Math.abs(toSeconds(best.time) - anchorSec);
      return diff < bestDiff ? item : best;
    });
    // Verify anchor proximity (5-minute threshold)
    if (Math.abs(toSeconds(chosen.time) - anchorSec) > 300) {
      return JSON.stringify({
        error: 'anchor_too_far',
        detail: `Nearest occurrence at ${chosen.time} is >5min from anchor ${anchorTime}. Matches: ${matches.map((m) => m.time).join(', ')}`,
      });
    }
  }

  // ── Step 7: Extract discussion window ────────────────────────────────────
  const windowStart = chosen.index;
  let windowEnd = allTurns.length;

  for (let i = windowStart + 1; i < allTurns.length; i++) {
    // Check if target speaker has stopped and 5-turn lookahead has no return
    const lookStart = i;
    const lookEnd = Math.min(i + LOOKAHEAD, allTurns.length);
    const hasReturn = allTurns.slice(lookStart, lookEnd).some((t) => t.speaker === TARGET_SPEAKER);

    if (!hasReturn) {
      // Check for semantic boundary signals
      const current = allTurns[i];
      const prev = allTurns[i - 1];
      if (prev && current) {
        const timeDiff = toSeconds(current.time) - toSeconds(prev.time);
        // Large time jump (>3 min) or topic shift signals end
        if (timeDiff > 180) {
          windowEnd = i;
          break;
        }
      }
      // No return in lookahead → end window here
      windowEnd = i;
      break;
    }
  }

  const turns = allTurns.slice(windowStart, windowEnd);
  const timeRange = {
    start: turns[0]?.time || chosen.time,
    end: turns[turns.length - 1]?.time || chosen.time,
  };

  return JSON.stringify({
    selected_occurrence: { speaker: chosen.speaker, time: chosen.time },
    time_range: timeRange,
    turns: turns.map(({ speaker, time, content }) => ({ speaker, time, content })),
  });
}
