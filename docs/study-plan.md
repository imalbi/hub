# Study plan format

Write a JSON document matching `study-plan.schema.json` into the configured `in-arrivo` directory. Use `schema: "hub.study-plan/1"`, a stable plan `id`, and increment the integer `version` for a revision. Keep subject, thread, phase, day, block and step ids stable when the corresponding item remains the same.

Declare subjects, their threads, optional phases and method reminders. Each day has a subject, title, thread ids, recall day ids, kind, blocks and a check. Give each step a small actionable text and, when useful, estimated minutes and a file path relative to a configured material folder, with an optional page number. A day's optional minutes estimate is used for ordering; it is not a date or deadline.

If the plan declares phases, every day must name its `phase` by id. If it declares no phases, omit `phase` from every day. Phase mixes are suggestions keyed by subject id; the owner controls the active mix. Do not add `g` or dates to days: Hub computes G numbers from the current order.

For a long plan, write a folder in `in-arrivo` containing `plan.json` with the header (all plan fields except `days`) and `days-*.json` files, each containing an array of days. Hub reads the chunks in filename order. A single JSON file with the full plan remains valid.

Before revising an active plan, read `stato/<planId>.json` when it exists. Preserve ids for retained work and do not invent completion times. Hub's state export is added in a later Studio step.

The JSON Schema describes the document's structure. Hub additionally checks uniqueness and cross-references, including subjects, threads, recall days and phases; validation errors identify the location and reason.
