import localAdProxy from "@/services/localAdProxy";

/**
 * 去广告：把播放地址指向**电视本机**的 m3u8 过滤代理（services/localAdProxy.ts）。
 *
 * 为什么不走服务端：最初用自建站的 /api/proxy-m3u8，实测 Cloudflare Worker 从海外
 * 回源拉国内 CDN 的 m3u8 会被源站拒绝（3/3 失败，403/404，耗时 3~5s），
 * 电视端纯直连环境下播放全挂。改为本地过滤后：源站仍由电视直连（快、稳），
 * 广告在本地从清单里剔掉；分片本来就走源站直连，不额外绕路。
 */
export function buildProxyM3u8Url(url: string, source?: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  // 只处理 http(s) 直链，本地文件 / 其它协议原样返回
  if (!/^https?:\/\//i.test(trimmed)) return url;
  // 本地过滤代理没起来时回退为直连播放（宁可带广告，也不能播不了）
  if (!localAdProxy.isRunning()) return url;
  // 幂等：已经指向本地代理就不再改写
  if (trimmed.startsWith(localAdProxy.getBaseUrl())) return url;

  const params = [`url=${encodeURIComponent(trimmed)}`];
  if (source) params.push(`source=${encodeURIComponent(source)}`);
  return `${localAdProxy.getBaseUrl()}/ads?${params.join("&")}`;
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
