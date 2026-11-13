# Study plan format

Write a JSON document matching `study-plan.schema.json` into the configured `in-arrivo` directory. Use `schema: "hub.study-plan/1"`, a stable plan `id`, and increment the integer `version` for a revision. Keep subject, thread, phase, day, block and step ids stable when the corresponding item remains the same.

IDs start with an ASCII letter or digit and contain at most 64 ASCII letters, digits, dots, underscores or hyphens. For example, `C01.f.1` is valid.

Declare subjects, their threads, optional phases and method reminders. Each day has a subject, title, thread ids, recall day ids, kind, blocks and a check. Give each step a small actionable text and, when useful, estimated minutes and a file path relative to a configured material folder, with an optional page number. A day's optional minutes estimate is used for ordering; it is not a date or deadline.

If the plan declares phases, every day must name its `phase` by id. If it declares no phases, omit `phase` from every day. Phase mixes are suggestions keyed by subject id; the owner controls the active mix. Do not add `g` or dates to days: Hub computes G numbers from the current order.

For a long plan, write a folder in `in-arrivo` containing `plan.json` with the header (all plan fields except `days`) and `days-*.json` files, each containing an array of days. Hub reads the chunks in filename order. A single JSON file with the full plan remains valid.

Before revising an active plan, read `stato/<planId>.json` when it exists. Preserve ids for retained work and do not invent completion times. The state lists open step ids, completion and actual completion time per day, completed focus minutes per day, notes, thread autonomy, subject states and progress whose ids were removed. Completed step ids can be inferred from the plan and open steps.

The JSON Schema describes the document's structure. Hub additionally checks uniqueness and cross-references, including subjects, threads, recall days and phases; validation errors identify the location and reason.
