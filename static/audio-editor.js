const params = new URLSearchParams(window.location.search);
const context = {
  projectPath: params.get("projectPath") || "",
  padKey: params.get("padKey") || "",
  soundIndex: Number.parseInt(params.get("soundIndex") || "0", 10) || 0,
  suggestedName: params.get("suggestedName") || "novo_clip.wav",
};
const MIN_AUDIBLE_SAMPLE = 0.0025;
const MIN_CLIP_DURATION_SECONDS = 0.001;

const state = {
  audioContext: null,
  channel: new BroadcastChannel("unipack-audio-editor"),
  audioBuffer: null,
  sourceName: "",
  sourceBlob: null,
  sourceMimeType: "",
  selectionStart: 0,
  selectionEnd: 0,
  previewAudio: new Audio(),
  previewUrl: "",
  dragMode: null,
  dragStartTime: 0,
  overviewAmplitudes: null,
  zoom: 1,
  stretch: 1.5,
  viewStartOverride: null,
  previewSource: null,
  playbackStartedAt: 0,
  playbackFrom: 0,
  playbackDuration: 0,
  playheadFrame: 0,
  baseCanvasWidth: 1400,
  canvasHeight: 360,
  dpr: Math.max(1, window.devicePixelRatio || 1),
};

state.previewAudio.preload = "auto";

const refs = {
  padPill: document.querySelector("#pad-pill"),
  projectPill: document.querySelector("#project-pill"),
  fileInput: document.querySelector("#file-input"),
  clipName: document.querySelector("#clip-name"),
  startInput: document.querySelector("#start-input"),
  endInput: document.querySelector("#end-input"),
  zoomInput: document.querySelector("#zoom-input"),
  stretchInput: document.querySelector("#stretch-input"),
  previewButton: document.querySelector("#preview-button"),
  saveButton: document.querySelector("#save-button"),
  fullButton: document.querySelector("#full-button"),
  zoomFitButton: document.querySelector("#zoom-fit-button"),
  status: document.querySelector("#status"),
  selectionLength: document.querySelector("#selection-length"),
  zoomValue: document.querySelector("#zoom-value"),
  stretchValue: document.querySelector("#stretch-value"),
  windowValue: document.querySelector("#window-value"),
  playheadValue: document.querySelector("#playhead-value"),
  panLeftButton: document.querySelector("#pan-left-button"),
  panSlider: document.querySelector("#pan-slider"),
  panRightButton: document.querySelector("#pan-right-button"),
  canvas: document.querySelector("#spectrogram"),
};

const canvasContext = refs.canvas.getContext("2d");
refs.padPill.textContent = context.padKey ? `Pad ${context.padKey}` : "Pad nao definido";
refs.projectPill.textContent = context.projectPath ? "Projeto carregado" : "Sem projeto";
refs.clipName.value = context.suggestedName;

refs.fileInput.addEventListener("click", () => {
  refs.fileInput.value = "";
});
refs.fileInput.addEventListener("change", async () => {
  const [file] = refs.fileInput.files || [];
  if (file) {
    await loadAudio(file);
  }
});

refs.startInput.addEventListener("input", () => {
  if (!state.audioBuffer) return;
  state.selectionStart = clampTime(parseFloatSafe(refs.startInput.value, 0), 0, state.selectionEnd);
  syncInputs();
  renderSpectrogram();
});

refs.endInput.addEventListener("input", () => {
  if (!state.audioBuffer) return;
  state.selectionEnd = clampTime(parseFloatSafe(refs.endInput.value, state.audioBuffer.duration), state.selectionStart, state.audioBuffer.duration);
  syncInputs();
  renderSpectrogram();
});

refs.zoomInput.addEventListener("input", () => {
  state.zoom = Math.max(1, parseFloatSafe(refs.zoomInput.value, 1));
  clampViewAfterZoom();
  renderSpectrogram();
});

