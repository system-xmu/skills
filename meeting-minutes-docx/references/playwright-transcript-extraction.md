# Playwright Transcript Extraction

Use this reference only when transcript input comes from a web page instead of pasted text or a local file.

## Scope

- Support Tencent Meeting transcript result pages first.
- Allow two entry modes:
  - Navigate to `transcript_page_url`.
  - Stay on the current authenticated browser page.
- Do not attempt credential entry.
  - If the page is not authenticated, pause and ask the user to complete login manually, then continue.

## Tested Tencent Meeting Page Pattern

The tested Tencent Meeting recording page exposes these stable cues after successful login:

- Page title: `录制文件`
- Header area with meeting title, meeting date/time, and file counts
- A player region on the left
- A right-side content panel with tabs `转写`, `纪要`, and `AI小助手`
- A transcript area whose rendered text contains repeated speaker turns in this shape:
  - `speaker`
  - `timestamp`
  - `content`
- The transcript container uses CSS class `.minutes-module-list` and employs virtualized rendering (only visible rows exist in DOM).

The same page can also include non-transcript content that must be ignored:

- `章节`, `发言人`, `话题` tabs and their timestamped topic list
- AI-generated topic summary paragraphs
- keyword chips such as technical terms or names
- transient UI text such as `定位到正在播放位置`, `闪记`, and `已复制`

## Recommended Extraction Flow

The extraction uses exactly **two** Playwright MCP calls after navigation:

### Preflight: Temporary Bridge Timeout

If `browser_navigate` fails with an error like `Extension connection timeout` or `Playwright MCP Bridge`, do not switch to non-browser fallback yet. First run `browser_tabs list`; if the current tab is the Playwright MCP extension connection page, the bridge may have just finished handshaking. Retry `browser_navigate` once, then continue with the normal state check if it succeeds.

### Call 1: State Check + Parameter Injection (`browser_evaluate`)

A single lightweight `browser_evaluate` to confirm the page is ready and store
runtime extraction parameters:

```js
() => {
  globalThis.__TENCENT_MEETING_EXTRACT_PARAMS__ = {
    targetSpeaker: '__TARGET_SPEAKER__',
    anchorTime: '__ANCHOR_TIME_OR_NULL__',
  };
  const title = document.title || '';
  const loggedIn = title.includes('录制文件');
  const hasTranscriptTab = [...document.querySelectorAll('[role="tab"], button, span, div')]
    .some((el) => (el.innerText || el.textContent || '').trim() === '转写');
  const hasMinutesList = !!document.querySelector('.minutes-module-list');
  return { loggedIn, hasTranscriptTab, hasMinutesList, title };
}
```

The state check must return only these four fields. Do not return `textSample`,
`document.body.innerText`, `innerHTML`, `outerHTML`, or an accessibility snapshot in
the normal path.

Handle results:
- `loggedIn === false` → stop, ask user to complete login manually in the browser.
- `hasTranscriptTab === false` → stop, page is not a Tencent Meeting transcript page.
- Otherwise → proceed to Call 2.

### Call 2: Full Extraction (`browser_run_code` with `filename`)

Run the static extraction script with `filename`:

1. Pass `scripts/tencent_meeting_extract.js` to `browser_run_code` as the `filename`
   parameter.
2. Prefer `filename` so the extraction logic remains in the bundled script instead of
   being reconstructed inline. Some MCP clients may still display executed code as tool
   metadata; that is acceptable as long as page text, HTML, DOM, and accessibility
   trees are not returned.
3. The script reads `globalThis.__TENCENT_MEETING_EXTRACT_PARAMS__` from the page and
   returns structured transcript JSON only.

The script handles all remaining work internally:
- Switches to `转写` tab if needed.
- Locates the `.minutes-module-list` container.
- Scrolls through the full transcript with deduplication (key: `speaker + time + content`).
- Selects the target speaker occurrence (with optional anchor time proximity check).
- Extracts the discussion window using the 5-turn lookahead rule.
- Returns structured JSON (see Output Shape below).

Do **not** use `browser_snapshot` or `browser_press_key` in the normal extraction path. These are reserved for manual debugging when extraction fails.

If the current Playwright tool set does not expose a `filename` parameter, inline
execution is allowed as a fallback, but never return page text or HTML.

