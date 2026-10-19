# Sandbox Node probe (not an ai-flow case)

Templates for a tiny standalone plugin that `preflight.mjs --probe-node` materializes into a temp dir
and runs with `claude plugin eval` on haiku. It checks that Node 26, npm and vitest work inside the
eval sandbox. File names end in `.tmpl` so that the ai-flow suite never discovers them as cases.
