import { api } from "@/services/api";

const PROXY_PATH = "/api/proxy-m3u8";

/**
 * 去广告：把原始 m3u8 地址改写成走自建站（MoonTVPlus）的 m3u8 代理。
 *
 * 服务端在返回播放列表前会执行 filterAdsFromM3U8：
 *   - 删掉 #EXT-X-DISCONTINUITY 段落（广告插入点）
 *   - 按广告关键字丢弃对应的分片条目
 * 注意：只代理 m3u8 清单本身，.ts 分片仍由本机直连源站 CDN，不额外消耗服务器流量。
 *
 * 站点没有该接口 / 请求失败时，播放器会走错误回退逻辑切到别的源。
 */
export function buildProxyM3u8Url(url: string, source?: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  // 只处理 http(s) 直链，本地文件 / 其它协议原样返回
  if (!/^https?:\/\//i.test(trimmed)) return url;
  const base = api.baseURL;
  if (!base) return url;
  // 已经在代理里（例如站点侧也开了客户端去广告），避免二次套娃
  if (trimmed.includes(PROXY_PATH)) return url;

  const params = [`url=${encodeURIComponent(trimmed)}`];
  if (source) params.push(`source=${encodeURIComponent(source)}`);
  return `${base}${PROXY_PATH}?${params.join("&")}`;
}

/** 批量改写剧集列表；enabled 为 false 时原样返回 */
export function proxifyEpisodes(
  episodes: string[] | undefined,
  source: string,
  enabled: boolean
): string[] | undefined {
  if (!enabled || !episodes || episodes.length === 0) return episodes;
  return episodes.map((u) => buildProxyM3u8Url(u, source));
}
