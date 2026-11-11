---
name: c-e2e-feature-csv
description: "e2e medium feature: add an RFC 4180 CSV formatter and parser to textkit; full AI-Flow explore-to-archive with auto-approved gates."
tags: [case-c, e2e, medium]
max_turns: 200
timeout_seconds: 3600
allowed_tools: [Agent, Skill, Read, Glob, Grep, Write, Edit, Bash, ToolSearch, TodoWrite]
append_system_prompt: |
  UNATTENDED EVAL RUN. No human is available to answer questions or approve gates.
  - Treat every human review gate (proposal, plan, tracer, verify) as approved. When you reach a gate, present its summary as usual, then print a line `AUTO-APPROVED GATE: <proposal|plan|tracer|verify>` and continue. Exception: if the task says to stop at a gate, print `STOPPED AT GATE: <gate>` and end the run there.
  - Never wait for answers. When a question would normally go to the user, choose the recommended or most reasonable option, print `ASSUMED ANSWER: <short answer>`, and continue.
  - Do not commit, push or tag unless the task asks for it.
  - When the task is finished, print `EVAL-RUN-COMPLETE` as the last line of your final message.
---
Using the AI-Flow workflow, take change `add-csv` from exploration through archive.

The repository in the current directory is `textkit`, a small Node library tested with vitest (`npm test`). Feature request: add CSV support in a new `src/csv/` module (`src/csv/format.js` and `src/csv/parse.js`), with `toCSV` and `parseCSV` exported from `src/index.js`.

`toCSV(rows, options)`:
- `rows` is an array of plain objects. The first line is a header row. `options.columns` (array of keys) sets which columns appear and in what order; by default the keys of the first row, in order.
- Lines are joined with `\n`, with no trailing newline. `options.delimiter` defaults to `,`.
- Fields follow RFC 4180: a field containing the delimiter, a double quote, `\r` or `\n` is wrapped in double quotes, and each double quote inside it is doubled. `null` and `undefined` become empty fields; other values are converted with `String()`.

`parseCSV(text, options)`:
- Uses the first record as the header and returns an array of objects whose values are strings.
- Handles quoted fields, including doubled quotes, embedded delimiters and embedded newlines. Accepts `\n` and `\r\n` line endings and ignores one trailing line ending. `options.delimiter` defaults to `,`.
- Round trip: `parseCSV(toCSV(rows))` deep-equals `rows` whenever every value is a string.

Keep the existing functions and their tests unchanged.