refs.stretchInput.addEventListener("input", () => {
  state.stretch = Math.max(1, parseFloatSafe(refs.stretchInput.value, 1.5));
  resizeCanvas();
  renderSpectrogram();
});

refs.previewButton.addEventListener("click", async () => previewSelection());
refs.saveButton.addEventListener("click", async () => saveSelection());
refs.fullButton.addEventListener("click", () => {
  if (!state.audioBuffer) return;
  state.selectionStart = 0;
  state.selectionEnd = state.audioBuffer.duration;
  state.viewStartOverride = 0;
  syncInputs();
  renderSpectrogram();
});
refs.zoomFitButton.addEventListener("click", () => zoomToSelection());
refs.panLeftButton.addEventListener("click", () => panWindow(-1));
refs.panRightButton.addEventListener("click", () => panWindow(1));
refs.panSlider.addEventListener("input", () => {
  state.viewStartOverride = parseFloatSafe(refs.panSlider.value, 0);
  renderSpectrogram();
});

refs.canvas.addEventListener("mousedown", (event) => handlePointerDown(event));
window.addEventListener("mousemove", (event) => handlePointerMove(event));
window.addEventListener("mouseup", () => handlePointerUp());
window.addEventListener("resize", () => {
  resizeCanvas();
  renderSpectrogram();
});

resizeCanvas();
renderSpectrogram();

async function loadAudio(file) {
  try {
    state.audioContext ||= new AudioContext();
    const arrayBuffer = await file.arrayBuffer();
    state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer.slice(0));
    state.sourceName = file.name;
    state.sourceBlob = file.slice(0, file.size, file.type || "application/octet-stream");
    state.sourceMimeType = file.type || "application/octet-stream";
    const audibleRegion = findAudibleRegion(state.audioBuffer);
    state.selectionStart = audibleRegion?.start ?? 0;
    state.selectionEnd = audibleRegion?.end ?? state.audioBuffer.duration;
    state.viewStartOverride = 0;
    refs.clipName.value = suggestImportFileName(file.name);
    refs.fileInput.value = "";
    setStatus(`Audio carregado: ${file.name} (${formatSeconds(state.audioBuffer.duration)} s). Arraste nas faixas para escolher o corte.`, "success");
    buildAudioOverview();
    syncInputs();
    renderSpectrogram();
  } catch (error) {
    setStatus(error.message || "Nao foi possivel carregar o audio.", "error");
  }
}

function buildAudioOverview() {
  if (!state.audioBuffer) return;
  const width = 5000;
  const mono = mixToMono(state.audioBuffer);
  const windowSize = Math.max(64, Math.floor(mono.length / width));
  const amplitudes = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const start = Math.floor((x / width) * mono.length);
    const end = Math.min(mono.length, start + windowSize);
    let peak = 0;
    let energy = 0;
    for (let i = start; i < end; i += 1) {
      const value = Math.abs(mono[i] || 0);
      if (value > peak) peak = value;
      energy += value;
    }
    const average = end > start ? energy / (end - start) : 0;
    amplitudes[x] = Math.min(1, peak * 0.7 + average * 1.4);
  }
  state.overviewAmplitudes = amplitudes;
}

function renderSpectrogram() {
  const width = currentCanvasWidth();
  const height = state.canvasHeight;
  canvasContext.clearRect(0, 0, width, height);

  if (!state.audioBuffer || !state.overviewAmplitudes) {
    canvasContext.fillStyle = "#0e1a24";
    canvasContext.fillRect(0, 0, width, height);
    canvasContext.fillStyle = "#8ca7b7";
    canvasContext.font = "20px Avenir Next, sans-serif";
    canvasContext.fillText("Importe um audio para ver as faixas", 28, 42);
    return;
  }

  const view = getViewWindow();
  drawAudioBands(view, width, height);

  const startX = timeToX(state.selectionStart, view);
  const endX = timeToX(state.selectionEnd, view);
  canvasContext.fillStyle = "rgba(255, 209, 102, 0.16)";
  canvasContext.fillRect(startX, 0, endX - startX, height);

  drawMarker(startX, "#55d6c2");
  drawMarker(endX, "#ff9d5c");
  drawTimeLabel(startX, state.selectionStart, "#55d6c2");
  drawTimeLabel(endX, state.selectionEnd, "#ff9d5c");
  drawPlaybackNeedle(view);
  updateViewMeta(view);
  updateNavigationControls(view);
}

