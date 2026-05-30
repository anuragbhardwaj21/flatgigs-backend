# Chat eval — manual smoke tests

Requires `OPENAI_API_KEY`, Redis, Postgres with Lisbon/Barcelona data, server running (`yarn dev`).

## Golden queries

1. **Full NL start** — `chat.start` `{ "query": "Lisbon 2026-06-10 to 2026-06-15 for 2 adults" }`  
   Expect: `state.updated` → `assistant.results` with `total > 0`, each item has `rationale`.

2. **Clarifying** — `chat.start` `{ "query": "I want to visit Lisbon" }`  
   Expect: `assistant.message` `messageType: question`, no `assistant.results`.

3. **Force search** — after partial slots, `chat.message` `{ "message": "just show me listings" }` with mandatory filled  
   Expect: `assistant.results` without optional questions.

4. **Review follow-up** — after search, `chat.message` `{ "message": "what do reviews say?" }`  
   Expect: `citation` events, `done`, `assistant.message` answer.

5. **Reconnect** — complete one search, disconnect WS, reconnect same token within 20m  
   Expect: `assistant.history` with messages (text + results intro, no items in JSON). No live `assistant.results`.

## Trace

After any turn, copy `meta.requestId` from `assistant.results` and call:

`GET /api/v1/agents/traces/:requestId`

Expect non-empty `steps` with `intent` and `retrieval`.

## REST parity

`GET /api/v1/chat` with same `X-Token` should match `assistant.history` messages and `expiresAt`.
