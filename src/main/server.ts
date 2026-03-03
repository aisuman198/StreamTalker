import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { PREVIEW_SERVER_PORT } from '../shared/constants.js';
import type { AppConfig, FaceState } from '../shared/types.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

/** `createPreviewServer` の戻り値型（http.Server + pushState） */
export interface PreviewServerResult extends http.Server {
  /** 接続中の全 SSE クライアントに FaceState をプッシュする */
  pushState: (state: FaceState) => void;
}

/** 絶対ファイルパスを /api/image エンドポイント URL に変換する */
function toImageApiUrl(filePath: string, port: number): string {
  if (!filePath) return filePath;
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const encoded = Buffer.from(filePath).toString('base64');
  return `http://localhost:${port}/api/image?src=${encoded}`;
}

/** config の images 内の絶対パスを HTTP API URL に書き換えた新しいオブジェクトを返す */
function rewriteImagePaths(config: AppConfig, port: number): AppConfig {
  if (!config.images) return config;
  const rewritten: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.images)) {
    rewritten[key] = value ? toImageApiUrl(value as string, port) : (value as string);
  }
  return { ...config, images: rewritten as unknown as AppConfig['images'] };
}

/**
 * 指定したディレクトリとポートでHTTPサーバーを作成して起動する。
 * テストからもポートを上書きして利用できるようにエクスポートしている。
 */
export function createPreviewServer(
  distDir: string,
  port: number,
  indexFile = 'index.html',
  getConfig?: () => AppConfig,
  getState?: () => FaceState,
): PreviewServerResult {
  // SSE クライアントの管理
  const sseClients = new Set<http.ServerResponse>();

  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';

    // パスとクエリを分離（Node.js が ? を除去する場合も考慮）
    let pathname = rawUrl;
    let searchParams = new URLSearchParams('');
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      pathname = parsed.pathname;
      searchParams = parsed.searchParams;
    } catch {
      // 不正なURLはそのまま静的配信へフォールバック
    }

    // /api/config エンドポイント（OBS BrowserSource 向け設定配信）
    if (pathname === '/api/config') {
      if (!getConfig) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Config not available' }));
        return;
      }
      const config = rewriteImagePaths(getConfig(), port);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(config));
      return;
    }

    // /api/state エンドポイント（ポーリング用フォールバック）
    if (pathname === '/api/state') {
      const state = getState ? getState() : { mouth: 'closed', eye: 'open' };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(state));
      return;
    }

    // /api/state/events エンドポイント（SSE：状態変化をリアルタイムプッシュ）
    if (pathname === '/api/state/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      // ヘッダーを即座にフラッシュして接続を確立
      res.flushHeaders();

      // 接続直後に現在の状態を送信
      const initial = getState ? getState() : { mouth: 'closed', eye: 'open' };
      res.write(`data: ${JSON.stringify(initial)}\n\n`);

      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));

      // レスポンスは閉じない（SSE は keep-alive で接続を維持する）
      return;
    }

    // /api/image エンドポイント（OBS BrowserSource 向け画像配信）
    if (pathname === '/api/image') {
      const encoded = searchParams.get('src');
      if (!encoded) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }
      let imagePath: string;
      try {
        imagePath = Buffer.from(encoded, 'base64').toString('utf-8');
      } catch {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }
      const ext = path.extname(imagePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] ?? 'image/png',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
      return;
    }

    // セキュリティ: パストラバーサル対策
    const urlPath = rawUrl === '/' ? `/${indexFile}` : rawUrl;
    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(distDir, safePath);

    // distDir外へのアクセスを拒否
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // ファイルが見つからない場合はindexFileを返す（SPA対応）
        fs.readFile(path.join(distDir, indexFile), (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexData);
        });
        return;
      }
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*', // OBS BrowserSourceからのアクセスを許可
      });
      res.end(data);
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview server running at http://localhost:${port}`);
  });

  // http.Server に pushState を追加して返す
  const result = server as unknown as PreviewServerResult;
  result.pushState = (state: FaceState): void => {
    const payload = `data: ${JSON.stringify(state)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  };

  return result;
}

export function startPreviewServer(
  distDir: string,
  indexFile = 'index.html',
  getConfig?: () => AppConfig,
  getState?: () => FaceState,
): PreviewServerResult {
  return createPreviewServer(distDir, PREVIEW_SERVER_PORT, indexFile, getConfig, getState);
}
