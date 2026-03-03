# OBS BrowserSource セットアップガイド

StreamTalkerのリップシンクアニメーションをOBSに表示するための設定手順です。

---

## 前提条件

- StreamTalkerがビルド済みであること（`npm run build` が完了していること）
- OBS Studio がインストールされていること

---

## 注意事項

**StreamTalkerを先に起動してからOBSでBrowserSourceを読み込んでください。**

StreamTalkerが起動していない状態でOBSのBrowserSourceを更新すると、
`http://localhost:3000` に接続できず、空白または「接続できません」と表示されます。

---

## 手順

### 1. StreamTalkerを起動する

```bash
# ビルド済みの場合（本番起動）
npm start

# または開発モードで起動（HTTPサーバーは起動しない。Vite dev serverを使用）
npm run dev
```

本番起動（`npm start`）の場合、StreamTalkerは自動的に `http://localhost:3000` でPreviewウィンドウのHTMLを配信します。

### 2. OBSにBrowserSourceを追加する

1. OBS Studioを開く
2. 「ソース」パネルの下にある「+」ボタンをクリック
3. 「ブラウザ」を選択
4. ソース名を入力（例: `StreamTalker`）して「OK」をクリック

### 3. BrowserSourceの設定を入力する

以下の値を入力してください:

| 設定項目 | 値 |
|---------|-----|
| **URL** | `http://localhost:3000` |
| **幅** | `512` |
| **高さ** | `512` |
| **FPS** | `30`（必要に応じて `60` に変更可） |

> 幅・高さは使用する画像ファイルのサイズに合わせて変更してください。
> アスペクト比が一致していれば、画像はCanvasいっぱいに描画されます。

### 4. 「透明度を有効にする」をONにする

BrowserSourceの設定画面で「透明度を有効にする」（英語UIでは「Allow transparency」）にチェックを入れてください。

これにより、キャラクター画像の背景が透明になり、OBSの他のソースや背景と合成できます。

### 5. カスタムCSSを設定する

「カスタムCSS」欄に以下を入力してください:

```css
body { background: transparent !important; }
```

これにより、HTML側の背景も確実に透過されます。

### 6. 「OK」をクリックして確定する

設定を保存すると、OBSのプレビュー画面にキャラクターが表示されます。

---

## 確認事項

- StreamTalkerのPreviewウィンドウに画像が表示されていること
- マイクに向かって話すと口が動くこと
- OBSのプレビューで背景が透明になっていること（チェッカーボードパターンが見える）

---

## トラブルシューティング

### 「ページが表示されない」場合

1. StreamTalkerが起動しているか確認する
2. ブラウザで `http://localhost:3000` にアクセスして確認する
3. ファイアウォールが `127.0.0.1:3000` への接続を遮断していないか確認する

### 背景が透明にならない場合

1. BrowserSourceの設定で「透明度を有効にする」がONになっているか確認する
2. カスタムCSSに `body { background: transparent !important; }` が入力されているか確認する
3. BrowserSourceを右クリック → 「更新」を試す

### 開発モード（`npm run dev`）で使用する場合

開発モードでは `http://localhost:3000` ではなく、Vite dev serverの `http://localhost:5173` を使用します。

OBSのBrowserSourceのURLを以下に変更してください:
- 開発時: `http://localhost:5173/src/renderer/index.html`
- 本番時: `http://localhost:3000`

---

## OBS設定値まとめ（確定版）

| 項目 | 値 | 備考 |
|------|-----|------|
| URL（本番） | `http://localhost:3000` | StreamTalkerのHTTPサーバー |
| URL（開発） | `http://localhost:5173/src/renderer/index.html` | Vite dev server |
| 幅 | `512` px | 画像サイズに合わせて変更可 |
| 高さ | `512` px | 画像サイズに合わせて変更可 |
| FPS | `30` | 60に変更可能 |
| 透明度を有効にする | ON | 必須 |
| カスタムCSS | `body { background: transparent !important; }` | 必須 |
