# Local resolver adapter

The helper must run throughout use. It serves the catalogue and retains authorized playback sockets. When required, its local verification page runs Anime Nexus's supported Private Captcha challenge.

## Setup on Windows

Install Python 3.10 or newer and Node.js. Install the external [resolver](https://github.com/sharoon7171/anime-nexus-hls-stream-resolver) separately and run `npm install` in its folder. From this repository, install the verified transport:

```powershell
python -m pip install --target helper/python-deps -r helper/requirements.txt
$env:NEXUS_PYTHON = (Get-Command python).Source
$env:NEXUS_RESOLVER_PATH = 'C:\path\to\anime-nexus-hls-stream-resolver'
npm run helper
```

`NEXUS_PYTHON` can be an absolute path to another installed Python executable. `NEXUS_RESOLVER_PATH` must point to the external resolver folder, not this repository. Use `http://127.0.0.1:3000` in Seanime's **Local resolver URL**. Do not start another server on that port.

## Windows parser

The upstream parser is a macOS binary. Build this repository's Windows adapter with Go:

```powershell
Push-Location helper/parser
go build -o ../bin/jsdctl.exe .
Pop-Location
```

The helper automatically selects that executable on Windows. `JSDCTL_PATH` can override it. The parser uses pinned MIT-licensed [source](https://github.com/B00H0O/cloudflare-jsd-solver), copyright B00H0 2026. Its JSON interface was verified against the current public script on 11 October 2026. The generated executable is ignored by Git.

## Verified transport

The old curl-cffi-node native client fails TLS validation on this Windows installation. The adapter now replaces its HTTP and WebSocket interfaces in memory before loading upstream modules, without editing the external repository. A private Python worker uses pinned curl_cffi 0.16.3. Python dependencies are installed only in this repository's ignored `helper/python-deps` folder.

Certificate verification stays enabled. Windows trusted server roots are read into a temporary bundle; no roots are installed and no system settings change. `NEXUS_CA_FILE` optionally selects an existing PEM trust bundle. Other platforms use the transport's normal verified trust bundle. Cookies and socket credentials remain in memory. Diagnostics omit response bodies and secrets.

## Playback status

Open `http://127.0.0.1:3000/verification` and enable automatic verification before opening episodes. Leave the companion page open. It waits for requests through a same-origin connection and runs the site's supported challenge; the helper then resumes the episode automatically. Without an active companion, a failed episode request returns a manual verification link. Browser screen, audio and navigation timing metadata are sent to Anime Nexus as required by its observed player authorization flow. Credentials and challenge solutions stay in memory; restarting the helper requires fresh authorization. Enable the companion again after reloading its page.

Live search, both Frieren episode pages, browser verification, authorized WebSocket connection, HLS master and variant playlists, initialization file and three consecutive video segments passed validation on 11 October 2026. Extended playback remains untested. Active sockets are reused for repeated requests, and expired proofs require fresh verification.

The gateway uses episode UUIDs and segment URL paths for authorization, obtains fresh segment tokens and closes failed or expired sessions. It preserves audio groups and CDN hosts. Region fallback, subtitles and dub search are not implemented.

The helper binds only to 127.0.0.1 and allows the observed catalogue routes and Nexus CDN families. `/health` confirms only that the helper is listening, not that upstream verification or playback works.

Playback responses allow local browser origins and Seanime Denshi's observed `app://-` origin. Verification submissions still require the helper's own origin. Version 0.4.2 corrects the desktop player's access to the local HLS gateway.
