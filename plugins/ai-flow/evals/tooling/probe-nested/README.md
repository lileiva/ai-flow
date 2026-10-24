# probe-nested (nested capture canary)

Template plugin for the preflight nested-capture canary (B2b design D9). `preflight.mjs` materializes it into a temp
dir (dropping the `.tmpl` suffixes) and runs it once on haiku (about $0.01) before `--gate` or `--promote`:

- `probe:outer` (depth 1) launches `probe:middle`;
- `probe:middle` (depth 2) writes `middle.txt`, calls the agent-answered `mcp__memx__note` mock, launches `probe:leaf`;
- `probe:leaf` (depth 3) writes `leaf.txt`, runs Bash and calls `note`.

The canary passes when the CLI left subagent transcripts for depths 1, 2 and 3 under
`<kept>/config/projects/<slug>/<session>/subagents/`, the depth-3 Write is in the merged stream, and the CLI's
"harness answered N agent mock calls the trace does not show" run-error reconciles with the transcripts (W5). On a
failure the runner exits 3; `--skip-nested-canary` skips the check (nested capture may then be reported failed).

Files end in `.tmpl` so this directory is never discovered as an ai-flow eval case.
