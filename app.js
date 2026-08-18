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

let sourceFile = null;
let sourceUrl = null;
let sourceVideo = null;
let sourceMeta = null;
let currentMime = "";

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
    const blob = await compressVideo(targetBytes);
    showResult(blob);
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
  const margin = 0.9;
  const videoBitrate = Math.max(
    100 * 1024,
    ((targetBytes * margin - audioBitrate * safeDuration) * 8) / safeDuration
  );

  return { outW, outH, fps, videoBitrate, audioBitrate };
}

function compressVideo(targetBytes) {
  return new Promise((resolve, reject) => {
    const { outW, outH, fps, videoBitrate, audioBitrate } = computeTargets(targetBytes);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    const stream = canvas.captureStream(fps);

    // 音声を引き継ぐ
    const audioTracks = sourceVideo.captureStream ? sourceVideo.captureStream().getAudioTracks() : [];
    audioTracks.forEach((t) => stream.addTrack(t));

    const mime = pickMime();
    currentMime = mime;
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: Math.round(videoBitrate),
      audioBitsPerSecond: Math.round(audioBitrate),
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onerror = (e) => reject(new Error("録画エラー: " + (e.error || "不明")));

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      sourceVideo.pause();
      sourceVideo.removeAttribute("src");
      sourceVideo.load();
      resolve(blob);
    };

    const totalFrames = Math.max(1, Math.round(sourceMeta.duration * fps));
    let frame = 0;

    const drawFrame = () => {
      ctx.drawImage(sourceVideo, 0, 0, outW, outH);
      frame++;
      const pct = Math.min(100, (frame / totalFrames) * 100);
      setProgress(
        pct,
        "圧縮中… " + Math.round(pct) + "%",
        "解像度 " + outW + "×" + outH + " ・ " + fps + " fps"
      );
    };

    sourceVideo.onseeked = () => {
      drawFrame();
      if (sourceVideo.currentTime < sourceMeta.duration - 0.05) {
        sourceVideo.currentTime += 1 / fps;
      } else {
        recorder.stop();
      }
    };

    sourceVideo.onerror = () => reject(new Error("動画の読み込みに失敗しました。"));

    recorder.start();
    sourceVideo.currentTime = 0;
  });
}

function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function mimeToExt(mime) {
  if (!mime) return "webm";
  const base = mime.split(";")[0].trim();
  if (base === "video/mp4") return "mp4";
  if (base === "video/webm") return "webm";
  return base.replace("video/", "");
}

function showResult(blob) {
  const { duration, width, height } = sourceMeta;
  const ratio = blob.size / sourceFile.size;
  const savedPct = Math.max(0, Math.round((1 - ratio) * 100));

  resultStats.innerHTML =
    stat("元サイズ", formatBytes(sourceFile.size)) +
    stat("圧縮後", formatBytes(blob.size)) +
    stat("削減", savedPct + "%");

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
  const ext = mimeToExt(currentMime);
  return base + "_compressed." + ext;
}