function handlePointerDown(event) {
  if (!state.audioBuffer) return;
  const view = getViewWindow();
  const time = xToTime(pointerX(event), view);
  const startX = timeToX(state.selectionStart, view);
  const endX = timeToX(state.selectionEnd, view);
  const x = pointerX(event);

  if (Math.abs(x - startX) < 10) {
    state.dragMode = "start";
  } else if (Math.abs(x - endX) < 10) {
    state.dragMode = "end";
  } else {
    state.dragMode = "new";
    state.dragStartTime = time;
    state.selectionStart = time;
    state.selectionEnd = time;
  }
  renderSpectrogram();
}

function handlePointerMove(event) {
  if (!state.audioBuffer || !state.dragMode) return;
  const time = xToTime(pointerX(event), getViewWindow());
  if (state.dragMode === "start") {
    state.selectionStart = clampTime(time, 0, state.selectionEnd);
  } else if (state.dragMode === "end") {
    state.selectionEnd = clampTime(time, state.selectionStart, state.audioBuffer.duration);
  } else {
    state.selectionStart = Math.min(state.dragStartTime, time);
    state.selectionEnd = Math.max(state.dragStartTime, time);
  }
  syncInputs();
  renderSpectrogram();
}

function handlePointerUp() {
  if (!state.dragMode) return;
  const endedWithSelection = state.dragMode === "new" && selectionDuration() > 0.05;
  state.dragMode = null;
  syncInputs();
  renderSpectrogram();
  if (endedWithSelection) {
    window.setTimeout(async () => {
      if (window.confirm("Criar um corte nessa selecao agora?")) {
        await saveSelection();
      }
    }, 0);
  }
}

function syncInputs() {
  refs.startInput.value = formatSeconds(state.selectionStart);
  refs.endInput.value = formatSeconds(state.selectionEnd);
  refs.selectionLength.textContent = `${formatSeconds(selectionDuration())} s`;
}

async function previewSelection() {
  if (!state.audioBuffer) return;
  const currentDuration = selectionDuration();
  if (currentDuration < MIN_CLIP_DURATION_SECONDS) {
    setStatus("O corte esta muito pequeno. Ajuste inicio e fim antes de ouvir.", "error");
    return;
  }
  try {
    stopPreviewSource();
    state.audioContext ||= new AudioContext();
    if (state.audioContext.state === "suspended") {
      await state.audioContext.resume();
    }

    const playbackDuration = Math.max(
      MIN_CLIP_DURATION_SECONDS,
      Math.min(
        currentDuration,
        Math.max(MIN_CLIP_DURATION_SECONDS, state.audioBuffer.duration - state.selectionStart)
      )
    );
    const previewSource = state.audioContext.createBufferSource();
    previewSource.buffer = state.audioBuffer;
    previewSource.connect(state.audioContext.destination);

    state.previewSource = previewSource;
    state.playbackStartedAt = state.audioContext.currentTime;
    state.playbackFrom = state.selectionStart;
    state.playbackDuration = playbackDuration;
    startPlayheadLoop();

    previewSource.onended = () => {
      if (state.previewSource === previewSource) {
        stopPreviewSource();
        renderSpectrogram();
      }
    };

    previewSource.start(0, state.selectionStart, playbackDuration);
    setStatus("Tocando a selecao atual.", "success");
  } catch (error) {
    stopPreviewSource();
    setStatus(error.message || "Nao foi possivel tocar a selecao.", "error");
  }
}

