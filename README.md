# ✂️ Video Size Cutter

Discord や SNS に送る動画を、指定サイズ（10MB・20MB など）に抑えて保存できる動画圧縮ツールです。

## なにができる？

- 🎬 動画をドラッグ＆ドロップするだけ
- 📏 10MB / 20MB / 25MB / 50MB のプリセット、または任意の MB を指定
- 🖥️ 解像度（1080p〜720p など）と FPS も調整できる
- 🔒 全部ブラウザ内（ffmpeg.wasm）で処理するから、動画がサーバーに送信されることはない
- 🎞️ MP4（H.264）形式で出力

## 使い方

1. 動画をドラッグ＆ドロップ（またはクリックして選択）
2. 目標サイズ・解像度・FPS を設定
3. 「圧縮を開始」を押す
4. 完了したら「ダウンロード」で保存

## 技術

- **ffmpeg.wasm** — WebAssembly で動く ffmpeg。サーバーなしで動画を変換
- 目標サイズからビットレートを逆算してサイズを狙う
- ffmpeg-core はリポジトリ内で自前ホスト（外部CDNに依存しない）

## 開発

Node.js が必要です。

```bash
npm install     # 依存をインストール
npm run dev     # ローカル開発サーバー（http://localhost:5173）
npm run build   # dist/ にビルド
npm run preview # ビルド結果を確認
```

## ライセンス

MIT
