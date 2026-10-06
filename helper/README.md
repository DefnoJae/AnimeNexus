# Local resolver adapter

The adapter loads the external resolver's modules without copying its source into this repository. Keep the helper running during playback: it retains the socket and signs individual HLS resources.

Install [anime-nexus-hls-stream-resolver](https://github.com/sharoon7171/anime-nexus-hls-stream-resolver) separately and run `npm install` in its folder. Then, from this repository in PowerShell:

```powershell
$env:NEXUS_RESOLVER_PATH = 'C:\path\to\anime-nexus-hls-stream-resolver'
npm run helper
```

Use `http://127.0.0.1:3000` in the Seanime provider's **Local resolver URL** field. Do not also start the upstream server on the same port. The adapter serves search/episodes through the upstream verified HTTP client and playback through its live gateway.

## Current Windows blockers

A live test of the upstream CLI on this machine failed with curl TLS error 60. Configure a trusted CA bundle as supported by the upstream HTTP client; do not disable certificate verification. The bundled `bin/jsdctl` begins with macOS ARM64 Mach-O bytes and cannot execute on Windows. Set `JSDCTL_PATH` to a compatible executable implementing the upstream `parse-script` JSON interface. This repository does not provide that executable; upstream compatibility work remains necessary before live playback can be confirmed.

The helper binds only to 127.0.0.1. It allows only observed Nexus catalogue routes and Nexus CDN host families. Errors returned to Seanime omit upstream tokens, cookies and response bodies. Subtitles are currently omitted; the upstream gateway API does not expose them. Dub search remains disabled.
