# Latitude HDR Studio

RAW bracket merging in the browser, followed by one optional GPT Image edit per bracket group.

- Public app / test link: https://latitude-hdr-studio.caitmelo.chatgpt.site
- Public source: https://github.com/caitmelo/latitude-hdr-studio
- Developer handoff: [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md)
- Exact image-edit prompt: [docs/AI_PROMPT.md](docs/AI_PROMPT.md)

This snapshot synchronizes the application source from deployed Sites version 12, commit `997cd5295694c020f3cf426b3c371ff3aa25927f`. Documentation is refreshed for this handoff. GitHub and Sites are separate repositories: updating GitHub does not automatically deploy the app.

## Three processing stages

1. **Read, group and merge with code.** LibRaw-Wasm decodes camera RAWs. Exposure metadata suggests bracket groups; clickable embedded thumbnails allow inspection and frames can be moved. Code aligns exposures, automatically estimates motion suppression and combines reliable samples into scene-linear HDR.
2. **Develop with code.** Camera white balance and colour conversion, highlight handling and multiscale virtual-exposure blending produce a viewable natural rendering. No AI request is needed for this stage.
3. **Finish with GPT Image once.** Enabled by default, this sends the developed JPEG preview to `/api/ai/edit`. The server makes one OpenAI Images edit request, asking for natural colour and haze correction. The returned JPEG is kept separately. Bulk groups run sequentially. Manual reruns or remerging with automatic AI enabled make additional requests; there are no automatic retries.

The legacy `/api/ai/enhance` slider-assessment endpoint remains in the source, but its control is hidden and off by default. It is not an additional AI pass in the normal workflow.

## Comparison and exports

After shows the actual GPT Image output when available. Before shows its exact input JPEG, and Compare splits those images. Without AI, comparison shows local development changes. Bracket tabs distinguish AI-finished and merge-only results.

The final AI file ends in `_gpt_image.jpg`. Bulk export includes the selected local export(s), successful AI JPEGs and a JSON summary. The default `pair` option can therefore produce **three images per group**: base PNG, developed PNG and AI JPEG. These are not three AI calls. Selecting one local export format gives one local image plus the AI JPEG. A final-only export mode is not implemented.

## Development

Use a current Node.js runtime supporting native Fetch, FormData, Blob and the Node test runner (Node 22+ recommended for this codebase).

```sh
npm test
npm run build
```

The project has no npm dependencies and no `dev` script. Build creates `dist/server/index.js`, a Worker entrypoint with public assets embedded. Serve the Worker through a compatible runtime; serving `public/` alone does not provide AI routes. See the handoff for hosting/authentication requirements.

## Source map

| File | Responsibility |
| --- | --- |
| `public/app.js` | UI, bracket queue, previews, sequential bulk jobs and AI calls |
| `public/process.worker.mjs` | RAW metadata/thumbnails, decode, merge and export jobs |
| `public/engine.mjs` | Numerical merge, exposure, colour and output encoders |
| `public/alignment.mjs` | Affine refinement after translation alignment |
| `public/render.mjs` | Natural multiscale display rendering |
| `public/zip.mjs` | Batch ZIP packaging |
| `src/server.js` | Authenticated AI endpoints and Worker request handler |
| `scripts/build.mjs` | Bundle public assets and Worker source |
| `tests/` | Numerical, alignment, API and simulated UI regression tests |

## Limits and privacy

RAWs stay on the device; AI sends a reduced merged JPEG to OpenAI. There is no durable session storage or resumable server queue. Closing or refreshing clears in-memory results.

Camera support depends on LibRaw-Wasm 1.6.0, camera model and compression; not every RAW type/mode is supported. Maximum 200 MB per file, 32 MP decoded output per frame, 100 files per import action and 512 MiB per ZIP. Full-resolution work can require gigabytes of memory. Alignment handles small translation, rotation and skew, not strong parallax or arbitrary movement. Detail clipped in every frame cannot be recovered.

AI input is capped at 1536px on its long side (bulk preview is 1200px wide before this cap). Requested output has a 1536px long side with dimensions rounded to multiples of 16. It is not full-resolution RAW finishing. Generative edits may alter details and require visual inspection. API charges apply.

TIFF stores float32 scene-linear RGB with sRGB primaries/D65 metadata, without an embedded ICC profile. HDR uses RGBE; PNG is an 8-bit developed image. RAW DNG and EXR export are not implemented.

## Validation and dependencies

The last deployed version passed 34 automated tests. The three supplied Canon CR3 files were previously exercised with the actual LibRaw-Wasm worker, and embedded JPEG thumbnails were verified. Four successful live `/api/ai/edit` responses were observed on 18 September 2026. These checks do not guarantee natural colour or geometry preservation for every scene.

LibRaw-Wasm JavaScript glue is vendored; its matching WASM binary loads from jsDelivr on first use. Upstream source and licensing: https://github.com/ybouane/LibRaw-Wasm/tree/v1.6.0. Review bundled LibRaw and codec licences for redistribution. No customer photos or API secrets belong in this repository.
