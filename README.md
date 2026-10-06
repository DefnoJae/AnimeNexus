# Anime Nexus for Seanime

Version 0.2.0 uses a local live resolver instead of importing expiring browser sessions. Anime Nexus is the only content source; its API and CDN supply catalogue entries and streams.

Install manifest:

```
https://raw.githubusercontent.com/DefnoJae/AnimeNexus/main/Manifest.json
```

## Required local helper

Follow [helper setup](helper/README.md), start `npm run helper`, and set **Local resolver URL** in Seanime to `http://127.0.0.1:3000`. Keep it running throughout playback. The external [resolver](https://github.com/sharoon7171/anime-nexus-hls-stream-resolver) establishes site verification and retains the socket to obtain fresh playlist and segment tokens. The provider returns a local adaptive HLS master without embedding captured credentials.

Search and episode enumeration now use the helper's verified HTTP client rather than Seanime's blocked direct requests. Episodes retain source numbering, include fillers and recaps, paginate and deduplicate, and exclude unsupported fractional numbers. Select **Nexus HLS**. Audio tracks remain in the adaptive master. Dub-specific search and external subtitles are currently unsupported.

## Validation and remaining blockers

TypeScript checks and five automated bridge tests pass. The adapter starts on Windows and responds to health checks. **Live site access and playback remain unverified:** the upstream CLI failed on this machine with TLS certificate error 60, and its bundled challenge parser is a macOS executable. A compatible parser and trusted certificate configuration are still required. The integration does not repair those upstream components or disable certificate verification. See the helper README for details.

The earlier user-provided capture confirmed the real catalogue/episode routes and successful three-quality multi-audio playback for Overgeared episode 1. That browser result does not prove this helper works end to end. Seanime previously loaded the provider but failed during direct catalogue search. Version 0.2.0 moves that request to the helper and exports errors as strings, including schema and validation failures that previously appeared as `map[]`.

Run `npm ci`, `npm run check`, and `npm test` for development. No raw HARs, cookies or user sessions belong in this repository. The external resolver is read as a dependency; none of its source has been vendored here.

Interface reference: [Seanime online-stream provider](https://seanime.gitbook.io/seanime-extensions/content-providers/online-streaming-provider).