async function saveSelection() {
  if (!state.audioBuffer) return;
  if (!context.projectPath || !context.padKey) {
    setStatus("Nao foi possivel identificar o pad/projeto de destino.", "error");
    return;
  }
  if (selectionDuration() < MIN_CLIP_DURATION_SECONDS) {
    setStatus("O corte esta muito pequeno. Ajuste inicio e fim antes de salvar.", "error");
    return;
  }

  try {
    const fileName = ensureWavFileName(refs.clipName.value || context.suggestedName);
    const body = {
      projectPath: context.projectPath,
      fileName,
      padKey: context.padKey,
      soundIndex: context.soundIndex,
    };

    if (state.sourceBlob) {
      body.sourceAudioBase64 = await blobToBase64(state.sourceBlob);
      body.sourceFileName = state.sourceName;
      body.sourceMimeType = state.sourceMimeType;
      body.selectionStart = state.selectionStart;
      body.selectionEnd = state.selectionEnd;
    } else {
      const clip = buildClipBuffer();
      const bytes = encodeAudioBufferToWavBytes(clip);
      body.audioBase64 = bytesToBase64(bytes);
    }

    const response = await fetch("/api/sound/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Falha ao salvar o corte");
    }

    state.channel.postMessage({
      type: "clip-created",
      projectPath: context.projectPath,
      padKey: context.padKey,
      soundIndex: context.soundIndex,
      importedFile: payload.importedFile,
      sound: payload.sound,
    });

    setStatus("Corte criado e enviado para o editor principal.", "success");
  } catch (error) {
    setStatus(error.message || "Falha ao criar o corte.", "error");
  }
}

function buildClipBuffer() {
  const source = state.audioBuffer;
  const sampleRate = source.sampleRate;
  const startFrame = Math.max(0, Math.floor(state.selectionStart * sampleRate));
  const endFrame = Math.max(startFrame + 1, Math.floor(state.selectionEnd * sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);
  state.audioContext ||= new AudioContext();
  const output = state.audioContext.createBuffer(source.numberOfChannels, frameCount, sampleRate);

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    // Copy samples manually for broader browser compatibility during clip export.
    const sourceSlice = source.getChannelData(channel).slice(startFrame, endFrame);
    output.getChannelData(channel).set(sourceSlice, 0);
  }
  return output;
}

function mixToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

function measureAudioRangePeak(audioBuffer, startTime, endTime) {
  if (!audioBuffer) return 0;
  const sampleRate = audioBuffer.sampleRate;
  const startFrame = Math.max(0, Math.floor(startTime * sampleRate));
  const endFrame = Math.min(audioBuffer.length, Math.max(startFrame + 1, Math.ceil(endTime * sampleRate)));
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = startFrame; i < endFrame; i += 1) {
      const value = Math.abs(data[i] || 0);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

function findAudibleRegion(audioBuffer) {
  if (!audioBuffer) return null;
  const mono = mixToMono(audioBuffer);
  let globalPeak = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const value = Math.abs(mono[i] || 0);
    if (value > globalPeak) globalPeak = value;
  }
  if (globalPeak < MIN_AUDIBLE_SAMPLE) return null;

  const threshold = Math.max(MIN_AUDIBLE_SAMPLE, globalPeak * 0.08);
  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < mono.length; i += 1) {
    if (Math.abs(mono[i] || 0) >= threshold) {
      startIndex = i;
      break;
    }
  }
  for (let i = mono.length - 1; i >= 0; i -= 1) {
    if (Math.abs(mono[i] || 0) >= threshold) {
      endIndex = i;
      break;
    }
  }
  if (startIndex < 0 || endIndex < startIndex) return null;

  const padFrames = Math.floor(audioBuffer.sampleRate * 0.03);
  return {
    start: Math.max(0, (startIndex - padFrames) / audioBuffer.sampleRate),
    end: Math.min(audioBuffer.duration, (endIndex + padFrames + 1) / audioBuffer.sampleRate),
  };
}

