# Tencent Meeting transcript acquisition

Priority: **usable local/pasted transcript → official tmeet CLI → browser fallback**. Local input wins unless the user requests a refresh. Acquisition returns complete ordered evidence; [discussion selection](discussion-window.md) happens afterward and is identical for all channels.

## Preferred route: official tmeet

Read the sibling [`tmeet-skill`](../../tmeet-skill/SKILL.md), [`tmeet-record.md`](../../tmeet-skill/references/tmeet-record.md), and [`tmeet-auth.md`](../../tmeet-skill/references/tmeet-auth.md). Keep the official package unchanged. Use its command help for actual flags; do not reproduce its API or OAuth implementation.

1. Check `command -v tmeet`. This project installed `@tencentcloud/tmeet@1.0.18` globally and the matching Skill from `TencentCloud/tencentmeeting-cli` tag `v1.0.18`. Do not silently update either during retrieval.
2. Before the first tmeet command in a session/model combination, run the official initializer once using the actual agent/model identity:

   ```bash
   python3 .codex/skills/tmeet-skill/scripts/agent_init.py --agent "<actual-agent>" --model "<actual-model>"
   tmeet auth status
   ```

3. If not authenticated, use browser fallback when possible. Explain `tmeet auth login` as the optional CLI remedy; do not automatically block for its up-to-300-second OAuth flow or repeatedly prompt for login before fallback. Credentials stay under CLI management; never read or print credential files.
4. Invoke only read commands needed for the requested recording. Parse JSON business errors as well as exit status. Request full transcript fields (omit `--compact`, which may remove evidence).

### Locate the correct file

- `record_file_id`: the actual file used by `record transcript-*`; retain it as a string.
- `meeting_record_id`: resolve files with `tmeet record address --meeting-record-id "<id>"`; not interchangeable with file ID.
- `meeting_id` / `meeting_code`: follow official meeting-level routing (`meeting get` / `meeting search` / `meeting list-ended`) to inspect `records[]` and `permission_status`. For recurring numbers, match date/topic and recording metadata; ask only if several plausible instances remain. Read official meeting reference/help for those commands.
- For "latest" recurring recordings, choose by actual `records[].media_start_time`, not the series' scheduled/current-next instance date. Search can show empty instance-level `records[]` despite `has_recording=true`; inspect `meeting get` for the series-level recording list before declaring no recording. Check `records_total_count` for truncated coverage. When supplying a search time window, provide both `--start` and `--end` with timezones; an end-only historical bound can return `190004` in v1.0.18.
- `can_view` permits retrieval. A private CLI access failure does not invalidate a separately authorized shared browser link. `record list` can silently omit inaccessible items; empty results are not proof the recording does not exist. Follow the official fallback for unavailable meeting-level metadata before concluding.
- Shared URL: use an explicitly documented CLI URL resolver only if present. Version 1.0.18 does not document a shared-URL argument for transcript commands. With only a shared URL, proceed to browser fallback; do not invent IDs from `/crm/…` or guess private APIs. If meeting/date/topic metadata exists, try an appropriate official lookup first.
- Preserve file/segment identity: several files can each restart elapsed time at zero. Do not merge their clocks without a documented offset. Use a browser URL returned by official recording metadata only when it is an actual playback/share URL for this recording, not a media download URL.

### Fetch complete verbatim turns

```bash
tmeet record transcript-paragraphs --record-file-id "<file-id>"
tmeet record transcript-get --record-file-id "<file-id>" --pid "<returned-paragraph-id>" --limit 1
```

1. Inspect the paragraph list and actual response fields, then fetch the corresponding text with `transcript-get`. `--pid` and `--limit` are paragraph positioning, **not** generic `--page-token` pagination. Use IDs returned by the paragraph list or documented continuation, never arithmetic on IDs. A conservative per-paragraph fetch with `--limit 1` is available when batching semantics are unclear; verify returned IDs match the requested coverage.
2. Retrieve every required paragraph through the report and discussion boundary; retrieve the whole file if the boundary is not yet known. Compare expected paragraph IDs/counts with returned coverage, detect repeated continuations, missing text, truncation, and partial failures. For ordinary recording/meeting lists, follow their documented page tokens.
3. Deduplicate only repeated stable IDs from overlap; retain distinct repeated utterances and same-time ordering. Preserve raw paragraph ID, original text, speaker, file identity, and recording-relative time. Use the units/format documented by the actual response; the CLI converts transcript time fields for display. Do not guess seconds/milliseconds by magnitude.
4. Return ordered `{id?, speaker, time, content}` turns plus source/file and completeness metadata. Normalize `MM:SS` as minutes:seconds (`36:59` → `00:36:59`). Keep missing speakers as `未识别`; disclose missing time/attribution rather than inventing it.
5. Search hits (`transcript-search`) can locate passages but cannot prove full context. `smart-minutes`, Yuanbao summaries, and rolling summaries do not replace verbatim evidence, even when the general official Skill suggests them as fallback.

### Verified v1.0.18 response shape (2026-10-15)

Live recording validation returned the following structure; inspect actual responses rather than assuming it for other versions:

- Paragraph index: `data.pids[]` contains `pid`, `start_time`, `end_time`; `data.total` is the expected paragraph count.
- Transcript details: check `data.code` (success `0`), then read `data.minutes.paragraphs[]`. Each paragraph has `pid`, `speaker.user_name`, `speaker.user_id`, `start_time`, `end_time`, and `sentences[]`.
- Verbatim content is `sentences[].words[].text`, in response order; retain sentence/word IDs and times in raw evidence. Join word text within a sentence, preserving punctuation. Do not mistake the absence of a paragraph-level `text` field for an empty transcript.
- `data.more` indicates remaining details. Batches of `--limit 30` were verified: choose each next `--pid` from the first uncovered index ID, check every returned ID and time against the index, and require full expected coverage plus final `more=false` before claiming the whole file. A zero exit status alone is insufficient.
- CLI timestamps can mix `MM:SS` with `HH:MM:SS` in the same recording. Normalize elapsed times before comparisons; preserve their original values in raw evidence.

## Automatic browser fallback

Try [Playwright browser extraction](playwright-transcript-extraction.md) when CLI is absent/unavailable, not logged in, permission-limited, cannot resolve the supplied URL, fails, or yields incomplete evidence. Use the supplied full `transcript_page_url`, an exact playback/share URL obtained from official metadata, or an explicitly requested existing page. Do not ask the user to select a channel again.

If only identifiers are supplied and neither route can provide a browser URL, request a share URL or exported transcript. If CLI processing is unfinished, a browser may be tried for an already available transcript, but do not claim to bypass ongoing server-side processing. An account permission/password/login barrier must be respected on each channel independently.

Do not splice partial CLI/browser batches together without matching file/paragraph identity and coverage. Prefer a complete result from one channel. Retain the CLI failure reason and actual successful source in the result; never silently label browser evidence as CLI output.

## Failure and scope

If both routes fail or remain incomplete, state the specific reason and allow local/pasted exports. Do not turn an incomplete tail into a complete discussion. A PPT-only draft requires explicit agreement and must be labeled as such.

Generating minutes authorizes reading the requested material, not submitting permission applications, feedback, changing meetings, logging out, or opting into updates. Any permission application/feedback follows the official preview and user-confirmation procedure only when needed and requested. No credentials belong in project files or responses.
