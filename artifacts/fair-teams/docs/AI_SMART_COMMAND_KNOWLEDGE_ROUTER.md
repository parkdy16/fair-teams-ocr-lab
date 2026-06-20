# AI Smart Command Knowledge Router

This patch adds a deterministic Fair Teams product-question router before the OpenAI call.

Why:
- Product questions such as “What is the difference between local rating and shared rating?” should not get generic sports-app answers.
- We cannot patch every wording one by one, so app Q&A now uses topic scoring and synonym groups.
- High-confidence Fair Teams questions are answered directly from the local Fair Teams knowledge base. This avoids generic model guesses and saves API calls.

Behavior:
- App action requests still go to the normal AI command/action system.
- Product/help questions about ratings, rosters, Today, teams, Smart Import, Lost & Found, Club Notes, Equipment, Backup, and Voice/AI route to known Fair Teams topics.
- If a wording matches a topic, the response uses a deterministic Fair Teams answer with no actions.
- The knowledge base can be expanded by adding topics/answers, rather than adding one-off prompt hacks.

Key test:
- “What is the difference between local rating and shared rating?” should answer that local/private/non-shared rating is the normal private organizer rating, while shared/Club rating comes from private organizer submissions averaged into a Club rating for shared team generation.
