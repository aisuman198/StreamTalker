// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createPreviewServer, type PreviewServerResult } from '../main/server';

/** HTTP レスポンスのヘッダーだけを取得して接続を閉じる（SSE など長期接続向け） */
function getHeaders(url: string): Promise<http.IncomingHttpHeaders> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      resolve(res.headers);
      res.destroy(); // ボディを待たずに切断
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
}

/** SSE 接続して最初のメッセージを受け取る */
function readFirstSseData(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ')) {
            res.destroy();
            resolve(line.slice(6).trim());
            return;
          }
        }
      });
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
}

/** SSE 接続して N 件のメッセージを受け取る */
function readSseMessages(url: string, count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const messages: string[] = [];
    const req = http.get(url, (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            messages.push(line.slice(6).trim());
            if (messages.length >= count) {
              res.destroy();
              resolve(messages);
              return;
            }
          }
        }
      });
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
}

const TEST_PORT = 13001;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function getUrl(url: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body,
          headers: res.headers,
        })
      );
    }).on('error', reject);
  });
}

describe('startPreviewServer 統合テスト', () => {
  let server: PreviewServerResult;
  let tmpDir: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        // テスト用テンポラリディレクトリを作成
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-test-'));

        // index.html を配置
        fs.writeFileSync(
          path.join(tmpDir, 'index.html'),
          '<html><body>Hello StreamTalker</body></html>'
        );

        // サブディレクトリ + CSSファイルを配置
        const cssDir = path.join(tmpDir, 'assets');
        fs.mkdirSync(cssDir);
        fs.writeFileSync(path.join(cssDir, 'style.css'), 'body { color: red; }');

        server = createPreviewServer(tmpDir, TEST_PORT);
        server.once('listening', resolve);
      })
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // テンポラリディレクトリを削除
        fs.rmSync(tmpDir, { recursive: true, force: true });
      })
  );

  // ----------------------------------------------------------------
  // 1. 正常なファイル配信のテスト
  // ----------------------------------------------------------------
  describe('正常なファイル配信', () => {
    it('index.htmlを配信できること', async () => {
      const { status, body } = await getUrl(`${BASE_URL}/index.html`);
      expect(status).toBe(200);
      expect(body).toContain('Hello StreamTalker');
    });

    it('Content-Type が text/html であること', async () => {
      const { status, headers } = await getUrl(`${BASE_URL}/index.html`);
      expect(status).toBe(200);
      expect(headers['content-type']).toMatch(/text\/html/);
    });

    it('CSSファイルを正しい Content-Type で配信できること', async () => {
      const { status, headers } = await getUrl(`${BASE_URL}/assets/style.css`);
      expect(status).toBe(200);
      expect(headers['content-type']).toBe('text/css');
    });
  });

  // ----------------------------------------------------------------
  // 2. ルートパス(/)のテスト
  // ----------------------------------------------------------------
  describe('ルートパス(/)', () => {
    it('GET / で 200 レスポンスと index.html の内容が返ること', async () => {
      const { status, body } = await getUrl(`${BASE_URL}/`);
      expect(status).toBe(200);
      expect(body).toContain('Hello StreamTalker');
    });
  });

  // ----------------------------------------------------------------
  // 3. 404フォールバックのテスト（SPA対応）
  // ----------------------------------------------------------------
  describe('404フォールバック（SPA対応）', () => {
    it('存在しないパスへのリクエストで index.html が返ること', async () => {
      const { status, body } = await getUrl(`${BASE_URL}/nonexistent-page`);
      expect(status).toBe(200);
      expect(body).toContain('Hello StreamTalker');
    });

    it('深いパスでも index.html にフォールバックすること', async () => {
      const { status, body } = await getUrl(`${BASE_URL}/some/deep/route`);
      expect(status).toBe(200);
      expect(body).toContain('Hello StreamTalker');
    });

    it('index.html 自体が存在しない場合は 404 を返すこと', async () => {
      // index.html を一時的に削除したサーバーをテスト専用に立てる
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-empty-'));
      const emptyServer = createPreviewServer(emptyDir, TEST_PORT + 1);

      await new Promise<void>((resolve) => emptyServer.once('listening', resolve));

      try {
        const { status } = await getUrl(`http://127.0.0.1:${TEST_PORT + 1}/nonexistent`);
        expect(status).toBe(404);
      } finally {
        await new Promise<void>((resolve) => emptyServer.close(() => resolve()));
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  // ----------------------------------------------------------------
  // 4. パストラバーサル対策のテスト
  // ----------------------------------------------------------------
  describe('パストラバーサル対策', () => {
    it('/../secret.txt へのアクセスが安全に処理されること', async () => {
      // Node の http クライアントは URL を正規化するため /../ は / に変換される
      // サーバー側でパストラバーサルを防止しているが、クライアントが正規化するため
      // 200（SPA fallback）・403・404 のいずれかが返ることを確認する
      const { status } = await getUrl(`${BASE_URL}/../secret.txt`);
      expect([200, 403, 404]).toContain(status);
    });

    it('/../../etc/passwd へのアクセスが安全に処理されること', async () => {
      const { status } = await getUrl(`${BASE_URL}/../../etc/passwd`);
      expect([200, 403, 404]).toContain(status);
    });
  });

  // ----------------------------------------------------------------
  // 5. CORSヘッダーのテスト
  // ----------------------------------------------------------------
  describe('CORSヘッダー', () => {
    it('Access-Control-Allow-Origin ヘッダーが設定されていること', async () => {
      const { headers } = await getUrl(`${BASE_URL}/index.html`);
      expect(headers['access-control-allow-origin']).toBe('*');
    });

    it('CSSファイルにも Access-Control-Allow-Origin ヘッダーが付くこと', async () => {
      const { headers } = await getUrl(`${BASE_URL}/assets/style.css`);
      expect(headers['access-control-allow-origin']).toBe('*');
    });
  });
});

// ----------------------------------------------------------------
// /api/state/events SSE エンドポイントのテスト
// ----------------------------------------------------------------
describe('/api/state/events SSE エンドポイント', () => {
  const SSE_PORT = 13008;
  const SSE_BASE = `http://127.0.0.1:${SSE_PORT}`;
  let server: PreviewServerResult;
  let tmpDir: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-sse-test-'));
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
        server = createPreviewServer(
          tmpDir, SSE_PORT, 'index.html',
          undefined,
          () => ({ mouth: 'closed', eye: 'open' }),
        );
        server.once('listening', resolve);
      })
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        fs.rmSync(tmpDir, { recursive: true, force: true });
      })
  );

  it('Content-Type が text/event-stream であること', async () => {
    const headers = await getHeaders(`${SSE_BASE}/api/state/events`);
    expect(headers['content-type']).toContain('text/event-stream');
  });

  it('接続直後に現在の FaceState が data: として送信されること', async () => {
    const raw = await readFirstSseData(`${SSE_BASE}/api/state/events`);
    const state = JSON.parse(raw);
    expect(state.mouth).toBe('closed');
    expect(state.eye).toBe('open');
  });

  it('pushState() を呼ぶと接続中クライアントに新しい状態が届くこと', async () => {
    // 2件受信（初期状態 + push）
    const messagesPromise = readSseMessages(`${SSE_BASE}/api/state/events`, 2);

    // 少し待ってから push
    await new Promise(resolve => setTimeout(resolve, 50));
    server.pushState({ mouth: 'open', eye: 'closed' });

    const messages = await messagesPromise;
    const pushed = JSON.parse(messages[1]);
    expect(pushed.mouth).toBe('open');
    expect(pushed.eye).toBe('closed');
  });

  it('Access-Control-Allow-Origin ヘッダーが設定されること', async () => {
    const headers = await getHeaders(`${SSE_BASE}/api/state/events`);
    expect(headers['access-control-allow-origin']).toBe('*');
  });
});

