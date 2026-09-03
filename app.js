import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

"use strict";

const $ = (sel) => document.querySelector(sel);

const dropzone = $("#dropzone");
const fileInput = $("#fileInput");
const uploadCard = $("#uploadCard");
const settingsCard = $("#settingsCard");
const progressCard = $("#progressCard");
const resultCard = $("#resultCard");
const fileInfo = $("#fileInfo");
const targetSizeInput = $("#targetSize");
const resolutionSelect = $("#resolution");
const fpsSelect = $("#fps");
const startBtn = $("#startBtn");
const resetBtn = $("#resetBtn");
const progressBar = $("#progressBar");
const progressText = $("#progressText");
const progressNote = $("#progressNote");
const resultStats = $("#resultStats");
const resultVideo = $("#resultVideo");
const downloadBtn = $("#downloadBtn");
const againBtn = $("#againBtn");

let ffmpeg = null;
let ffmpegLoading = false;
let onEncodeProgress = null;
let lastLogs = [];
let sourceFile = null;
let sourceUrl = null;
let sourceVideo = null;
let sourceMeta = null;

const AUDIO_BPS = 96 * 1000; // 96 kbps（ビット/秒）
const SIZE_MARGIN = 0.95; // コンテナ overhead 分の余裕

function formatBytes(bytes) {
  if (!isFinite(bytes) || bytes < 0) return "不明";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(sec) {
  if (!isFinite(sec)) return "不明";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

/* ---------- ファイル選択 ---------- */
const VIDEO_EXTS = new Set([
  "mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "ogg",
  "3gp", "3g2", "ts", "m2ts", "mts", "flv", "wmv", "mpg", "mpeg",
]);

function getExt(name) {
  return (name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
}

function isVideoFile(file) {
  if (file.type && file.type.startsWith("video/")) return true;
  // ブラウザが MIME を空欄にする形式（.mov / .mkv 等）への対応
  return VIDEO_EXTS.has(getExt(file.name));
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  if (!isVideoFile(file)) {
    alert("動画ファイルを選択してください。");
    return;
  }
  sourceFile = file;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);

  sourceVideo = document.createElement("video");
  sourceVideo.preload = "metadata";
  sourceVideo.src = sourceUrl;
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;

  sourceVideo.onloadedmetadata = () => {
    const d = sourceVideo.duration;
    if (isFinite(d) && d > 0) {
      finishLoad(d);
    } else {
      // WebM 等で duration が Infinity になる場合の取得ハック
      const onSeeked = () => {
        sourceVideo.removeEventListener("seeked", onSeeked);
        sourceVideo.currentTime = 0;
        const fixed = sourceVideo.duration;
        finishLoad(isFinite(fixed) && fixed > 0 ? fixed : NaN);
      };
      sourceVideo.addEventListener("seeked", onSeeked);
      try {
        sourceVideo.currentTime = Number.MAX_SAFE_INTEGER;
      } catch (e) {
        finishLoad(NaN);
      }
      // seek が発火しない環境向けの保険
      setTimeout(() => {
        if (!sourceMeta) {
          sourceVideo.removeEventListener("seeked", onSeeked);
          const cur = sourceVideo.duration;
          finishLoad(isFinite(cur) && cur > 0 ? cur : NaN);
        }
      }, 5000);
    }
  };
  sourceVideo.onerror = () => {
    alert("この動画はブラウザで再生できない形式です。MP4 / WebM / MOV をお試しください。");
  };
}

function finishLoad(duration) {
  // 二重実行ガード（seek ハックと保険タイマーの両方が走るため）
  if (sourceMeta && sourceMeta.loaded) return;
  sourceMeta = {
    loaded: true,
    duration,
    width: sourceVideo.videoWidth,
    height: sourceVideo.videoHeight,
  };
  showSettings();
}

function showSettings() {
  const { duration, width, height } = sourceMeta;
  fileInfo.innerHTML =
    '<span class="name">' + escapeHtml(sourceFile.name) + "</span>" +
    '<span class="meta">' + formatBytes(sourceFile.size) + " ・ " +
    (width || "?") + "×" + (height || "?") + " ・ " + formatDuration(duration) + "</span>";

  uploadCard.hidden = true;
  settingsCard.hidden = false;
  progressCard.hidden = true;
  resultCard.hidden = true;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- サイズプリセット ---------- */
const presets = document.querySelectorAll(".preset");
presets.forEach((btn) => {
  btn.addEventListener("click", () => {
    presets.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    targetSizeInput.value = btn.dataset.mb;
  });
});
targetSizeInput.addEventListener("input", () => {
  presets.forEach((b) => b.classList.remove("active"));
});

/* ---------- リセット ---------- */
function resetAll() {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceFile = null;
  sourceUrl = null;
  sourceVideo = null;
  sourceMeta = null;
  fileInput.value = "";
  uploadCard.hidden = false;
  settingsCard.hidden = true;
  progressCard.hidden = true;
  resultCard.hidden = true;
}
resetBtn.addEventListener("click", resetAll);
againBtn.addEventListener("click", resetAll);

/* ---------- ffmpeg 読み込み ---------- */
async function loadFFmpeg(onStatus) {
  if (ffmpeg) return ffmpeg;
  if (ffmpegLoading) {
    while (ffmpegLoading) await new Promise((r) => setTimeout(r, 100));
    if (ffmpeg) return ffmpeg;
    // 読み込み失敗後の再試行に落ちる
  }
  ffmpegLoading = true;
  try {
    const baseURL = import.meta.env.BASE_URL;
    const coreURL = baseURL + "ffmpeg/ffmpeg-core.js";
    const wasmURL = baseURL + "ffmpeg/ffmpeg-core.wasm";

    onStatus("エンジン読み込み中…");

    const newFFmpeg = new FFmpeg();
    newFFmpeg.on("log", ({ message }) => {
      console.log(message);
      lastLogs.push(message);
      if (lastLogs.length > 300) lastLogs.shift();
    });
    newFFmpeg.on("progress", ({ progress, time }) => {
      if (typeof onEncodeProgress === "function") {
        onEncodeProgress(progress, time);
      }
    });
    await newFFmpeg.load({
      coreURL: await toBlobURL(coreURL, "text/javascript"),
      wasmURL: await toBlobURL(wasmURL, "application/wasm"),
    });
    ffmpeg = newFFmpeg;
    return ffmpeg;
  } catch (e) {
    throw new Error("ffmpeg エンジンの読み込みに失敗しました: " + e.message);
  } finally {
    ffmpegLoading = false;
  }
}

/* ---------- 圧縮 ---------- */
startBtn.addEventListener("click", startCompress);

async function startCompress() {
  const targetMB = parseFloat(targetSizeInput.value);
  if (!targetMB || targetMB <= 0) {
    alert("目標サイズを正しく入力してください。");
    return;
  }
  const targetBytes = targetMB * 1024 * 1024;

  startBtn.disabled = true;
  settingsCard.hidden = true;
  progressCard.hidden = false;
  resultCard.hidden = true;
  setProgress(0, "準備中…", "");
  lastLogs = [];

  try {
    const result = await compressVideo(targetBytes);
    showResult(result.blob, result.meta);
  } catch (err) {
    console.error(err);
    const tail = lastLogs.slice(-30).join("\n");
    alert(
      "圧縮に失敗しました: " + err.message +
      "\n\nヒント: HDR・10bit 動画や特殊なコーデックの場合も自動変換しますが、" +
      "それでも失敗する場合は解像度を下げる・FPSを下げる・目標サイズを大きくしてお試しください。" +
      (tail ? "\n\n--- ffmpeg ログ ---\n" + tail : "")
    );
    settingsCard.hidden = false;
    progressCard.hidden = true;
  } finally {
    startBtn.disabled = false;
    onEncodeProgress = null;
  }
}

function setProgress(pct, text, note) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  progressBar.style.width = clamped + "%";
  progressText.textContent = text;
  if (typeof note === "string") progressNote.textContent = note;
}

function evenDown(n) {
  return Math.max(2, Math.floor(n / 2) * 2);
}

function computeOutputSize() {
  let width = sourceMeta.width;
  let height = sourceMeta.height;
  // メタデータが取れていない場合は 1280x720 を仮定（後段の probe で補正しない）
  if (!width || !height) return { outW: 1280, outH: 720 };
  const maxW = parseInt(resolutionSelect.value, 10);
  let outW = width;
  let outH = height;
  if (Number.isFinite(maxW) && maxW > 0 && width > maxW) {
    outW = maxW;
    outH = Math.round((height * maxW) / width);
  }
  // H.264 は偶数サイズ必須。切り上げると引き伸ばされるので切り捨てる
  return { outW: evenDown(outW), outH: evenDown(outH) };
}

/** 目標サイズから映像ビットレート（bps）を逆算する */
function bitrateForSize(targetBytes, durationSec) {
  const safe = isFinite(durationSec) && durationSec > 0 ? durationSec : 60;
  const totalBits = targetBytes * 8 * SIZE_MARGIN;
  const audioBits = AUDIO_BPS * safe;
  const bps = Math.round((totalBits - audioBits) / safe);
  return {
    duration: safe,
    videoBps: Math.max(100 * 1000, Math.min(50 * 1000 * 1000, bps)),
  };
}

function parseDurationFromLogs(logs) {
  // "Duration: 00:01:23.45" を探す（最後に出たものを採用）
  for (let i = logs.length - 1; i >= 0; i--) {
    const m = logs[i].match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m) {
      return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
    }
  }
  return NaN;
}

async function compressVideo(targetBytes) {
  const { outW, outH } = computeOutputSize();
  const fps = parseInt(fpsSelect.value, 10) || 30;
  let ext = getExt(sourceFile.name);
  if (!/^[a-z0-9]{2,5}$/.test(ext)) ext = "mp4";

  const f = await loadFFmpeg((text) => setProgress(3, text, ""));

  const inputName = "input." + ext;
  const outputName = "output.mp4";

  setProgress(5, "読み込み中…", "");
  try {
    await f.writeFile(inputName, await fetchFile(sourceFile));
  } catch (e) {
    throw new Error("入力ファイルの書き込みに失敗しました（ファイルが大きすぎる可能性）: " + e.message);
  }
  try {
    await f.deleteFile(outputName);
  } catch (e) {
    // 出力ファイルがまだ無いだけなので無視
  }

  // ブラウザで duration が取れない動画向けに ffmpeg の probe で補完
  let duration = sourceMeta.duration;
  if (!isFinite(duration) || duration <= 0) {
    try {
      await f.exec(["-i", inputName]);
    } catch (e) {
      // -i のみ（出力なし）は必ず非ゼロ終了するので無視
    }
    duration = parseDurationFromLogs(lastLogs);
  }
  const { videoBps } = bitrateForSize(targetBytes, duration);

  onEncodeProgress = (progress, time) => {
    if (typeof progress === "number" && isFinite(progress)) {
      const pct = Math.round(progress * 100);
      setProgress(pct, "圧縮中… " + pct + "%", formatDuration(time / 1000000));
    } else if (typeof time === "number") {
      setProgress(50, "圧縮中…", formatDuration(time / 1000000));
    }
  };

  // -crf は使わない（-b:v/-maxrate と併用するとサイズ狙いが効かない）。
  // format=yuv420p は HDR・10bit（iPhone等）入力を 8bit H.264 で
  // エンコードできるようにするための必須変換（無いと exit code 1 になる）。
  const args = [
    "-i", inputName,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", String(videoBps),
    "-maxrate", String(videoBps),
    "-bufsize", String(videoBps * 2),
    "-pix_fmt", "yuv420p",
    "-vf", "scale=" + outW + ":" + outH + ":flags=bicubic,format=yuv420p",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "96k",
    "-ac", "2",
    "-ar", "48000",
    "-movflags", "faststart",
    "-y",
    outputName,
  ];

  const ret = await f.exec(args);
  if (ret !== 0) {
    const tail = lastLogs.slice(-15).join("\n");
    throw new Error(
      "ffmpeg がエラーで終了しました（コード " + ret + "）。対応していない形式の可能性があります。" +
      (tail ? "\n" + tail : "")
    );
  }

  let data;
  try {
    data = await f.readFile(outputName);
  } catch (e) {
    throw new Error("出力ファイルの読み取りに失敗しました: " + e.message);
  }
  let blob;
  if (typeof data === "string") {
    blob = new Blob([data], { type: "video/mp4" });
  } else {
    // data.buffer をそのまま使うと view 範囲外のゴミが混ざることがあるためコピーする
    const copy = data.slice().buffer;
    blob = new Blob([copy], { type: "video/mp4" });
  }
  try { await f.deleteFile(inputName); } catch (e) { /* 無視 */ }
  try { await f.deleteFile(outputName); } catch (e) { /* 無視 */ }

  return { blob, meta: { outW, outH } };
}

function showResult(blob, meta) {
  const ratio = blob.size / sourceFile.size;
  const savedPct = Math.max(0, Math.round((1 - ratio) * 100));

  resultStats.innerHTML =
    stat("元サイズ", formatBytes(sourceFile.size)) +
    stat("圧縮後", formatBytes(blob.size)) +
    stat("削減", savedPct + "%") +
    stat("解像度", meta.outW + "×" + meta.outH);

  const url = URL.createObjectURL(blob);
  resultVideo.src = url;
  downloadBtn.href = url;
  downloadBtn.download = makeOutputName(sourceFile.name);

  progressCard.hidden = true;
  resultCard.hidden = false;
}

function stat(label, value) {
  return '<div class="stat"><div class="value">' + value + "</div><div class=\"label\">" + label + "</div></div>";
}

function makeOutputName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return base + "_compressed.mp4";
}
