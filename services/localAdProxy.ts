import TcpSocket from 'react-native-tcp-socket';

import Logger from '@/utils/Logger';

const logger = Logger.withTag('LocalAdProxy');

/**
 * 本地去广告代理（跑在电视自己身上，不经服务器）
 *
 * 背景：最初把播放地址改写成走自建站 /api/proxy-m3u8，实测在 Cloudflare Workers 上
 * 从海外回源拉国内 CDN 的 m3u8 会被拒（403/404）且很慢 —— 电视端纯直连环境下播放全挂。
 * 所以改成：源站仍然由电视直连（快、稳），只在本地把 m3u8 清单里的广告段落剔掉。
 *
 * 工作方式：本机起一个 127.0.0.1 的 HTTP 服务，播放地址指向它；
 * 它拉取原始 m3u8 → 去掉 #EXT-X-DISCONTINUITY 与命中广告关键字的行 →
 * 把分片/密钥链接补成绝对地址（直连源站）→ 返回给播放器。
 * 子 m3u8（master → 变体清单）继续指向本地代理，保证每一层都被过滤。
 */

const PORT = 12347;
const HOST = '127.0.0.1';
const PROXY_PATH = '/ads';

const UA =
  'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 与服务端 filterAdsFromM3U8Default 保持一致
const AD_KEYWORDS = ['sponsor', '/ad/', '/ads/', 'advert', 'advertisement', '/adjump', 'redtraffic'];

/** 手写 query 解析：不依赖 URLSearchParams（RN/Hermes 上支持不完整，曾导致代理不可用） */
function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const key = i < 0 ? pair : pair.slice(0, i);
    const val = i < 0 ? '' : pair.slice(i + 1);
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

/** 取 URL 的 origin（用于 Referer），手写正则避免依赖 URL 实现 */
function originOf(u: string): string {
  const m = /^(https?):\/\/([^/?#]+)/i.exec(u);
  return m ? `${m[1]}://${m[2]}/` : '';
}

/** 相对路径转绝对路径（同样不依赖 new URL） */
function absolutize(url: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const m = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?/i.exec(baseUrl);
  if (!m) return url;
  const origin = `${m[1]}://${m[2]}`;
  if (url.startsWith('//')) return `${m[1]}:${url}`;
  if (url.startsWith('/')) return origin + url;
  const baseDir = (m[3] || '/').replace(/[^/]*$/, '');
  return origin + baseDir + url;
}

/** 过滤广告 + 把链接绝对化（子 m3u8 继续走本地代理） */
export function processPlaylist(
  content: string,
  baseUrl: string,
  source: string,
  localBase: string
): string {
  const lines = content.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 广告插入点
    if (line.includes('#EXT-X-DISCONTINUITY')) continue;

    // EXTINF 后面的 URL 命中广告关键字 → 连同 EXTINF 一起丢掉
    if (line.includes('#EXTINF:') && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (AD_KEYWORDS.some((k) => next.toLowerCase().includes(k))) {
        i += 1;
        continue;
      }
    }

    // 加密密钥等 URI 属性也要绝对化
    if (line.startsWith('#')) {
      out.push(
        line.includes('URI="')
          ? line.replace(/URI="([^"]+)"/g, (_m, u: string) => `URI="${absolutize(u, baseUrl)}"`)
          : line
      );
      continue;
    }

    if (!line.trim()) continue;

    const abs = absolutize(line.trim(), baseUrl);
    if (/\.m3u8(\?.*)?$/i.test(abs)) {
      // 变体清单仍然交给本地代理，逐层过滤
      out.push(`${localBase}${PROXY_PATH}?url=${encodeURIComponent(abs)}&source=${encodeURIComponent(source)}`);
    } else {
      out.push(abs);
    }
  }

  return out.join('\n');
}

class LocalAdProxy {
  private server: TcpSocket.Server | null = null;
  private running = false;
  private starting: Promise<boolean> | null = null;

