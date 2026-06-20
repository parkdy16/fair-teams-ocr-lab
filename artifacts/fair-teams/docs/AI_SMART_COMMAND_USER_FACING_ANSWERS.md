# AI Smart Command user-facing answer style

This patch separates product explanations from developer/beta status.

## Why

Fair Teams feature questions should sound like a helpful organizer explaining the app, not like a changelog. For example, "What is equipment for?" should explain the Equipment Board as a simple "who has what?" board for balls, bibs, cones, pumps, jerseys, or any group gear someone might take home.

## Rule

- Feature explanation: explain purpose and user benefit.
- Action request that is not wired yet: say the assistant understands but cannot change it from chat yet.
- Do not mention beta branches, wiring, JSON, schemas, API routes, or implementation status in normal user-facing explanations.

## Example

User: "What is equipment for?"

Better answer: "Equipment is like a small who-has-what board for your football group. Use it for balls, bibs, cones, pumps, jerseys, or any bag someone might take home after a match. Before the next game, organizers can quickly see who has each item instead of searching Signal/WhatsApp or asking everyone again."

User: "Move the bibs bag to Sarah."

Acceptable limitation answer while the action is not executable: "I understand — you want to move the bibs bag to Sarah. I cannot change Equipment Board holders from chat yet."
