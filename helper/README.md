# Local resolver adapter

The adapter loads the external resolver's modules without copying its source into this repository. Keep the helper running during playback: it retains the socket and signs individual HLS resources.

Install [anime-nexus-hls-stream-resolver](https://github.com/sharoon7171/anime-nexus-hls-stream-resolver) separately and run `npm install` in its folder. Then, from this repository in PowerShell:

```powershell
$env:NEXUS_RESOLVER_PATH = 'C:\path\to\anime-nexus-hls-stream-resolver'
npm run helper
```

Use `http://127.0.0.1:3000` in the Seanime provider's **Local resolver URL** field. Do not also start the upstream server on the same port. The adapter serves search/episodes through the upstream verified HTTP client and playback through its live gateway.

## Windows parser

The upstream parser is a macOS binary. This repository now supplies a buildable Windows adapter using pinned MIT-licensed [parser source](https://github.com/B00H0O/cloudflare-jsd-solver). With Go installed, build it from the repository root:

```powershell
Push-Location helper/parser
go build -o ../bin/jsdctl.exe .
Pop-Location
```

The helper automatically selects this executable on Windows. `JSDCTL_PATH` can override it. Its `parse-script` JSON interface was verified against the site's current public script on 11 October 2026. Dependency attribution: B00H0, copyright 2026, MIT; source and checksums are pinned in `go.mod` and `go.sum`. The generated binary is ignored by Git.

## Remaining TLS blocker

A live test still fails with native curl TLS error 60. Exporting the existing Windows trusted roots and setting `SSL_CERT_FILE` did not repair it. The installed native library embeds Unix certificate paths and its JavaScript API does not expose a CA-file option. These findings indicate a transport trust/configuration problem but do not prove the exact cause. A supported trust configuration or replacement of that transport is required; certificate verification remains enabled. Search, socket authorization and sustained playback are not yet validated through this helper.

## Gateway correction

AnimeNexus now owns the gateway layer. Segment tokens use the **episode UUID** and include the captured `segmentUrl` pathname, rather than the different UUID in the HLS master URL. Every segment request obtains a fresh token. Failed master validation closes the socket, and expired sessions are cleaned up. The gateway retains the original audio groups and preserves CDN hosts without assuming regional interchangeability.

The helper binds only to 127.0.0.1. It allows only observed Nexus catalogue routes and Nexus CDN host families. Errors returned to Seanime omit upstream tokens, cookies and response bodies. Subtitles are currently omitted; the upstream gateway API does not expose them. Dub search remains disabled.
