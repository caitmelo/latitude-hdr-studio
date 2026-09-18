# Latitude HDR Studio

Browser-based RAW bracket HDR merging with automatic grouping, adaptive motion suppression, bulk ZIP export, before/after comparison and optional AI colour assistance.

Live app: https://latitude-hdr-studio.caitmelo.chatgpt.site

## Development

Requires a current Node.js runtime. Run `npm test` for the regression suite and `npm run build` to produce the Worker in `dist/server/index.js`. UI sources are in `public/`, processing in `public/engine.mjs` and `public/process.worker.mjs`, and the Worker backend in `src/server.js`.

Hosting configuration is intentionally empty because the ChatGPT Sites project binding is environment-specific. In the Site owner’s **Settings**, add `OPENAI_API_KEY` as a hosted secret, then redeploy the approved Site version. Never put an API key in browser code, `.openai/hosting.json`, or the repository. The app uses the hosted Sites sign-in flow (`/signin-with-chatgpt`) and accepts AI requests only when Sites injects a signed-in visitor’s `oai-authenticated-user-email`; the endpoint also enforces a same-origin check, bounded preview payload and per-user cooldown.

## Processing and limits

RAW decoding uses LibRaw-Wasm 1.6.0, with its WASM binary fetched from jsDelivr. RAW compatibility depends on the decoder, camera and compression; support is not universal. Alignment corrects translation only. Motion suppression is adaptive but cannot guarantee removal of all movement or parallax artifacts. Clipped detail cannot be recovered without an unclipped source sample.

Bulk processing runs sequentially and exports a ZIP capped at 512 MiB. PNG exports are tone-mapped sRGB; linear float TIFF and Radiance HDR exports are available. Before/after compares two renderings of the merged HDR. Window control preserves recovered bright detail with a global tone curve rather than semantic window masking.

The optional AI endpoint sends a reduced JPEG preview to OpenAI on explicit request and returns bounded colour and tone controls. Apply/Revert uses the original HDR rendering; it does not generate replacement scene content. RAW files are processed locally. API routes require authenticated identity and must be adapted appropriately for a different hosting environment.

## Validation

Tests cover numerical rendering and merge behavior, simulated batch workflow and mocked API handling. End-to-end browser RAW decoding and a live OpenAI connection have not been verified by this suite.

## Third-party software

LibRaw-Wasm source and build information: https://github.com/ybouane/LibRaw-Wasm/tree/v1.6.0. Its package is ISC licensed; the build includes LibRaw (LGPL-2.1/CDDL-1.0), Little CMS and codec libraries. Vendored JavaScript glue remains replaceable. Fonts are delivered by Google Fonts with system fallbacks.