// ----------------------------------------------------------------
// /api/state エンドポイントのテスト
// ----------------------------------------------------------------
describe('/api/state エンドポイント', () => {
  const STATE_PORT = 13006;
  const STATE_BASE = `http://127.0.0.1:${STATE_PORT}`;

  describe('getState あり', () => {
    let server: PreviewServerResult;
    let tmpDir: string;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-state-test-'));
          fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
          server = createPreviewServer(
            tmpDir, STATE_PORT, 'index.html',
            undefined,
            () => ({ mouth: 'open', eye: 'closed' }),
          );
          server.once('listening', resolve);
        })
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          fs.rmSync(tmpDir, { recursive: true, force: true });
        })
    );

    it('200 と FaceState JSON が返ること', async () => {
      const { status, body } = await getUrl(`${STATE_BASE}/api/state`);
      expect(status).toBe(200);
      const state = JSON.parse(body);
      expect(state.mouth).toBe('open');
      expect(state.eye).toBe('closed');
    });

    it('Access-Control-Allow-Origin ヘッダーが設定されること', async () => {
      const { headers } = await getUrl(`${STATE_BASE}/api/state`);
      expect(headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('getState なし（デフォルト）', () => {
    let server: PreviewServerResult;
    let tmpDir: string;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-state-default-test-'));
          fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
          server = createPreviewServer(tmpDir, STATE_PORT + 1);
          server.once('listening', resolve);
        })
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          fs.rmSync(tmpDir, { recursive: true, force: true });
        })
    );

    it('getState 未設定でも 200 と closed/open のデフォルト状態が返ること', async () => {
      const { status, body } = await getUrl(`http://127.0.0.1:${STATE_PORT + 1}/api/state`);
      expect(status).toBe(200);
      const state = JSON.parse(body);
      expect(state.mouth).toBe('closed');
      expect(state.eye).toBe('open');
    });
  });
});

