/// <reference path="./types.d.ts" />

// Contract observed in anime.nexus browser traffic; no HTML selectors required.
class Provider {
    private readonly site = "https://anime.nexus";
    private readonly api = "https://api.anime.nexus";

    getSettings(): Settings { return { episodeServers: ["Nexus HLS"], supportsDub: false }; }

    private uuid(value: string): string {
        if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) throw new Error("Invalid Anime Nexus ID.");
        return value;
    }

    private async request(url: string, headers: Record<string, string> = {}): Promise<FetchResponse> {
        let response: FetchResponse;
        try {
            response = await fetch(url, { headers: { Origin: this.site, Referer: this.site + "/", ...headers }, redirect: "error", timeout: 35 });
        } catch (_) {
            // Goja exports native Error objects as map[] in rejected provider promises.
            // Reject with a string; never include request URLs or session credentials.
            throw "Anime Nexus network request failed before a response was available. Check connectivity and site verification.";
        }
        if (!response.ok) throw "Anime Nexus request failed (HTTP " + response.status + "). Browser verification may be required.";
        return response;
    }

    private async json(url: string): Promise<any> {
        const response = await this.request(url);
        try { return response.json(); } catch (_) { throw "Anime Nexus returned an invalid API response, possibly a verification page."; }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        if (!opts.query.trim()) return [];
        const result = await this.json(this.api + "/api/anime/shows?search=" + encodeURIComponent(opts.query.trim()) + "&sortBy=name%20asc&page=1&includes%5B%5D=poster&includes%5B%5D=genres&hasVideos=1");
        if (!Array.isArray(result.data)) throw new Error("Unexpected Anime Nexus search response.");
        return result.data.filter((show: any) => show && typeof show.name === "string" && typeof show.slug === "string").map((show: any) => ({
            id: this.uuid(show.id), title: show.name, url: this.site + "/series/" + show.id + "/" + encodeURIComponent(show.slug), subOrDub: "sub" as const,
        }));
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        this.uuid(id);
        const episodes: EpisodeDetails[] = [];
        const seen: Record<string, boolean> = {};
        for (let page = 1; page <= 1000; page++) {
            const result = await this.json(this.api + "/api/anime/details/episodes?id=" + id + "&page=" + page + "&perPage=24&order=asc&fillers=true&recaps=true");
            if (!Array.isArray(result.data) || !Number.isInteger(result.meta?.last_page) || result.meta.last_page < 1 || result.meta.current_page !== page) throw new Error("Unexpected Anime Nexus episode pagination.");
            for (const item of result.data) {
                if (!Number.isInteger(Number(item.number)) || Number(item.number) < 1 || typeof item.slug !== "string") continue;
                this.uuid(item.id);
                if (seen[item.id]) continue;
                seen[item.id] = true;
                episodes.push({ id: item.id, number: Number(item.number), title: item.title || "Episode " + item.number, url: this.site + "/watch/" + item.id + "/" + encodeURIComponent(item.slug) });
            }
            if (page >= result.meta.last_page) return episodes.sort((a, b) => a.number - b.number);
        }
        throw new Error("Anime Nexus episode pagination exceeded its limit.");
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        if (server !== "default" && server !== "Nexus HLS") throw new Error("Unknown Anime Nexus server.");
        this.uuid(episode.id);
        const result = await this.json(this.api + "/api/anime/details/episode/stream?id=" + episode.id + "&fillers=true&recaps=true");
        const data = result.data;
        const match = typeof data?.hls === "string" && data.hls.match(/^https:\/\/api\.anime\.nexus\/api\/anime\/video\/([a-f0-9-]+)\/stream\/video\.m3u8$/i);
        if (!match) throw new Error("Anime Nexus did not return a supported HLS master playlist.");
        const videoId = this.uuid(match[1]);
        let session: any;
        try { session = JSON.parse($getUserPreference("playbackSession") || "null"); } catch (_) { throw new Error("Invalid playback session JSON."); }
        if (!session || session.videoId !== videoId || session.episodeId !== episode.id) throw new Error("This episode requires a fresh verified browser session. See the README session import instructions.");
        if (typeof session.masterUrl !== "string" || session.masterUrl.split("?")[0] !== data.hls || /[\r\n#]/.test(session.masterUrl)) throw new Error("Invalid verified master URL.");
        const required = ["X-Challenge", "X-Encrypted-Secret", "X-Fingerprint", "X-Session-ID", "X-Client-Fingerprint", "User-Agent"];
        const headers: Record<string, string> = { Origin: this.site, Referer: this.site + "/" , "X-Video-UUID": episode.id };
        for (const key of required) {
            const value = session.headers?.[key];
            if (typeof value !== "string" || !value || /[\r\n]/.test(value)) throw new Error("Incomplete or invalid browser playback session.");
            headers[key] = value;
        }
        // Preserve the master: child video playlists alone omit the separate audio tracks.
        const master = await this.request(session.masterUrl, headers);
        const playlist = master.text();
        if (!playlist.trimStart().startsWith("#EXTM3U") || !playlist.includes("#EXT-X-STREAM-INF:")) throw new Error("Anime Nexus did not return a playable HLS master. Refresh the browser session.");
        const subtitles: VideoSubtitle[] = (Array.isArray(data.subtitles) ? data.subtitles : []).filter((sub: any) => typeof sub.src === "string" && /^https:\/\/assets\.anime\.nexus\//.test(sub.src)).map((sub: any) => ({ id: String(sub.id), url: sub.src, language: sub.srcLang || sub.label || "und", isDefault: false }));
        const defaultIndex = (data.subtitles || []).findIndex((sub: any) => sub.label === "English");
        const defaultId = defaultIndex >= 0 ? String(data.subtitles[defaultIndex].id) : "";
        subtitles.forEach(sub => { sub.isDefault = sub.id === defaultId; });
        return { server: "Nexus HLS", headers, videoSources: [{ url: session.masterUrl, type: "m3u8", quality: "Auto", label: "Original multi-audio master", subtitles }] };
    }
}
