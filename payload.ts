/// <reference path="./types.d.ts" />

// Contract observed in anime.nexus browser traffic; no HTML selectors required.
class Provider {
    private readonly site = "https://anime.nexus";
    private readonly api = "https://api.anime.nexus";

    private helper(): string {
        const value = ($getUserPreference("resolverUrl") || "http://127.0.0.1:3000").replace(/\/$/, "");
        if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value)) throw "Anime Nexus: use a local resolver URL with a port.";
        return value;
    }

    getSettings(): Settings { return { episodeServers: ["Nexus HLS"], supportsDub: false }; }

    private uuid(value: string): string {
        if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) throw "Anime Nexus: invalid ID.";
        return value;
    }

    private async json(url: string): Promise<any> {
        const local = url.startsWith(this.api) ? this.helper() + "/api/catalogue?path=" + encodeURIComponent(url.slice(this.api.length)) : url;
        try {
            const response = await fetch(local, { timeout: 120 });
            const data = response.json();
            if (!response.ok) throw typeof data.error === "string" ? data.error : "Helper HTTP " + response.status;
            return data;
        } catch (error) {
            throw "Anime Nexus: " + (typeof error === "string" ? error : "Cannot reach or read the local helper. Start npm run helper and check its terminal.");
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        if (!opts.query.trim()) return [];
        const result = await this.json(this.api + "/api/anime/shows?search=" + encodeURIComponent(opts.query.trim()) + "&sortBy=name%20asc&page=1&includes%5B%5D=poster&includes%5B%5D=genres&hasVideos=1");
        if (!Array.isArray(result.data)) throw "Anime Nexus: unexpected search response.";
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
            if (!Array.isArray(result.data) || !Number.isInteger(result.meta?.last_page) || result.meta.last_page < 1 || result.meta.current_page !== page) throw "Anime Nexus: unexpected episode pagination.";
            for (const item of result.data) {
                if (!Number.isInteger(Number(item.number)) || Number(item.number) < 1 || typeof item.slug !== "string") continue;
                this.uuid(item.id);
                if (seen[item.id]) continue;
                seen[item.id] = true;
                episodes.push({ id: item.id, number: Number(item.number), title: item.title || "Episode " + item.number, url: this.site + "/watch/" + item.id + "/" + encodeURIComponent(item.slug) });
            }
            if (page >= result.meta.last_page) return episodes.sort((a, b) => a.number - b.number);
        }
        throw "Anime Nexus: pagination limit exceeded.";
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        if (server !== "default" && server !== "Nexus HLS") throw "Anime Nexus: unknown server.";
        this.uuid(episode.id);
        if (!episode.url.startsWith(this.site + "/watch/" + episode.id + "/")) throw "Anime Nexus: invalid watch URL.";
        const data = await this.json(this.helper() + "/api/resolve?url=" + encodeURIComponent(episode.url));
        if (typeof data.playUrl !== "string" || !data.playUrl.startsWith(this.helper() + "/play/")) throw "Anime Nexus: invalid helper playback URL.";
        return { server: "Nexus HLS", headers: {}, videoSources: [{ url: data.playUrl, type: "m3u8", quality: "Auto", subtitles: [] }] };
    }
}
