// Minimal Seanime online-stream and core declarations used by this payload.
declare type Settings = { episodeServers: string[]; supportsDub: boolean };
declare type SearchOptions = { query: string; dub: boolean; year?: number; media: any };
declare type SearchResult = { id: string; title: string; url: string; subOrDub: "sub" | "dub" | "both" };
declare type EpisodeDetails = { id: string; number: number; url: string; title?: string };
declare type VideoSubtitle = { id: string; url: string; language: string; isDefault: boolean };
declare type VideoSource = { url: string; type: "mp4" | "m3u8" | "unknown"; quality: string; label?: string; subtitles: VideoSubtitle[] };
declare type EpisodeServer = { server: string; headers: Record<string, string>; videoSources: VideoSource[] };
declare interface FetchResponse { ok: boolean; status: number; text(): string; json<T = any>(): T }
declare function fetch(url: string, options?: { headers?: Record<string, string>; redirect?: "error"; timeout?: number }): Promise<FetchResponse>;
declare function $getUserPreference(key: string): string | undefined;