## Row Normalization Rules

The extraction script normalizes each visible transcript turn into:

- `timestamp`
- `speaker`
- `content`

Additional rules that apply during the skill's post-extraction cleanup:

- Preserve page order exactly.
- Join text fragments within the same speaker turn into one content string.
- Trim leading and trailing whitespace.
- Drop blank rows and purely decorative UI text.
- Normalize speaker names by trimming whitespace and trailing punctuation.
- Normalize timestamps to `HH:MM:SS` when possible.
- If a continuation row omits the speaker label but is clearly nested under the same speaker block, inherit the speaker from the previous row in that block only.
- If a row cannot be attributed confidently, keep the content and mark the speaker as `未识别` instead of fabricating attribution.

## Tencent Meeting DOM Heuristics

The extraction script uses these heuristics internally:

- Prefer parsing from the `.minutes-module-list` container `innerText`.
- A valid transcript turn matches: speaker label → timestamp (`36:59` or `1:03:05`) → utterance content.
- UI noise lines are excluded via a built-in set:
  - `转写`, `纪要`, `AI小助手`, `章节`, `发言人`, `话题`
  - `内容由 AI 生成，仅供参考`, `定位到正在播放位置`, `闪记`, `已复制`
  - `分享`, `另存为`, `翻译`, `播放视频`, `正在讲话：`
  - `智能优化版`, `元宝提供服务，前往元宝体验更多能力`, `展开`, `收起`

## Speaker Occurrence Selection

Handled by the extraction script:

- Match `transcript_speaker` against normalized speaker names.
- If there is exactly one match, use it.
- If there are multiple matches, use `transcript_anchor_time` to select the nearest occurrence.
- If no anchor time is provided and there are multiple matches, use the first occurrence.
- If the nearest match is more than 5 minutes away from the anchor, the script returns an `anchor_too_far` error — ask the user to confirm.

## Discussion Window Rules

Handled by the extraction script:

- Start the window at the chosen speaker occurrence.
- Include every subsequent turn, including other speakers' turns.
- Close the window when both conditions are met:
  - The target speaker has not appeared in a 5-turn lookahead.
  - A semantic boundary is detected (large time jump >3 min, topic shift, or new agenda block).
- The window spans multiple speakers — a valid discussion window includes both the target speaker's exposition and Q&A turns from other participants.

## Output Shape

The Playwright call returns a JSON string with one of two shapes:

**Success:**

```json
{
  "selected_occurrence": { "speaker": "张江杰", "time": "01:00:00" },
  "time_range": { "start": "01:00:00", "end": "01:20:34" },
  "turns": [
    { "speaker": "张江杰", "time": "01:00:00", "content": "..." },
    { "speaker": "Kevin Hu (胡克坤)", "time": "01:10:58", "content": "..." }
  ]
}
```

**Error:**

```json
{
  "error": "speaker_not_found | anchor_too_far | no_transcript",
  "detail": "Human-readable explanation"
}
```

After receiving a successful result, render the turns as ordered lines for the cleanup pipeline:

```text
[01:00:00] 张江杰: 内容...
[01:10:58] Kevin Hu (胡克坤): 内容...
```

Keep timestamps and speaker names in the intermediate transcript used for cleanup and Q&A reconstruction. They can be omitted or rewritten later in the final meeting-minutes prose.

## Failure Handling

- If the state check shows the page is not logged in, stop and ask the user to complete login manually in the browser.
- If the state check shows no transcript tab, say that Tencent Meeting is the supported page type and ask for raw transcript text or a file path instead.
- If the extraction script returns `speaker_not_found`, ask the user to verify the displayed speaker name (the error includes available speakers).
- If the extraction script returns `anchor_too_far`, ask the user to confirm or provide a more accurate timestamp anchor.
- If the extraction script returns `no_transcript`, explicitly tell the user that no accurate meeting record could be obtained from the page.
  - Ask the user whether to continue with a PPT-only minutes draft.
  - Continue only after explicit user confirmation.
  - If the user declines, stop the workflow.
- If `browser_run_code` itself fails (e.g., page structure changed), fall back to a single `browser_snapshot` for diagnostic purposes, then ask the user for raw transcript text.