function drawAudioBands(view, width, height) {
  canvasContext.fillStyle = "#0d1721";
  canvasContext.fillRect(0, 0, width, height);

  const laneGap = 18;
  const laneHeight = height - laneGap * 2;
  const sourceStart = Math.floor((view.start / state.audioBuffer.duration) * state.overviewAmplitudes.length);
  const sourceEnd = Math.max(sourceStart + 1, Math.floor((view.end / state.audioBuffer.duration) * state.overviewAmplitudes.length));
  const visible = state.overviewAmplitudes.subarray(sourceStart, sourceEnd);
  const top = laneGap;
  const centerY = top + laneHeight / 2;

  canvasContext.fillStyle = "rgba(255,255,255,0.035)";
  canvasContext.fillRect(0, top, width, laneHeight);
  canvasContext.strokeStyle = "rgba(255,255,255,0.08)";
  canvasContext.beginPath();
  canvasContext.moveTo(0, centerY);
  canvasContext.lineTo(width, centerY);
  canvasContext.stroke();

  canvasContext.fillStyle = "rgba(85, 214, 194, 0.18)";
  canvasContext.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = Math.min(visible.length - 1, Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1)));
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY - amplitude * (laneHeight * 0.46);
    if (x === 0) {
      canvasContext.moveTo(x, y);
    } else {
      canvasContext.lineTo(x, y);
    }
  }
  for (let x = width - 1; x >= 0; x -= 1) {
    const sampleIndex = Math.min(visible.length - 1, Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1)));
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY + amplitude * (laneHeight * 0.46);
    canvasContext.lineTo(x, y);
  }
  canvasContext.closePath();
  canvasContext.fill();

  canvasContext.strokeStyle = "#55d6c2";
  canvasContext.lineWidth = 1.6;
  canvasContext.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = Math.min(visible.length - 1, Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1)));
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY - amplitude * (laneHeight * 0.46);
    if (x === 0) {
      canvasContext.moveTo(x, y);
    } else {
      canvasContext.lineTo(x, y);
    }
  }
  canvasContext.stroke();

  canvasContext.strokeStyle = "rgba(255,255,255,0.16)";
  canvasContext.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = Math.min(visible.length - 1, Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1)));
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY + amplitude * (laneHeight * 0.46);
    if (x === 0) {
      canvasContext.moveTo(x, y);
    } else {
      canvasContext.lineTo(x, y);
    }
  }
  canvasContext.stroke();
}

function drawMarker(x, color) {
  canvasContext.strokeStyle = color;
  canvasContext.lineWidth = 3;
  canvasContext.beginPath();
  canvasContext.moveTo(x, 0);
  canvasContext.lineTo(x, refs.canvas.height);
  canvasContext.stroke();
}

function drawPlaybackNeedle(view) {
  const time = getPlaybackTime();
  if (time === null || time < view.start || time > view.end) {
    refs.playheadValue.textContent = state.previewSource ? "Tocando fora da janela" : "Parado";
    return;
  }

  const x = timeToX(time, view);
  canvasContext.strokeStyle = "#FFFFFF";
  canvasContext.lineWidth = 2;
  canvasContext.setLineDash([6, 6]);
  canvasContext.beginPath();
  canvasContext.moveTo(x, 0);
  canvasContext.lineTo(x, state.canvasHeight);
  canvasContext.stroke();
  canvasContext.setLineDash([]);

  canvasContext.fillStyle = "rgba(255,255,255,0.94)";
  canvasContext.fillRect(Math.max(0, x - 28), state.canvasHeight - 28, 56, 20);
  canvasContext.fillStyle = "#09111a";
  canvasContext.font = "12px Avenir Next, sans-serif";
  canvasContext.fillText(formatSeconds(time), Math.max(4, x - 22), state.canvasHeight - 14);
  refs.playheadValue.textContent = `Tocando ${formatSeconds(time)} s`;
}

