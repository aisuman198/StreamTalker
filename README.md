# StreamTalker

マイク入力に同期してキャラクターがくちぱくするリップシンクアニメーションアプリです。
OBS の BrowserSource を使って配信画面にオーバーレイとして組み込むことを前提に設計されています。

---

## 主な機能

- マイク入力の音量に応じてキャラクターの口が開閉する（リップシンク）
- 自然なタイミングで目が瞬きする（瞬きステートマシン）
- 透過 PNG 画像を使ったアニメーション（OBS で背景が透ける）
- OBS BrowserSource に `http://localhost:3000` で配信
- 設定ウィンドウからマイク選択・画像設定・感度調整が可能
- 設定は自動保存（アプリを再起動しても維持される）

---

## 必要環境

| 項目 | 要件 |
|------|------|
| OS | macOS |
| Node.js | 20 以上 |
| OBS Studio | 任意バージョン（BrowserSource 対応版） |

---

## インストール

```bash
git clone https://github.com/aisuman198/StreamTalker.git
cd StreamTalker
npm install
```

---

## 起動方法

### 本番モードで起動する場合（通常の使用）

```bash
# TypeScript のビルド + Vite ビルドを実行
npm run build

# Electron アプリを起動（HTTPサーバーが port 3000 で起動する）
npm start
```

起動後、ターミナルに `Preview server running at http://localhost:3000` が表示されます。

### 開発モードで起動する場合

```bash
npm run dev
```

Vite の開発サーバー（`localhost:5173`）と Electron が同時に起動します。
開発時の OBS BrowserSource URL は `http://localhost:5173/src/renderer/index.html` を使用してください。

---

## 画像素材の準備

StreamTalker はキャラクターの透過 PNG 画像を使ってアニメーションを表示します。
画像の仕様・命名規則・作成手順の詳細は [`assets/images/IMAGE_GUIDE.md`](assets/images/IMAGE_GUIDE.md) を参照してください。

### 最小構成（2枚）

最低限 2 枚の透過 PNG を用意し、`assets/images/default/` に配置することで動作確認できます。

| ファイル名 | 用途 |
|-----------|------|
| `mouth-closed_eye-open.png` | ニュートラル（無音時） |
| `mouth-open_eye-open.png` | 発話中 |

- 推奨解像度: 512×512 px
- 形式: PNG（アルファチャンネル付き透過 PNG）
- 背景は完全透過にしてください

画像を用意したら、アプリ起動後にコントロールウィンドウの「画像設定」からファイルを指定してください。

---

## OBS の設定

詳細な手順は [`docs/obs-setup.md`](docs/obs-setup.md) を参照してください。

### 要点

1. OBS でソースを追加 → 「ブラウザ」を選択
2. URL に `http://localhost:3000` を入力
3. 幅: `512`、高さ: `512` を設定
4. 「透明度を有効にする」をチェック ON
5. カスタム CSS に以下を入力して OK

```css
body { background: transparent !important; }
```

StreamTalker（`npm start`）を起動した状態で OBS を開くと、キャラクターが表示されます。

---

## コントロールウィンドウの使い方

`npm start` または `npm run dev` で起動すると「StreamTalker - 設定」ウィンドウが開きます。

| 設定項目 | 説明 |
|---------|------|
| マイク選択 | 使用するマイクデバイスを選択する。「デフォルトデバイス」はシステムのデフォルトマイクを使用 |
| 画像設定 | 口・目の状態（9パターン）に対応する画像ファイルを設定する。必須は口閉・目開と口開・目開の2枚 |
| 音量閾値 | 口が開くとみなす音量の閾値（0.01〜0.5）。値を下げると感度が上がる |
| 平滑化係数 | 音量変化の滑らかさ（0〜1）。値を上げると反応が鈍くなる代わりにチラつきが減る |
| 瞬き間隔 | 瞬きの平均間隔（1000〜10000ms）。値を小さくすると頻繁に瞬きする |

設定を変更後、「保存」ボタンを押すと設定が永続化されます。

---

## ライセンス

[Apache 2.0](LICENSE)
