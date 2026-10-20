# Engram Fallback (degraded mode)

AI-Flow stores artifacts in engram. When engram is missing, the flow still works inside one conversation, with the limits below. Every agent follows this file instead of carrying its own copy.

## When it applies

Any one of these signals means engram is unavailable:

- the session context shows the SessionStart warning "engram not found";
- the mem_* tools are absent from your tool list;
- a mem_* call errors or fails (for example the MCP server is down).

## Sub-agents

- Skip mem_search/mem_get_observation recovery and skip mem_save. Do not retry engram calls.
- Use the artifact content the orchestrator passed inline in your launch prompt. If an upstream artifact you need is missing from the prompt, say so in `risks` and work with what you have.
- Return every artifact you produce in full in the return payload, as `artifacts[].content` (keep `name` and the `topic_key` it would have had), so the orchestrator can hand it on.
- Add a risk: "engram unavailable: no multi-session continuity".

## Orchestrator

- Warn the user once and recommend installing engram: https://github.com/gentleman-programming/engram (plugin `engram@engram`).
- Pass the full content of every upstream artifact inline to every launch that needs it, instead of topic keys.
- Keep the DAG state in the conversation and show it to the user at each gate.

## Limitations

- Nothing survives the session: when the conversation ends or is compacted, artifacts and state are lost.
- `/ai-flow:flow-continue` cannot resume a change started in degraded mode.
- Long changes become expensive, because artifacts travel in prompts instead of being read on demand.