function drawTimeLabel(x, time, color) {
  const text = `${formatSeconds(time)} s`;
  const labelX = Math.min(currentCanvasWidth() - 96, Math.max(8, x - 24));
  canvasContext.fillStyle = color;
  canvasContext.fillRect(labelX, 8, 88, 24);
  canvasContext.fillStyle = "#09111a";
  canvasContext.font = "12px Avenir Next, sans-serif";
  canvasContext.fillText(text, labelX + 8, 24);
}

function pointerX(event) {
  const rect = refs.canvas.getBoundingClientRect();
  const width = currentCanvasWidth();
  return Math.max(0, Math.min(width, ((event.clientX - rect.left) / rect.width) * width));
}

function timeToX(time, view = getViewWindow()) {
  if (!state.audioBuffer) return 0;
  return ((time - view.start) / view.duration) * currentCanvasWidth();
}

function xToTime(x, view = getViewWindow()) {
  if (!state.audioBuffer) return 0;
  return clampTime(view.start + (x / currentCanvasWidth()) * view.duration, 0, state.audioBuffer.duration);
}

function selectionDuration() {
  return Math.max(0, state.selectionEnd - state.selectionStart);
}

function clampTime(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getViewWindow() {
  if (!state.audioBuffer) {
    return { start: 0, end: 1, duration: 1 };
  }
  const total = state.audioBuffer.duration;
  const visibleDuration = total / state.zoom;
  const maxStart = Math.max(0, total - visibleDuration);
  let start;
  if (state.viewStartOverride === null) {
    const selectionMid = (state.selectionStart + state.selectionEnd) / 2;
    start = selectionMid - visibleDuration / 2;
  } else {
    start = state.viewStartOverride;
  }
  let end = start + visibleDuration;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > total) {
    start -= end - total;
    end = total;
  }
  start = Math.min(Math.max(0, start), maxStart);
  end = Math.min(total, end);
  state.viewStartOverride = start;
  return { start, end, duration: Math.max(0.01, end - start) };
}

function zoomToSelection() {
  if (!state.audioBuffer) return;
  const duration = Math.max(0.05, selectionDuration());
  const targetZoom = Math.min(24, Math.max(1, state.audioBuffer.duration / (duration * 4)));
  state.zoom = Number(targetZoom.toFixed(0));
  refs.zoomInput.value = String(state.zoom);
  state.viewStartOverride = Math.max(0, ((state.selectionStart + state.selectionEnd) / 2) - (state.audioBuffer.duration / state.zoom) / 2);
  renderSpectrogram();
}

function updateViewMeta(view) {
  refs.zoomValue.textContent = `Zoom ${state.zoom}x`;
  refs.stretchValue.textContent = `Largura ${state.stretch.toFixed(2)}x`;
  const start = formatSeconds(view.start);
  const end = formatSeconds(view.end);
  refs.windowValue.textContent = `Janela ${start}s - ${end}s`;
}

function updateNavigationControls(view) {
  if (!state.audioBuffer) {
    refs.panSlider.max = "0";
    refs.panSlider.value = "0";
    refs.panLeftButton.disabled = true;
    refs.panRightButton.disabled = true;
    return;
  }
  const maxStart = Math.max(0, state.audioBuffer.duration - view.duration);
  refs.panSlider.max = String(maxStart);
  refs.panSlider.value = String(Math.max(0, Math.min(maxStart, view.start)));
  refs.panLeftButton.disabled = view.start <= 0.001;
  refs.panRightButton.disabled = view.start >= maxStart - 0.001;
}

function formatSeconds(value) {
  const numeric = Number(value || 0);
  return numeric < 1 ? numeric.toFixed(3) : numeric.toFixed(2);
}

