"use strict";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  patterns: [],
  catalogVersion: 0,
  selected: null,
  sourceFilter: localStorage.getItem("usul.source") || "all",
  bpm: Number(localStorage.getItem("usul.bpm")) || 80,
  sound: localStorage.getItem("usul.sound") || "kudum",
  gainDb: Number(localStorage.getItem("usul.gain")) || 0,
  reverb: Number(localStorage.getItem("usul.reverb")) || 0,
  glow: Number(localStorage.getItem("usul.glow")) || 55,
  vibration: localStorage.getItem("usul.vibration") === "true",
  activeHit: -1,
  screen: "metronome",
  workType: "saz",
  sectionDrafts: [],
};

const audio = {
  context: null,
  master: null,
  compressor: null,
  delay: null,
  wet: null,
  buffers: new Map(),
  ready: null,
  playing: false,
  schedulerId: 0,
  visualTimers: new Set(),
  nextTime: 0,
  hitIndex: 0,
  cycleIndex: 0,
  queue: null,
  queueIndex: 0,
  endless: true,
};

const audioFiles = {
  kudum_dum: "assets/audio/kudum_dum.wav",
  kudum_tek: "assets/audio/kudum_tek.wav",
  bendir_dum: "assets/audio/bendir_dum.wav",
  bendir_tek: "assets/audio/bendir_tek.wav",
  mechanical_tick: "assets/audio/mechanical_tick.wav",
  mechanical_tock: "assets/audio/mechanical_tock.wav",
};

function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function meter(pattern) { return `${pattern.zaman}/${pattern.denominator}`; }
function normalized(text) { return String(text || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function tempoName(bpm) {
  if (bpm < 40) return "Larghissimo";
  if (bpm < 60) return "Largo";
  if (bpm < 76) return "Adagio";
  if (bpm < 108) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 168) return "Allegro";
  if (bpm < 200) return "Presto";
  return "Prestissimo";
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2400);
}

