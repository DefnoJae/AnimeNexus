# Anime Nexus for Seanime

Version 0.3.0 provides live Anime Nexus search and episode enumeration through a local helper. **Playback remains blocked by interactive verification (`TURNSTILE_REQUIRED`).** This is an experimental provider, not a working playback release yet.

Install manifest:

```
https://raw.githubusercontent.com/DefnoJae/AnimeNexus/main/Manifest.json
```

Follow [helper setup](helper/README.md), start `npm run helper`, and set **Local resolver URL** in Seanime to `http://127.0.0.1:3000`. Keep the helper running. Anime Nexus is the only content source; its API and CDN supply catalogue entries and streams.

The helper now uses Python curl_cffi with browser impersonation and certificate verification enabled. On Windows it reads the existing trusted root certificates without installing certificates or changing system trust. This fixes the previous native transport error 60. Catalogue responses that already succeed are accepted without requiring a Cloudflare cookie. When a challenge appears, the solver consumes that actual response without fetching it twice.

Episodes retain numbering, include fillers and recaps, paginate and deduplicate, and exclude unsupported fractional numbers. Select **Nexus HLS**. The gateway preserves adaptive audio groups and obtains fresh segment tokens. Dub-specific search and subtitles are currently unsupported.

## Validation

On 11 October 2026, live Frieren search returned the real series, and episode enumeration returned 28 episodes across two pages. The stream metadata request passed site verification. Playback authorization reached the observed `/api/auth/ws-token` flow and returned `TURNSTILE_REQUIRED`. The helper reports that limitation explicitly. Socket authorization, master playback and sustained media delivery have not passed end-to-end validation.

The earlier user capture showed that playback credentials are obtained from `/api/auth/ws-token` after viewer preparation and interactive verification. The watch-page HTML contains null credentials. The provider no longer assumes those credentials are embedded in HTML.

Run `npm ci`, `npm run check`, and `npm test` for development. To include the real transport fixture test, set the helper environment variables described in its README. Raw HARs, cookies and user sessions must not be committed. External resolver source is imported as a dependency and is not vendored.

Interface reference: [Seanime online-stream provider](https://seanime.gitbook.io/seanime-extensions/content-providers/online-streaming-provider).
