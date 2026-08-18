# ✂️ Video Size Cutter

Discord や SNS に送る動画を、指定サイズ（10MB・20MB など）に抑えて保存できるブラウザ内完結の動画圧縮ツールです。

## 特徴

- 🎬 **ブラウザ内で完結** — 動画がサーバーに送信されることは一切ありません（プライバシー安全）
- 📏 **目標サイズ指定** — 10MB / 20MB / 25MB / 50MB のプリセット、または任意の MB を指定
- 🖥️ **解像度・FPS 調整** — 1080p / 720p / 480p / 360p とフレームレートを選択可能
- ⚡ **サーバー不要** — GitHub Pages でそのまま公開・利用できます

## 使い方

1. 動画をドラッグ＆ドロップ（またはクリックして選択）
2. 目標サイズ・解像度・FPS を設定
3. 「圧縮を開始」を押す
4. 完了したら「ダウンロード」で保存

## 技術

- **Canvas API** — 動画を描画して再エンコード
- **MediaRecorder API** — WebM 形式で録画
- 目標サイズからビットレートを逆算してサイズを狙います

> 注意: ブラウザの MediaRecorder は主に **WebM** 形式を出力します。MP4 出力はブラウザ依存です。Discord は WebM も受け付けます。

## ローカルで動かす（Node.js）

```bash
# このフォルダで
npx serve .
# または
npx http-server .
```

ブラウザで `http://localhost:3000`（serve）または `http://localhost:8080`（http-server）を開きます。

## GitHub Pages で公開

1. このリポジトリを GitHub にプッシュ
2. リポジトリの **Settings → Pages**
3. Source を **Deploy from a branch**、ブランチを `main`、フォルダを `/ (root)` に設定
4. 保存すると `https://<ユーザー名>.github.io/video-size-cutter/` で公開されます

## ライセンス

MIT