  public getBaseUrl(): string {
    return `http://${HOST}:${PORT}`;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public async start(): Promise<boolean> {
    if (this.running) return true;
    if (this.starting) return this.starting;

    this.starting = new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      // 兜底：5 秒内没起来就当失败，绝不阻塞 App 启动流程
      setTimeout(() => done(false), 5000);

      try {
        const server = TcpSocket.createServer((socket: any) => {
          let buffer = '';

          socket.on('data', async (data: any) => {
            buffer += data.toString();
            if (!buffer.includes('\r\n\r\n')) return;
            const requestLine = buffer.split('\r\n')[0] || '';
            buffer = '';
            try {
              const response = await this.handle(requestLine);
              socket.write(response);
            } catch (err) {
              logger.info('[LocalAdProxy] 请求处理失败:', err);
              try {
                socket.write(this.raw(502, 'proxy error'));
              } catch {
                /* ignore */
              }
            } finally {
              try {
                socket.end();
              } catch {
                /* ignore */
              }
            }
          });

          socket.on('error', (err: any) => logger.debug('[LocalAdProxy] socket error', err?.message ?? err));
        });

        server.listen({ port: PORT, host: HOST }, () => {
          this.server = server;
          this.running = true;
          logger.info(`[LocalAdProxy] 本地去广告代理已启动: ${this.getBaseUrl()}`);
          done(true);
        });

        server.on('error', (err: any) => {
          logger.warn('[LocalAdProxy] 启动失败（将回退为直连播放）:', err?.message ?? err);
          this.running = false;
          done(false);
        });
      } catch (err) {
        logger.warn('[LocalAdProxy] 启动异常（将回退为直连播放）:', err);
        done(false);
      }
    });

    return this.starting;
  }

  public stop() {
    if (this.server && this.running) {
      try {
        this.server.close();
      } catch {
        /* ignore */
      }
    }
    this.server = null;
    this.running = false;
    this.starting = null;
  }

  private async handle(requestLine: string): Promise<string> {
    const parts = requestLine.split(' ');
    const path = parts[1] || '';
    const qi = path.indexOf('?');
    if (!path.startsWith(PROXY_PATH) || qi < 0) {
      return this.raw(404, 'not found');
    }

    const params = parseQuery(path.slice(qi + 1));
    const target = params.url || '';
    const source = params.source || '';
    if (!/^https?:\/\//i.test(target)) {
      return this.raw(400, 'bad url');
    }

    let text = '';
    try {
      const resp = await fetch(target, {
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: originOf(target),
        },
      });
      if (!resp.ok) {
        logger.info(`[LocalAdProxy] 上游 ${resp.status}，回退直连: ${target.slice(0, 90)}`);
        // 关键兜底：拉不到就 302 回原地址，让播放器自己直连源站（最坏也只是没去广告，绝不能播不了）
        return `HTTP/1.1 302 Found\r\nLocation: ${target}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;
      }
      text = await resp.text();
    } catch (err) {
      logger.info('[LocalAdProxy] 拉取 m3u8 失败，回退直连:', err);
      return `HTTP/1.1 302 Found\r\nLocation: ${target}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;
    }

    const processed = processPlaylist(text, target, source, this.getBaseUrl());
    return this.raw(200, processed, 'application/vnd.apple.mpegurl');
  }

  private raw(status: number, body: string, contentType = 'text/plain; charset=utf-8'): string {
    const length = new TextEncoder().encode(body).length;
    const statusText = status === 200 ? 'OK' : 'Error';
    return (
      `HTTP/1.1 ${status} ${statusText}\r\n` +
      `Content-Type: ${contentType}\r\n` +
      `Content-Length: ${length}\r\n` +
      `Access-Control-Allow-Origin: *\r\n` +
      `Cache-Control: no-store\r\n` +
      `Connection: close\r\n` +
      `\r\n` +
      body
    );
  }
}

export default new LocalAdProxy();
