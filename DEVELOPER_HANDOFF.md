# Developer handoff

## Goal

Natural real-estate photographs from exposure brackets: readable shadows, neutral clouds/whites, believable greens, clean contrast and reduced haze. Preserve architecture and photographed details. Do not introduce pink clouds, golden-hour styling or invented window detail. See `docs/AI_PROMPT.md` for the exact finishing prompt.

## Start here

- Test app: https://latitude-hdr-studio.caitmelo.chatgpt.site
- Public repo: https://github.com/caitmelo/latitude-hdr-studio
- Source baseline: Sites version 12, `997cd5295694c020f3cf426b3c371ff3aa25927f`.
- Run `npm test` and `npm run build`. Tests mock OpenAI; they do not spend API credit. No npm dependencies, dev server or automated GitHub-to-Sites deployment is configured in this snapshot.

The normal path is mathematical RAW merge → local development → one GPT Image edit per bracket group. The older Responses API slider assessment is retained but hidden/off and not part of the normal path.

## Hosting and secure setup

`src/server.js` targets a Fetch/Worker runtime. `npm run build` embeds the public assets into `dist/server/index.js`. The tracked `.openai/hosting.json` belongs to the existing Sites project: do not reuse it to deploy an unrelated project. GitHub updates do not publish to Sites automatically.

Set `OPENAI_API_KEY` as a server runtime secret. Never add it to source, browser storage, a frontend environment variable or a public build. The existing published app already has its own configured secret; it is not transferred through GitHub.

The server trusts `oai-authenticated-user-email` supplied by Sites dispatch. On another host, replace this with verified server-side authentication; never trust a client-supplied copy of that header. Adapt `SITE_ORIGIN` and the sign-in link. Public page access does not mean anonymous AI access. Preserve request-size limits and same-origin checks.

Serve with cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) and HTTPS for production. The service worker provides an isolation fallback. The browser needs WebAssembly/shared memory and access to the pinned decoder CDN. A plain static host alone cannot perform authenticated server-side AI requests.

## API contracts

- `GET /api/ai/status`: authenticated configuration-presence check. Returns model names and a boolean, never a key. It does not prove model access or billing availability.
- `POST /api/ai/edit`: `{image: <JPEG data URL>, width: <integer>, height: <integer>}`. Server builds multipart form data for OpenAI Images edits and returns `{image: <JPEG data URL>, model}`. Current code configures `gpt-image-2.5-sunburst`, high quality, n=1, JPEG, compression 95. Verify model access in the receiving project.
- `POST /api/ai/enhance`: legacy bounded slider recommendation via `gpt-4.1-mini`; returns `apply`, `tone`, `explanation`, `model`. Not called by the default finishing workflow.

Input JSON is capped at 1.8 million bytes; the image data URL at 1.7 million characters. Images must have aspect ratio between 1:3 and 3:1. AI input is reduced; output requests a 1536px long side rounded to multiples of 16. Do not describe AI JPEGs as full-resolution RAW exports.

## Queue, results and failure behaviour

Scan embedded thumbnails → review/move exposures → merge selected or all groups. Bulk processing runs sequentially, exports the chosen local format(s), requests AI once, retains a successful AI JPEG and advances. Failed AI calls retain original exports and are reported in the summary. Cancel during AI stops further groups; an in-flight provider request can still be billed. There are no automatic retries.

The main After canvas displays the actual returned AI JPEG. Before is the exact JPEG submitted to AI; Compare splits those images. Without AI, the canvas compares base versus locally developed HDR. A separate AI panel and download remain available. UI state and results are in browser memory and disappear on refresh/close.

`pair` bulk mode produces two local PNGs plus an AI JPEG when successful, along with one batch summary. Other modes produce one local output plus AI JPEG. The user prefers fewer files/steps; a final-AI-only export option is a useful next change, but is not yet implemented. The final AI filename ends `_gpt_image.jpg`.

## Known limits / next engineering work

- Generative edits can alter geometry/details despite the prompt. Validate actual output against input and references; successful HTTP responses are not proof of photographic quality.
- Fully clipped highlights/window detail cannot be recovered mathematically. Alignment is limited to small shifts, rotation/skew; parallax and major motion remain difficult.
- Timeout handling uses a local five-minute worker watchdog, 180-second server AI timeout and 190-second client AI timeout. No durable background job/polling/resume system exists. Provider timeouts may still incur charges.
- The image concurrency guard is an in-memory Map scoped to a Worker isolate, not a distributed account-wide quota. Add durable quotas/job tracking if scaling or exposing paid usage more widely.
- If some RAWs lack usable embedded JPEG previews, the queue labels them as unavailable; there is no universal thumbnail fallback.
- Review previews are cached; returning to a prior group allows inspection/AI JPEG download, while changing local development/full-resolution export may require remerging.

## Validation

34 automated tests cover numerical HDR behaviour, affine alignment, server validation, request construction, sequential AI bulk jobs, preserving outputs on AI failure, watchdog cleanup and painting actual AI results into the main comparison viewer. Mocked API tests do not validate output aesthetics. Earlier actual Canon CR3 decoding/thumbnail checks and four successful live image-edit responses were recorded during development. Keep customer RAWs, generated photos, secrets and personal metadata out of this public source repository.
