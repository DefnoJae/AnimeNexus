# Anime Nexus for Seanime

Version 0.4.0 provides Anime Nexus search, episode enumeration and playable HLS through a local helper. When the site requires playback verification, complete its supported Private Captcha challenge in your browser, then retry the episode in Seanime.

Install manifest:

```
https://raw.githubusercontent.com/DefnoJae/AnimeNexus/main/Manifest.json
```

Follow [helper setup](helper/README.md), start `npm run helper`, and set **Local resolver URL** in Seanime to `http://127.0.0.1:3000`. Keep the helper running. Anime Nexus is the only content source; its API and CDN supply catalogue entries and streams.

If Seanime reports no source, open `http://127.0.0.1:3000/verification`, select the pending episode and click **Verify playback**. After it says **Verified**, retry the episode promptly: the site's authorization expires quickly. Active playback sessions are reused while their socket remains connected.

The helper now uses Python curl_cffi with browser impersonation and certificate verification enabled. On Windows it reads the existing trusted root certificates without installing certificates or changing system trust. This fixes the previous native transport error 60. Catalogue responses that already succeed are accepted without requiring a Cloudflare cookie. When a challenge appears, the solver consumes that actual response without fetching it twice.

Episodes retain numbering, include fillers and recaps, paginate and deduplicate, and exclude unsupported fractional numbers. Select **Nexus HLS**. The gateway preserves adaptive audio groups and obtains fresh segment tokens. Dub-specific search and subtitles are currently unsupported.

## Validation

On 11 October 2026, live Frieren search returned the real series, and episode enumeration returned 28 episodes across two pages. For episode 1, browser verification and socket authorization succeeded. The master playlist exposed three video qualities and six audio entries; a variant playlist, its initialization file and three consecutive video segments returned HTTP 200. A complete episode and extended playback have not been tested.

The earlier user capture showed that playback credentials are obtained from `/api/auth/ws-token` after viewer preparation and interactive verification. The watch-page HTML contains null credentials. The provider no longer assumes those credentials are embedded in HTML.

Run `npm ci`, `npm run check`, and `npm test` for development. To include the real transport fixture test, set the helper environment variables described in its README. Raw HARs, cookies and user sessions must not be committed. External resolver source is imported as a dependency and is not vendored.

Interface reference: [Seanime online-stream provider](https://seanime.gitbook.io/seanime-extensions/content-providers/online-streaming-provider).
