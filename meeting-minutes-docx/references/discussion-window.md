# Report and discussion selection

Apply the same selection rules to tmeet, browser, and local/pasted transcripts. Retrieve complete evidence first; speaker filtering is not a retrieval shortcut.

## Time semantics

- All selection times are elapsed recording time, not meeting wall-clock/Unix time.
- Accept `MM:SS` and `HH:MM:SS`; two fields always mean minutes and seconds. `36:59` and `00:36:59` both mean 2,219 seconds. Convert explicit natural-language hours/minutes to this form before matching.
- Seconds and the middle field of a three-part timestamp must be 0–59; minutes in a two-part timestamp can exceed 59. Reject invalid/negative times rather than silently repairing them. Display normalized `HH:MM:SS`, preserving subsecond evidence internally if available.
- `transcript_anchor_time` locates an occurrence; it is not an automatic excerpt start or end. `transcript_end_time` is inclusive for turn start times and must not precede the chosen start. State if a final turn overlaps that endpoint and only turn-level timing is available.

## Choose the occurrence

Use `transcript_speaker`, anchor proximity, PPT/report topic, and adjacent turns together. The presenter's brief acknowledgement inside another person's report does not start a new report. Treat speaker identity and report/topic identity as separate evidence.

When an anchor falls inside Q&A, include the preceding report introduction and relevant context rather than clipping at the anchor. Do not silently pick the first speaker occurrence or simply the nearest turn when there are multiple plausible reports or the anchor lies outside the supplied transcript. Describe candidate ranges and ask for a better anchor/report identifier when necessary.

Without an anchor, use an unambiguous single report matching the presenter and PPT. Multiple appearances within that same report and Q&A are not inherently ambiguous. If two distinct reports remain plausible, ask which one; do not merge them.

## Retain the full exchange

Start at the selected report's introduction or earliest relevant contextual turn. Include all speakers in that report and the questions, answers, follow-up questions, teacher comments, peer discussion, and agreed plans that follow it.

Infer the end from a clear next presenter/report introduction, explicit agenda transition, confirmed transcript end, or the user-provided `transcript_end_time`. Merely changing speaker, a long run of teacher comments, silence/gaps, or the presenter ceasing to speak is insufficient. Do not impose a five-turn cutoff or discard comments when the presenter never speaks again.

A next-report introduction itself belongs to the next report and is excluded. Keep brief acknowledgements that close the selected exchange when they precede that transition. If no boundary is visible because retrieval stopped mid-discussion, fetch more context (or use browser fallback for incomplete CLI content) before drafting. If the source itself is incomplete or a boundary remains genuinely unclear, disclose the missing context and ask for an explicit end time or more transcript.

Before drafting, report the selected occurrence/topic, actual first/last timestamps, and boundary evidence. Preserve ordered speaker/time/text until Q&A reconstruction is complete; do not invent missing answers or assign unidentified voices to named people.
