# sust-prili

SUST hackathon preliminary submission — **"QueueStorm Investigator"**, a support-ticket
analysis system for fintech transaction disputes. The spec lives in this directory:

- `SUST_Hackathon_Preli_Problem_Statement.pdf` — the problem
- `SUST_Preli_Evaluation_Rubric_With_Explanations.pdf` — how submissions are scored
- `SUST_Preli_Team_Instructions_Manual.pdf` — rules / submission process
- `SUST_Preli_Sample_Cases.json` — worked input/expected-output cases for validation

The solution code will be added to this directory over time.

## Knowledge graph (graphify)

This project bundles the `/graphify` skill at `.claude/skills/graphify/` and keeps a persistent
knowledge graph in `graphify-out/`.

**ALWAYS, after finishing a prompt/task that changed any code or docs, run
`/graphify . --update` to refresh the graph before ending your turn.** If no graph exists yet
(`graphify-out/graph.json` is missing) and the project has code, run `/graphify .` to build it
the first time instead.

For any question about this codebase or the specs, query the graph first when it exists —
`/graphify query "…"` (or `/graphify path "A" "B"`, `/graphify explain "Node"`) — before reading
files broadly.

When this becomes a git repo, add `graphify-out/` and `.graphify_*` to `.gitignore`; keep
`.claude/` (including the bundled `.claude/skills/graphify/`) tracked.
