# Anime Nexus for Seanime

Experimental online-stream provider using **https://anime.nexus/** exclusively. Its API, subtitle storage and video CDN are services used by that website. Version 0.1.0 is **not an unattended playback solution**.

## Install

Add this manifest URL in Seanime's extension manager:

```
https://raw.githubusercontent.com/DefnoJae/AnimeNexus/main/Manifest.json
```

Search uses the site's JSON catalogue. Episodes include fillers and recaps, paginate in ascending order, retain their original numbering and exclude fractional episode numbers unsupported by Seanime. Choose **Nexus HLS**. The original adaptive master retains separate audio tracks; select audio in your player. Dub-specific catalogue filtering is not supported, so the provider does not advertise a dub search mode. Subtitle entries use the site's original ASS files; player support varies.

## Playback verification limitation

The website issues a per-video verified session through Turnstile and a live socket. Its master requires challenge, encrypted-secret, fingerprint and session headers. CDN playlists and segments additionally require the video UUID and client fingerprint. These are not permanent download links. An MP4 initialization segment is not a playable full episode.

This payload cannot create or renew that browser verification session. A temporary session import is available for testing:

1. Play the episode in your own browser and export a HAR containing the initial successful `video.m3u8` request and matching CDN requests. The site's inspection detection can redirect to Google; a redirects-only capture will not work.
2. Run `node tools/import-session.mjs capture.har` locally.
3. Copy the resulting private JSON into the extension's **Playback session JSON** setting.
4. Select the same episode. The provider checks the master before returning it. If verification expired, import a fresh session.

HARs and imported sessions contain private credentials. They are ignored by Git. Keep them local. Session import does not renew the socket, so playback can fail or stop even after the master check succeeds. Seanime/player forwarding of these headers to every HLS request still needs live validation. No fully working playback claim is made.

## Development and validation

Run `npm ci`, `npm run check`, and `npm test`. Tests use synthetic fixtures shaped from observed responses, with no captured credentials. The supplied browser capture confirmed episode enumeration, stream metadata, a three-quality multi-audio master and successful CDN media segments for **Overgeared episode 1**. Search parameters and catalogue fields were observed in browser requests and the site's rendered application code. Direct automated requests were blocked by Cloudflare; live Seanime search, session renewal, subtitle rendering and sustained playback remain unverified.

Observed routes:

- `GET https://api.anime.nexus/api/anime/shows?search=…&sortBy=name%20asc&page=1&includes%5B%5D=poster&includes%5B%5D=genres&hasVideos=1`
- `GET https://api.anime.nexus/api/anime/details/episodes?id=…&page=…&perPage=24&order=asc&fillers=true&recaps=true`
- `GET https://api.anime.nexus/api/anime/details/episode/stream?id=…&fillers=true&recaps=true`
- The returned `data.hls` is the master, not an invented embed endpoint.

Interface references: [Seanime online-stream provider](https://seanime.gitbook.io/seanime-extensions/content-providers/online-streaming-provider) and [core runtime declarations](https://github.com/5rahim/seanime/blob/main/internal/extension_repo/goja_plugin_types/core.d.ts).
