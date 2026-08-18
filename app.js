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
let sourceFile = null;
let sourceUrl = null;
let sourceVideo = null;
let sourceMeta = null;

function formatBytes(bytes) {
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
  if (!file.type.startsWith("video/")) {
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
    sourceMeta = {
      duration: sourceVideo.duration,
      width: sourceVideo.videoWidth,
      height: sourceVideo.videoHeight,
    };
    showSettings();
  };
}

function showSettings() {
  const { duration, width, height } = sourceMeta;
  fileInfo.innerHTML =
    '<span class="name">' + escapeHtml(sourceFile.name) + "</span>" +
    '<span class="meta">' + formatBytes(sourceFile.size) + " ・ " +
    width + "×" + height + " ・ " + formatDuration(duration) + "</span>";

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
async function loadFFmpeg(onProgress) {
  if (ffmpeg) return ffmpeg;
  if (ffmpegLoading) {
    while (ffmpegLoading) await new Promise((r) => setTimeout(r, 100));
    return ffmpeg;
  }
  ffmpegLoading = true;
  try {
    const baseURL = import.meta.env.BASE_URL;
    const coreURL = baseURL + "ffmpeg/ffmpeg-core.js";
    const wasmURL = baseURL + "ffmpeg/ffmpeg-core.wasm";

    onProgress("エンジン読み込み中…");

    const newFFmpeg = new FFmpeg();
    newFFmpeg.on("log", ({ message }) => {
      console.log(message);
    });
    newFFmpeg.on("progress", ({ progress, time }) => {
      if (typeof progress === "number") {
        const pct = Math.round(progress * 100);
        onProgress("圧縮中… " + pct + "%", formatDuration(time));
      }
    });
    await newFFmpeg.load({
      coreURL: await toBlobURL(coreURL, "text/javascript"),
      wasmURL: await toBlobURL(wasmURL, "application/wasm"),
    });
    ffmpeg = newFFmpeg;
    return ffmpeg;
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
  setProgress(0, "準備中…");

  try {
    const result = await compressVideo(targetBytes);
    showResult(result.blob, result.meta);
  } catch (err) {
    console.error(err);
    alert("圧縮に失敗しました: " + err.message);
    settingsCard.hidden = false;
    progressCard.hidden = true;
  } finally {
    startBtn.disabled = false;
  }
}

function setProgress(pct, text, note) {
  progressBar.style.width = pct + "%";
  progressText.textContent = text;
  if (note) progressNote.textContent = note;
}

function computeTargets(targetBytes) {
  const { duration, width, height } = sourceMeta;
  const maxW = parseInt(resolutionSelect.value, 10);
  let outW = width;
  let outH = height;
  if (maxW && width > maxW) {
    outW = maxW;
    outH = Math.round((height * maxW) / width);
    if (outH % 2 !== 0) outH += 1;
  }
  if (outW % 2 !== 0) outW += 1;

  const fps = parseInt(fpsSelect.value, 10);
  const safeDuration = Math.max(duration, 1);

  // 目標サイズからビットレートを逆算（音声分を差し引き、安全マージン）
  const audioBitrate = 96 * 1024; // 96 kbps
  const margin = 0.92;
  const videoBitrate = Math.max(
    100 * 1024,
    ((targetBytes * margin - audioBitrate * safeDuration) * 8) / safeDuration
  );

  return { outW, outH, fps, videoBitrate, audioBitrate };
}

async function compressVideo(targetBytes) {
  const { outW, outH, fps, videoBitrate } = computeTargets(targetBytes);
  const ext = sourceFile.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "mp4";

  const f = await loadFFmpeg((pct, note) => setProgress(0, pct, note));

  const inputName = "input." + ext;
  const outputName = "output.mp4";

  setProgress(0, "読み込み中…");
  await f.writeFile(inputName, await fetchFile(sourceFile));
  await f.deleteFile(outputName);

  const args = [
    "-i", inputName,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-maxrate", String(Math.round(videoBitrate)),
    "-bufsize", String(Math.round(videoBitrate * 2)),
    "-c:a", "aac",
    "-b:a", "96k",
    "-r", String(fps),
    "-vf", "scale=" + outW + ":" + outH,
    "-movflags", "+faststart",
    "-y",
    outputName,
  ];

  const ret = await f.exec(args);
  if (ret !== 0) {
    throw new Error("ffmpeg がエラーで終了しました（コード " + ret + "）。対応していない形式の可能性があります。");
  }

  const data = await f.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });
  await f.deleteFile(inputName);
  await f.deleteFile(outputName);

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