async function loadCatalog() {
  try {
    const manifestResponse = await fetch("veri/manifest.json", { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error(`Manifest ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const catalogResponse = await fetch(new URL(manifest.catalog.url, manifestResponse.url), { cache: "no-store" });
    if (!catalogResponse.ok) throw new Error(`Katalog ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    const patterns = Array.isArray(catalog.patterns) ? catalog.patterns : [];
    if (!patterns.length || patterns.length !== manifest.catalog.recordCount) throw new Error("Katalog kayıt sayısı doğrulanamadı");
    state.patterns = patterns;
    state.catalogVersion = manifest.catalogVersion;
    const savedId = localStorage.getItem("usul.pattern");
    state.selected = patterns.find(item => item.id === savedId) || patterns.find(item => item.id === "nim-sofyan") || patterns[0];
    $("#catalog-status").textContent = `Katalog v${state.catalogVersion} · ${patterns.length} doğrulanmış usûl`;
    $("#catalog-loading").classList.add("hidden");
    syncSourceButtons();
    updateSelectedPattern();
    renderPatternList();
    buildSectionDrafts(Number($("#section-count").value));
  } catch (error) {
    $("#catalog-loading").innerHTML = "<strong>Katalog yüklenemedi. İnternet bağlantınızı denetleyin.</strong>";
    $("#catalog-status").textContent = "Katalog erişilemiyor";
    console.error(error);
  }
}

function updateSelectedPattern() {
  const pattern = state.selected;
  if (!pattern) return;
  const kind = pattern.isVelvele ? "Velvele" : "Ana usûl";
  $("#pattern-kind").textContent = kind;
  $("#selection-kind").textContent = kind;
  $("#selected-pattern-name").textContent = pattern.name;
  $("#pattern-meter").textContent = meter(pattern);
  $("#selection-label").textContent = `${pattern.name} • ${meter(pattern)}`;
  $("#selection-source").textContent = pattern.sourceDisplayName || pattern.source;
  localStorage.setItem("usul.pattern", pattern.id);
  renderNotation();
}

function filteredPatterns(source = state.sourceFilter, query = "") {
  const needle = normalized(query.trim());
  return state.patterns.filter(pattern => {
    if (source !== "all" && pattern.source !== source) return false;
    if (!needle) return true;
    const haystack = normalized(`${pattern.name} ${meter(pattern)} ${pattern.sourceDisplayName || ""} ${pattern.hits.map(hit => hit.syllable).join(" ")}`);
    return haystack.includes(needle);
  }).sort((a, b) => a.zaman - b.zaman || a.denominator - b.denominator || a.name.localeCompare(b.name, "tr"));
}

function renderPatternList() {
  const list = $("#pattern-list");
  const patterns = filteredPatterns(state.sourceFilter, $("#pattern-search").value);
  const fragment = document.createDocumentFragment();
  for (const pattern of patterns) {
    const button = document.createElement("button");
    button.className = "pattern-option";
    button.type = "button";
    button.dataset.id = pattern.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(pattern.id === state.selected?.id));
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = pattern.name;
    const source = document.createElement("em");
    source.textContent = `${pattern.sourceDisplayName || pattern.source}${pattern.isVelvele ? " · Velvele" : ""}`;
    text.append(name, source);
    const time = document.createElement("span");
    time.textContent = meter(pattern);
    button.append(text, time);
    button.addEventListener("click", () => {
      stopPlayback();
      state.selected = pattern;
      updateSelectedPattern();
      $("#pattern-dialog").close();
    });
    fragment.append(button);
  }
  list.replaceChildren(fragment);
  if (!patterns.length) {
    const empty = document.createElement("p");
    empty.textContent = "Bu aramaya uyan usûl bulunamadı.";
    empty.style.padding = "20px";
    empty.style.color = "var(--muted)";
    list.append(empty);
  }
}

function balancedRows(hitCount, maxPerRow) {
  if (!hitCount) return [];
  const rowCount = Math.ceil(hitCount / maxPerRow);
  const base = Math.floor(hitCount / rowCount);
  const extra = hitCount % rowCount;
  const rows = [];
  let start = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const size = base + (row < extra ? 1 : 0);
    rows.push(Array.from({ length: size }, (_, index) => start + index));
    start += size;
  }
  return rows;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function renderNotation() {
  const svg = $("#notation-svg");
  const pattern = state.selected;
  if (!svg || !pattern) return;
  const rect = svg.getBoundingClientRect();
  const width = Math.max(280, Math.round(rect.width || 800));
  const height = Math.max(210, Math.round(rect.height || 480));
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const maxPerRow = mobile
    ? (pattern.hits.length > 70 ? 12 : (pattern.hits.length > 40 ? 10 : (width < 390 ? 6 : 7)))
    : 20;
  const rows = balancedRows(pattern.hits.length, maxPerRow);
  const verticalPadding = mobile ? 16 : clamp(height * .025, 10, 22);
  const availableHeight = Math.max(1, height - verticalPadding * 2);
  const notationHeight = Math.min(availableHeight, rows.length * (mobile ? 108 : 118));
  const notationTop = (height - notationHeight) / 2;
  const rowHeight = notationHeight / Math.max(1, rows.length);
  const horizontalPadding = mobile ? 13 : 18;
  const usableWidth = Math.max(1, width - horizontalPadding * 2);
  const maxHits = Math.max(1, ...rows.map(row => row.length));
  const naturalCellWidth = clamp(rowHeight * .95, mobile ? 45 : 60, mobile ? 74 : 104);
  const maximumSystemWidth = Math.min(usableWidth, Math.max(mobile ? 210 : 240, maxHits * naturalCellWidth));
  const globalCellWidth = maximumSystemWidth / maxHits;
  const scale = clamp(Math.min(rowHeight / 105, globalCellWidth / 36), mobile ? .16 : .25, 1);
  const labelSize = clamp(Math.min(rowHeight * .105, globalCellWidth * .36), mobile ? 4.5 : 7.5, mobile ? 14 : 16);
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  rows.forEach((indices, rowIndex) => {
    const rowTop = notationTop + rowIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;
    const labelHalf = labelSize * .62;
    const labelInset = Math.max(2, rowHeight * .025);
    const upperLabelY = rowTop + labelInset + labelHalf;
    const lowerLabelY = rowBottom - labelInset - labelHalf;
    const stemReach = 25 * scale;
    const labelGap = Math.max(4, 3 * scale);
    const preferredTop = upperLabelY + labelHalf + labelGap + stemReach;
    const preferredBottom = lowerLabelY - labelHalf - labelGap - stemReach;
    const minimumGap = Math.max(mobile ? 3 : 6, 8 * scale);
    const center = rowTop + rowHeight / 2;
    const topLine = preferredBottom - preferredTop >= minimumGap ? preferredTop : center - minimumGap / 2;
    const bottomLine = preferredBottom - preferredTop >= minimumGap ? preferredBottom : center + minimumGap / 2;
    const systemWidth = Math.min(usableWidth, Math.max(mobile ? 210 : 240, indices.length * naturalCellWidth));
    const left = (width - systemWidth) / 2;
    const right = left + systemWidth;
    const frame = svgElement("path", { d: `M${left} ${topLine}H${right}M${left} ${bottomLine}H${right}M${left} ${topLine}V${bottomLine}M${right} ${topLine}V${bottomLine}`, fill: "none", stroke: "#f4d58c", "stroke-opacity": ".9", "stroke-width": "1.7", "vector-effect": "non-scaling-stroke" });
    svg.append(frame);

    indices.forEach((hitIndex, position) => {
      const hit = pattern.hits[hitIndex];
      const x = left + (position + .5) / indices.length * systemWidth;
      const active = hitIndex === state.activeHit;
      const color = active ? "#f25b50" : "#fff3d8";
      const group = svgElement("g", { "data-hit": hitIndex });
      if (hit.notationLine === "upper" || hit.notationLine === "both") {
        group.append(drawNote(x, topLine, "up", hit.notationLengthInZaman, pattern.denominator, color, scale));
        group.append(drawLabel(hit.syllable, x, upperLabelY, labelSize, color, active));
      }
      if (hit.notationLine === "lower" || hit.notationLine === "both") {
        group.append(drawNote(x, bottomLine, "down", hit.notationLengthInZaman, pattern.denominator, color, scale));
        group.append(drawLabel(hit.syllable, x, lowerLabelY, labelSize, color, active));
      }
      svg.append(group);
    });
  });
}

function drawLabel(value, x, y, size, color, active) {
  const label = svgElement("text", { x, y, fill: color, "font-family": "Georgia, serif", "font-size": size, "font-weight": active ? 700 : 600, "text-anchor": "middle", "dominant-baseline": "middle" });
  label.textContent = value;
  return label;
}

function drawNote(x, y, direction, duration, denominator, color, scale) {
  const group = svgElement("g");
  const fraction = Number(duration) / Number(denominator);
  const whole = fraction >= 1;
  const hollow = fraction >= .5;
  const headWidth = (whole ? 13 : 11) * scale;
  const headHeight = 8.4 * scale;
  const head = svgElement("ellipse", { cx: x, cy: y, rx: headWidth / 2, ry: headHeight / 2, fill: hollow ? "#0a2232" : color, stroke: hollow ? color : "none", "stroke-width": 2.1 * scale });
  group.append(head);
  const dotted = [3 / 16, 3 / 8, 3 / 4].some(value => Math.abs(fraction - value) < .0001);
  if (dotted) group.append(svgElement("circle", { cx: x + 10 * scale, cy: y - 7 * scale, r: 2.1 * scale, fill: color }));
  if (whole) return group;
  const stemX = direction === "up" ? x + 5 * scale : x - 5 * scale;
  const endY = direction === "up" ? y - 25 * scale : y + 25 * scale;
  group.append(svgElement("line", { x1: stemX, y1: y, x2: stemX, y2: endY, stroke: color, "stroke-width": 2.1 * scale, "stroke-linecap": "round" }));
  const flagCount = fraction >= .25 ? 0 : (fraction >= .125 ? 1 : 2);
  for (let flag = 0; flag < flagCount; flag += 1) {
    const offset = flag * 7 * scale * (direction === "up" ? 1 : -1);
    const startY = endY + offset;
    const path = direction === "up"
      ? `M${stemX} ${startY} C${stemX + 8 * scale} ${startY + scale},${stemX + 11 * scale} ${startY + 6 * scale},${stemX + 10 * scale} ${startY + 12 * scale}`
      : `M${stemX} ${startY} C${stemX + 8 * scale} ${startY - scale},${stemX + 11 * scale} ${startY - 6 * scale},${stemX + 10 * scale} ${startY - 12 * scale}`;
    group.append(svgElement("path", { d: path, fill: "none", stroke: color, "stroke-width": 2.1 * scale, "stroke-linecap": "round" }));
  }
  return group;
}

async function ensureAudio() {
  if (audio.ready) {
    await audio.ready;
    if (audio.context.state === "suspended") await audio.context.resume();
    return;
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error("Web Audio desteklenmiyor");
  audio.context = new Context({ latencyHint: "interactive" });
  audio.master = audio.context.createGain();
  audio.compressor = audio.context.createDynamicsCompressor();
  audio.compressor.threshold.value = -10;
  audio.compressor.knee.value = 5;
  audio.compressor.ratio.value = 10;
  audio.compressor.attack.value = .003;
  audio.compressor.release.value = .16;
  audio.delay = audio.context.createDelay(.4);
  audio.delay.delayTime.value = .085;
  audio.wet = audio.context.createGain();
  audio.wet.gain.value = 0;
  audio.delay.connect(audio.wet).connect(audio.master);
  audio.master.connect(audio.compressor).connect(audio.context.destination);
  updateAudioSettings();
  audio.ready = Promise.allSettled(Object.entries(audioFiles).map(async ([key, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    const buffer = await audio.context.decodeAudioData(await response.arrayBuffer());
    audio.buffers.set(key, buffer);
  })).then(results => {
    if (audio.buffers.size < 4) {
      const reason = results.find(result => result.status === "rejected")?.reason;
      throw reason || new Error("Ses örnekleri yüklenemedi");
    }
  });
  await audio.ready;
  if (audio.context.state === "suspended") await audio.context.resume();
}

function updateAudioSettings() {
  if (!audio.context || !audio.master) return;
  const gain = Math.pow(10, state.gainDb / 20) * .78;
  audio.master.gain.setTargetAtTime(gain, audio.context.currentTime, .015);
  audio.wet.gain.setTargetAtTime(state.reverb / 100 * .32, audio.context.currentTime, .015);
}

function playBuffer(key, when, gainValue = 1) {
  const buffer = audio.buffers.get(key);
  if (!buffer) return;
  const source = audio.context.createBufferSource();
  const voiceGain = audio.context.createGain();
  voiceGain.gain.value = gainValue;
  source.buffer = buffer;
  source.connect(voiceGain);
  voiceGain.connect(audio.master);
  if (state.reverb > 0 && key.startsWith("kudum")) voiceGain.connect(audio.delay);
  source.start(when);
}

function playHit(hit, profile, when, sequenceIndex) {
  if (profile === "tiktak") {
    playBuffer(sequenceIndex % 2 ? "mechanical_tock" : "mechanical_tick", when, .72);
    return;
  }
  const instrument = profile === "bendir" ? "bendir" : "kudum";
  if (hit.sound === "both") {
    if (instrument === "bendir") {
      playBuffer("bendir_tek", when, .82);
    } else {
      playBuffer("kudum_dum", when, .6);
      playBuffer("kudum_tek", when, .6);
    }
  } else {
    playBuffer(`${instrument}_${hit.sound === "dum" ? "dum" : "tek"}`, when, .82);
  }
}

function currentQueueItem() {
  if (!audio.queue) return { pattern: state.selected, bpm: state.bpm, sound: state.sound, silent: false, slow: false };
  return audio.queue[audio.queueIndex] || null;
}

function startScheduler() {
  clearInterval(audio.schedulerId);
  audio.schedulerId = setInterval(scheduleAhead, 25);
  scheduleAhead();
}

function scheduleAhead() {
  if (!audio.playing || !audio.context) return;
  while (audio.nextTime < audio.context.currentTime + .16) {
    const item = currentQueueItem();
    if (!item) { stopPlayback(true); return; }
    const pattern = item.pattern;
    const hit = pattern.hits[audio.hitIndex];
    const progress = pattern.hits.length > 1 ? audio.hitIndex / (pattern.hits.length - 1) : 0;
    const bpm = item.slow ? item.bpm * (1 - progress * .28) : item.bpm;
    if (!item.silent) playHit(hit, item.sound, audio.nextTime, audio.hitIndex);
    scheduleVisual(pattern, audio.hitIndex, audio.nextTime, Number(hit.lengthInZaman), item.silent);
    audio.nextTime += 60 / clamp(bpm, 20, 600) * Number(hit.lengthInZaman);
    audio.hitIndex += 1;
    if (audio.hitIndex >= pattern.hits.length) {
      audio.hitIndex = 0;
      audio.cycleIndex += 1;
      if (audio.queue) {
        audio.queueIndex += 1;
      }
    }
  }
}

function scheduleVisual(pattern, hitIndex, when, length, silent) {
  const delay = Math.max(0, (when - audio.context.currentTime) * 1000);
  const timer = setTimeout(() => {
    audio.visualTimers.delete(timer);
    if (!audio.playing) return;
    if (state.selected?.id !== pattern.id) {
      state.selected = pattern;
      updateSelectedPattern();
    }
    state.activeHit = hitIndex;
    renderNotation();
    if (!silent) {
      const card = $("#notation-card");
      card.classList.remove("hit-glow");
      void card.offsetWidth;
      card.classList.add("hit-glow");
      setTimeout(() => card.classList.remove("hit-glow"), Math.min(260, 55 + length * 65));
      if (state.vibration && navigator.vibrate) navigator.vibrate(Math.round(clamp(35 + length * 65, 35, 240)));
    }
  }, delay);
  audio.visualTimers.add(timer);
}

async function startPlayback(queue = null) {
  if (!state.selected) return;
  try {
    await ensureAudio();
  } catch (error) {
    toast("Sesler yüklenemedi");
    console.error(error);
    return;
  }
  stopPlayback(false);
  audio.playing = true;
  audio.queue = queue;
  audio.queueIndex = 0;
  audio.hitIndex = 0;
  audio.cycleIndex = 0;
  audio.nextTime = audio.context.currentTime + .07;
  setPlayingUI(true);
  startScheduler();
}

function stopPlayback(showToast = false) {
  audio.playing = false;
  clearInterval(audio.schedulerId);
  audio.schedulerId = 0;
  for (const timer of audio.visualTimers) clearTimeout(timer);
  audio.visualTimers.clear();
  audio.queue = null;
  state.activeHit = -1;
  renderNotation();
  setPlayingUI(false);
  if (navigator.vibrate) navigator.vibrate(0);
  if (showToast) toast("Çalma tamamlandı");
}

function togglePlayback() {
  if (audio.playing) stopPlayback();
  else startPlayback();
}

function setPlayingUI(playing) {
  $("#play-top").textContent = playing ? "■" : "▶";
  $("#play-top").setAttribute("aria-label", playing ? "Durdur" : "Başlat");
  $("#play-main span").textContent = playing ? "■" : "▶";
  $("#play-main b").textContent = playing ? "Durdur" : "Başlat";
  $("#accompanist-play span").textContent = playing ? "■" : "▶";
  $("#accompanist-play b").textContent = playing ? "Durdur" : "Eşliği başlat";
}

function setBpm(value) {
  state.bpm = clamp(Math.round(Number(value) || 80), 20, 600);
  localStorage.setItem("usul.bpm", state.bpm);
  $("#bpm-value").textContent = String(state.bpm);
  $("#bpm-slider").value = String(state.bpm);
  $("#tempo-name").textContent = tempoName(state.bpm);
}

function switchScreen(screen) {
  if (screen !== "metronome") stopPlayback();
  state.screen = screen;
  $$(".screen").forEach(element => element.classList.toggle("active", element.id === `${screen}-screen`));
  $$(".nav-button").forEach(button => button.classList.toggle("selected", button.dataset.screen === screen));
  if (screen === "metronome") requestAnimationFrame(renderNotation);
}

function setSound(sound) {
  state.sound = sound;
  localStorage.setItem("usul.sound", sound);
  $$(".sound-tabs button").forEach(button => button.classList.toggle("selected", button.dataset.sound === sound));
  if (sound === "tiktak") $("#notation-card").classList.add("mechanical-mode");
  else $("#notation-card").classList.remove("mechanical-mode");
}

function setSourceFilter(source) {
  state.sourceFilter = source;
  localStorage.setItem("usul.source", source);
  syncSourceButtons();
  renderPatternList();
}

function syncSourceButtons() {
  $$('[data-source]').forEach(button => button.classList.toggle("selected", button.dataset.source === state.sourceFilter));
}

function buildSectionDrafts(count) {
  const safeCount = clamp(Number(count) || 1, 1, 12);
  $("#section-count").value = String(safeCount);
  const defaults = filteredPatterns(state.sourceFilter).filter(pattern => !pattern.isVelvele);
  while (state.sectionDrafts.length < safeCount) {
    state.sectionDrafts.push({ patternId: defaults[state.sectionDrafts.length % Math.max(1, defaults.length)]?.id || state.selected?.id, bpm: state.bpm, measures: 4 });
  }
  state.sectionDrafts.length = safeCount;
  renderSectionCards();
}

function renderSectionCards() {
  const host = $("#sections-grid");
  if (!state.patterns.length) return;
  const available = filteredPatterns(state.sourceFilter).filter(pattern => !pattern.isVelvele);
  const fragment = document.createDocumentFragment();
  state.sectionDrafts.forEach((draft, index) => {
    if (!state.patterns.some(pattern => pattern.id === draft.patternId)) draft.patternId = available[0]?.id;
    const card = document.createElement("section");
    card.className = "section-card";
    const heading = document.createElement("h3");
    heading.textContent = `${index + 1}. Bölüm`;
    const patternLabel = document.createElement("label");
    patternLabel.textContent = "Usûl";
    const select = document.createElement("select");
    for (const pattern of available) {
      const option = document.createElement("option");
      option.value = pattern.id;
      option.textContent = `${pattern.name} · ${meter(pattern)}`;
      option.selected = pattern.id === draft.patternId;
      select.append(option);
    }
    select.addEventListener("change", () => { draft.patternId = select.value; });
    patternLabel.append(select);
    const tempoLabel = numericLabel("Tempo", draft.bpm, 20, 600, value => { draft.bpm = value; });
    const measureLabel = numericLabel("Ölçü", draft.measures, 1, 999, value => { draft.measures = value; });
    card.append(heading, patternLabel, tempoLabel, measureLabel);
    fragment.append(card);
  });
  host.replaceChildren(fragment);
}

function numericLabel(text, value, min, max, onChange) {
  const label = document.createElement("label");
  label.textContent = text;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.inputMode = "numeric";
  input.addEventListener("change", () => {
    const next = clamp(Number(input.value) || min, min, max);
    input.value = String(next);
    onChange(next);
  });
  label.append(input);
  return label;
}

function buildAccompanistQueue() {
  const queue = [];
  const sound = $("#accompanist-sound").value;
  const intro = Number($("#intro-bars").value);
  const drafts = state.sectionDrafts.map(draft => ({ ...draft, pattern: state.patterns.find(pattern => pattern.id === draft.patternId) })).filter(item => item.pattern);
  if (!drafts.length) return queue;
  for (let bar = 0; bar < intro; bar += 1) queue.push({ pattern: drafts[0].pattern, bpm: drafts[0].bpm, sound, silent: true, slow: false });
  drafts.forEach(draft => {
    for (let measure = 0; measure < draft.measures; measure += 1) queue.push({ pattern: draft.pattern, bpm: draft.bpm, sound, silent: false, slow: false });
  });
  if ($("#ending-mode").value === "slow" && queue.length) queue[queue.length - 1].slow = true;
  return queue;
}

function initializeUI() {
  setBpm(state.bpm);
  setSound(state.sound);
  document.documentElement.style.setProperty("--glow", String(state.glow / 100));
  $("#gain-slider").value = String(state.gainDb);
  $("#gain-output").textContent = `${state.gainDb} dB`;
  $("#reverb-slider").value = String(state.reverb);
  $("#reverb-output").textContent = `${state.reverb}%`;
  $("#glow-slider").value = String(state.glow);
  $("#glow-output").textContent = `${state.glow}%`;
  $("#vibration-toggle").checked = state.vibration;
  if (!navigator.vibrate) {
    $("#vibration-toggle").disabled = true;
    $("#vibration-note").textContent = "Bu tarayıcı titreşim geri bildirimini desteklemiyor.";
  }
  $("#play-top").addEventListener("click", togglePlayback);
  $("#play-main").addEventListener("click", togglePlayback);
  $("#settings-top").addEventListener("click", () => switchScreen("settings"));
  $("#bpm-minus").addEventListener("click", () => setBpm(state.bpm - 1));
  $("#bpm-plus").addEventListener("click", () => setBpm(state.bpm + 1));
  $("#bpm-slider").addEventListener("input", event => setBpm(event.target.value));
  let taps = [];
  $("#tap-tempo").addEventListener("click", () => {
    const now = performance.now();
    taps = taps.filter(value => now - value < 2600);
    taps.push(now);
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((value, index) => value - taps[index]);
      setBpm(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
    }
  });
  $$(".sound-tabs button").forEach(button => button.addEventListener("click", () => setSound(button.dataset.sound)));
  $("#open-patterns").addEventListener("click", () => { renderPatternList(); $("#pattern-dialog").showModal(); });
  $("#pattern-search").addEventListener("input", renderPatternList);
  $$('[data-source]').forEach(button => button.addEventListener("click", () => setSourceFilter(button.dataset.source)));
  $$(".nav-button").forEach(button => button.addEventListener("click", () => switchScreen(button.dataset.screen)));
  $$(".back-metronome").forEach(button => button.addEventListener("click", () => switchScreen("metronome")));
  $("#gain-slider").addEventListener("input", event => { state.gainDb = Number(event.target.value); $("#gain-output").textContent = `${state.gainDb} dB`; localStorage.setItem("usul.gain", state.gainDb); updateAudioSettings(); });
  $("#reverb-slider").addEventListener("input", event => { state.reverb = Number(event.target.value); $("#reverb-output").textContent = `${state.reverb}%`; localStorage.setItem("usul.reverb", state.reverb); updateAudioSettings(); });
  $("#glow-slider").addEventListener("input", event => { state.glow = Number(event.target.value); $("#glow-output").textContent = `${state.glow}%`; localStorage.setItem("usul.glow", state.glow); document.documentElement.style.setProperty("--glow", String(state.glow / 100)); });
  $("#vibration-toggle").addEventListener("change", event => { state.vibration = event.target.checked; localStorage.setItem("usul.vibration", state.vibration); if (state.vibration && navigator.vibrate) navigator.vibrate(60); });
  $("#section-count").addEventListener("change", event => buildSectionDrafts(event.target.value));
  $$("#work-type-tabs button").forEach(button => button.addEventListener("click", () => {
    state.workType = button.dataset.work;
    $$("#work-type-tabs button").forEach(item => item.classList.toggle("selected", item === button));
    const labels = { semai: "Saz Semâîsi planı", pesrev: "Peşrev planı", saz: "Saz Eseri planı", sarki: "Şarkı planı" };
    $("#plan-title").textContent = labels[state.workType];
    if (state.workType === "semai" || state.workType === "pesrev") buildSectionDrafts(4);
  }));
  $("#accompanist-play").addEventListener("click", () => {
    if (audio.playing) stopPlayback();
    else {
      const queue = buildAccompanistQueue();
      if (queue.length) startPlayback(queue);
    }
  });
  window.addEventListener("keydown", event => {
    if (event.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || "")) { event.preventDefault(); togglePlayback(); }
    if (event.key === "Escape" && audio.playing) stopPlayback();
  });
  const observer = new ResizeObserver(() => requestAnimationFrame(renderNotation));
  observer.observe($("#notation-card"));
}

initializeUI();
loadCatalog();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(error => console.warn("Çevrimdışı destek kurulamadı", error)));
}