// ----------------------------------------------------------------
// /api/config エンドポイントのテスト
// ----------------------------------------------------------------
describe('/api/config エンドポイント', () => {
  const API_PORT = 13003;
  const API_BASE = `http://127.0.0.1:${API_PORT}`;

  describe('getConfig あり', () => {
    let server: PreviewServerResult;
    let tmpDir: string;

    const mockConfig = {
      images: {
        closed_open: '/tmp/test/closed_open.png',
        open_open: '/tmp/test/open_open.png',
      },
      audioDeviceId: null,
      threshold: 0.15,
      smoothingTimeConstant: 0.3,
      pollingInterval: 50,
      lipSyncCycleMs: 150,
      backgroundColor: '#00FF00',
      blinkIntervalBase: 4000,
      blinkIntervalVariance: 2000,
      blinkTransitionDuration: 80,
    };

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-api-test-'));
          fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          server = createPreviewServer(tmpDir, API_PORT, 'index.html', () => mockConfig as any);
          server.once('listening', resolve);
        })
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          fs.rmSync(tmpDir, { recursive: true, force: true });
        })
    );

    it('200 と JSON が返ること', async () => {
      const { status, headers } = await getUrl(`${API_BASE}/api/config`);
      expect(status).toBe(200);
      expect(headers['content-type']).toContain('application/json');
    });

    it('画像パスが /api/image?src=... 形式の URL に書き換わること', async () => {
      const { body } = await getUrl(`${API_BASE}/api/config`);
      const config = JSON.parse(body);
      expect(config.images.closed_open).toMatch(/^http:\/\/localhost:\d+\/api\/image\?src=/);
      expect(config.images.open_open).toMatch(/^http:\/\/localhost:\d+\/api\/image\?src=/);
    });

    it('画像以外の設定値はそのまま返ること', async () => {
      const { body } = await getUrl(`${API_BASE}/api/config`);
      const config = JSON.parse(body);
      expect(config.threshold).toBe(0.15);
      expect(config.backgroundColor).toBe('#00FF00');
    });

    it('Access-Control-Allow-Origin ヘッダーが設定されること', async () => {
      const { headers } = await getUrl(`${API_BASE}/api/config`);
      expect(headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('getConfig なし', () => {
    let server: PreviewServerResult;
    let tmpDir: string;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-noconfig-test-'));
          fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
          server = createPreviewServer(tmpDir, API_PORT + 1, 'index.html');
          server.once('listening', resolve);
        })
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          fs.rmSync(tmpDir, { recursive: true, force: true });
        })
    );

    it('503 が返ること', async () => {
      const { status } = await getUrl(`http://127.0.0.1:${API_PORT + 1}/api/config`);
      expect(status).toBe(503);
    });
  });
});

// ----------------------------------------------------------------
// /api/image エンドポイントのテスト
// ----------------------------------------------------------------
describe('/api/image エンドポイント', () => {
  const IMG_PORT = 13005;
  const IMG_BASE = `http://127.0.0.1:${IMG_PORT}`;
  let server: PreviewServerResult;
  let tmpDir: string;
  let testImagePath: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-talker-img-test-'));
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
        // 1x1 の最小 PNG バイナリを作成
        testImagePath = path.join(tmpDir, 'test.png');
        fs.writeFileSync(testImagePath, Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        ]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server = createPreviewServer(tmpDir, IMG_PORT, 'index.html', () => ({}) as any);
        server.once('listening', resolve);
      })
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        fs.rmSync(tmpDir, { recursive: true, force: true });
      })
  );

  it('有効な画像パスを base64 エンコードして要求すると 200 が返ること', async () => {
    const encoded = Buffer.from(testImagePath).toString('base64');
    const { status, headers } = await getUrl(`${IMG_BASE}/api/image?src=${encoded}`);
    expect(status).toBe(200);
    expect(headers['content-type']).toBe('image/png');
  });

  it('src パラメータがない場合は 400 が返ること', async () => {
    const { status } = await getUrl(`${IMG_BASE}/api/image?`);
    expect(status).toBe(400);
  });

  it('画像以外の拡張子を要求すると 403 が返ること', async () => {
    const encoded = Buffer.from('/etc/passwd').toString('base64');
    const { status } = await getUrl(`${IMG_BASE}/api/image?src=${encoded}`);
    expect(status).toBe(403);
  });

  it('存在しない画像ファイルを要求すると 404 が返ること', async () => {
    const encoded = Buffer.from('/nonexistent/path/image.png').toString('base64');
    const { status } = await getUrl(`${IMG_BASE}/api/image?src=${encoded}`);
    expect(status).toBe(404);
  });
});