function parseFloatSafe(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function ensureWavFileName(fileName) {
  const cleaned = String(fileName || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^a-z0-9_\-\.]+/gi, "_"))
    .join("/");
  const finalName = cleaned || "novo_clip";
  return /\.wav$/i.test(finalName) ? finalName : `${finalName}.wav`;
}

function suggestImportFileName(sourceName) {
  const stem = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_\-]+/gi, "_").replace(/^_+|_+$/g, "");
  return ensureWavFileName(stem || "novo_clip");
}

function encodeAudioBufferToWavBytes(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples * blockAlign);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * blockAlign, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = audioBuffer.getChannelData(channel)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      resolve(dataUrl.split(",", 2)[1] || "");
    };
    reader.onerror = () => reject(reader.error || new Error("Falha ao converter o audio."));
    reader.readAsDataURL(blob);
  });
}

function stopPreviewSource() {
  if (window.HTMLMediaElement && state.previewSource instanceof window.HTMLMediaElement) {
    state.previewSource.pause();
    state.previewSource.currentTime = 0;
    state.previewSource.onended = null;
    state.previewSource = null;
  } else if (state.previewSource) {
    try {
      state.previewSource.stop();
    } catch (error) {
      // ignore stop errors from already-finished nodes
    }
    state.previewSource.disconnect();
    state.previewSource = null;
  }
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = "";
  }
  stopPlayheadLoop();
}

function panWindow(direction) {
  if (!state.audioBuffer) return;
  const view = getViewWindow();
  const shift = view.duration * 0.25 * direction;
  state.viewStartOverride = Math.max(0, view.start + shift);
  renderSpectrogram();
}

function clampViewAfterZoom() {
  if (!state.audioBuffer) return;
  const visibleDuration = state.audioBuffer.duration / state.zoom;
  const maxStart = Math.max(0, state.audioBuffer.duration - visibleDuration);
  if (state.viewStartOverride === null) {
    state.viewStartOverride = 0;
  }
  state.viewStartOverride = Math.min(Math.max(0, state.viewStartOverride), maxStart);
}

function startPlayheadLoop() {
  stopPlayheadLoop();
  const tick = () => {
    renderSpectrogram();
    if (state.previewSource) {
      state.playheadFrame = window.requestAnimationFrame(tick);
    }
  };
  state.playheadFrame = window.requestAnimationFrame(tick);
}

function stopPlayheadLoop() {
  if (state.playheadFrame) {
    window.cancelAnimationFrame(state.playheadFrame);
    state.playheadFrame = 0;
  }
  refs.playheadValue.textContent = "Parado";
}

function getPlaybackTime() {
  if (!state.previewSource) return null;
  if (window.HTMLMediaElement && state.previewSource instanceof window.HTMLMediaElement) {
    const elapsed = state.previewSource.currentTime;
    if (elapsed < 0 || elapsed > state.playbackDuration) return null;
    return state.playbackFrom + elapsed;
  }
  if (!state.audioContext) return null;
  const elapsed = state.audioContext.currentTime - state.playbackStartedAt;
  if (elapsed < 0 || elapsed > state.playbackDuration) return null;
  return state.playbackFrom + elapsed;
}

function resizeCanvas() {
  const cssWidth = currentCanvasWidth();
  const cssHeight = state.canvasHeight;
  refs.canvas.style.setProperty("--canvas-width", `${cssWidth}px`);
  refs.canvas.width = Math.round(cssWidth * state.dpr);
  refs.canvas.height = Math.round(cssHeight * state.dpr);
  canvasContext.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function currentCanvasWidth() {
  return Math.round(state.baseCanvasWidth * state.stretch);
}

function setStatus(message, tone = "") {
  refs.status.textContent = message;
  refs.status.classList.remove("is-error", "is-success");
  if (tone === "error") refs.status.classList.add("is-error");
  if (tone === "success") refs.status.classList.add("is-success");
}
