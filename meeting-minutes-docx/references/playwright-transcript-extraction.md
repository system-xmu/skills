# Playwright transcript fallback

Use after [tmeet acquisition](tencent-meeting-transcript.md) is unavailable or incomplete. Read the sibling [`web-access`](../../web-access/SKILL.md): this Tencent transcript workflow uses its explicit Playwright MCP exception. Reuse the project's existing browser-extension connection and Chrome login state; do not start a separate browser, CDP Proxy, or Tencent API/authentication implementation.

## Select the recording and own the tab

- `transcript_page_mode=url` (default): retain the full authorized `transcript_page_url`, including query parameters. Use `browser_tabs` to create a task-owned tab, then `browser_navigate` to open the URL. Record the created tab from the tool response so cleanup closes that tab only. Playwright may foreground the tab; background creation is not guaranteed.
- `transcript_page_mode=current-page`: only when explicitly requested. Use `browser_tabs list` to identify the intended Tencent recording by title/URL, then select it if needed. Ask if the intended page remains ambiguous. Do not close, navigate away from, or replace that existing tab. The extraction helper restores its original scroll position where possible; switching to the transcript tab is intentional.
- Without a recording URL or authorized current page, request a share link/export. Do not inspect unrelated pages to infer a URL. Respect login, password, and permission barriers.

Check the selected tab URL after an MCP reconnection: some clients reset selection to the extension welcome page. Re-select the authorized recording before running the helper; `not_tencent_recording_page` is not a Tencent access denial. If selection resets between tools, generate a temporary wrapper by reading the bundled function verbatim, open the supplied URL in a task-owned page, invoke that function with the page, and close it in `finally`, all within one `browser_run_code_unsafe` call. Keep that wrapper under `.playwright-mcp/` (an allowed tool file root), then delete it after the call; do not duplicate or rewrite the extraction logic.

If the Playwright extension/Bridge initially times out, list tabs once to give the connection a chance to complete, then retry the failed operation once. If it still fails, give the actual extension connection remedy and allow an exported transcript. Do not switch to CDP as an additional hidden fallback or repeatedly prompt for CLI login.

## Run the bundled extractor

Run `scripts/tencent_meeting_extract.js` on the selected recording tab with Playwright MCP **`browser_run_code_unsafe`**, passing its absolute path as `filename`. Older clients may name the same tool `browser_run_code`. This file is an `async (page) => {...}` function for the tool, not a standalone Node CLI.

```json
{
  "filename": "/Users/jader/Work/研/.codex/skills/meeting-minutes-docx/scripts/tencent_meeting_extract.js"
}
```

Resolve the installed skill's absolute path in other workspaces. No runtime speaker/anchor globals or CDP target IDs are needed: the extractor returns **all ordered turns** and selection happens afterward. Each `page.evaluate` performs a short DOM operation; the bounded scroll loop runs in Node. A tool timeout is incomplete evidence, not a successful source.

The normal path reads only the transcript container and returns structured JSON. Do not request full-page text/HTML or accessibility snapshots as transcript input. If markup changes or the helper fails, diagnose the relevant container with `browser_evaluate` or a targeted `browser_snapshot`; AI summaries and UI noise cannot substitute for verbatim text.

## Evidence and completeness

The helper foregrounds the selected recording tab (the SPA can defer rendering in a background tab), waits for the transcript button, activates `逐字稿` / `转写`, and prefers `.minutes-module-list`, then known minutes/transcript/subtitle/word-class containers. It retains speaker, normalized recording-relative time, text, and paragraph attributes where available. `36:59` means `00:36:59`. No fixed Q&A cutoff or presenter-only filter is applied.

Scrolling uses overlapping viewports for virtual lists. Align stable-ID batches against the collected order, retaining known tails when a virtual window temporarily shrinks; otherwise require verified adjacent text overlap; repeated identical utterances remain distinct. Missing or ambiguous overlap is an incomplete result.

Require `source: browser`, `transport: playwright`, **`complete: true`**, `top_reached: true`, `bottom_reached: true`, and `reason: bottom_stable`: the beginning and bottom were reached, followed by two unchanged observations without a loading marker. The 90-round cap, missing containers, reordering, unresolved loading, page errors, and scroll gaps return `complete: false`. Inspect `warnings`; never infer completeness merely from tool success or valid JSON.

This establishes DOM coverage, not server guarantees. Verify the first/last turns, speakers, chronological continuity, and recording duration/paragraph count if visible. If timestamps or row markup do not match the parser, or visible text is missing, adapt the helper or use a local export. Keep temporary transcript caches outside research directories and delete them after successful export unless requested.

Apply [discussion selection](discussion-window.md) to the complete result using presenter, anchor, PPT topic, and a genuine end boundary. Preserve long teacher discussion even if the presenter never speaks again. State the actual browser source and preceding CLI limitation.

After success or failure, close only the task-created tab. Re-list tabs if indices changed; do not assume the old index still identifies the same tab. Keep user-provided tabs open. The helper itself restores scroll in `finally` and never creates or closes tabs.

## Regression checks

```bash
node --test .codex/skills/meeting-minutes-docx/scripts/tencent_meeting_extract.test.mjs
```

The tests invoke the actual MCP function with mocked Playwright page responses and cover time parsing, long discussion, repeated turns, virtual-list overlap, completeness, failure cleanup, and preservation of caller-owned tabs. Mocks do not establish live Tencent page compatibility or account access; verify those with an authorized recording when the extension is connected.

## Verified recording behavior (2026-10-17)

An authorized October 13 cooperation-meeting recording passed the actual Playwright MCP route: 191 ordered paragraphs with 191 distinct DOM IDs, top/bottom reached, two stable bottom observations, and 32 target-presenter turns. Observed successful runs needed 43–64 scroll rounds; the 90-round cap remains a failure limit, not a success criterion.

The shared `/crm/` link redirected to `/cw/`. Foregrounding the recording was necessary for reliable transcript rendering. The current DOM exposed `.minutes-module-list` and `data-pid` paragraph attributes; the helper also waits for SPA initialization and prefers the actual transcript button over a same-text wrapper. The final feedback widget is excluded as a complete widget group, while identical words spoken by participants remain speech. Treat these observations as version-specific evidence, not guarantees about future page markup.

Browser label times can differ slightly from tmeet paragraph metadata. Preserve each source's original time; compare paragraph identities/content and count rather than silently mixing the clocks.
