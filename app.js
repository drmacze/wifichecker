const $ = (id) => document.getElementById(id);
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const SPEED_BASE = 'https://speed.cloudflare.com';
const HISTORY_KEY = 'wifi-checker-pro-history-v2';

const state = {
  running: false,
  selectedMode: 'full',
  controllers: new Set(),
  result: null,
  meta: null,
  dns: null,
  location: null,
  locationPermission: 'unknown',
  historyConsent: true,
  points: { download: [], upload: [], ping: [], jitter: [] },
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const fmt = (v, digits = 1) => Number.isFinite(v) ? Number(v).toFixed(digits) : '—';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p = 0.5) => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return NaN;
  const idx = clamp(Math.ceil(p * list.length) - 1, 0, list.length - 1);
  return list[idx];
};
const median = (values) => percentile(values, 0.5);
const jitterOf = (values) => {
  const diffs = [];
  for (let i = 1; i < values.length; i++) diffs.push(Math.abs(values[i] - values[i - 1]));
  return diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : NaN;
};

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setDiag(key, ok, text) {
  const el = document.querySelector(`[data-diag="${key}"]`);
  if (!el) return;
  el.classList.remove('good', 'bad');
  if (ok === true) el.classList.add('good');
  if (ok === false) el.classList.add('bad');
  el.querySelector('strong').textContent = text || (ok ? 'OK' : 'Gagal');
}

function setProgress(percent, stage, message) {
  const p = clamp(percent, 0, 100);
  $('progressBar').style.width = `${p}%`;
  $('testPercent').textContent = `${Math.round(p)}%`;
  if (stage) $('testStage').textContent = stage;
  if (message) $('testMessage').textContent = message;
}

function setEngineState(text) {
  $('engineState').textContent = text;
}

function setDialScore(score) {
  const safe = clamp(Number(score) || 0, 0, 100);
  $('dialLabel').textContent = 'NETWORK SCORE';
  $('dialValue').textContent = Number.isFinite(score) ? Math.round(score) : '—';
  $('dialUnit').textContent = '/ 100';
  $('speedDial').style.setProperty('--meter', `${safe * 2.7}deg`);
  $('dialNeedle').style.transform = `rotate(${135 + safe * 2.7}deg)`;
}

function setDialMetric(label, value, unit, maxHint = 500) {
  const v = Number(value);
  $('dialLabel').textContent = label;
  $('dialValue').textContent = Number.isFinite(v) ? (v >= 100 ? Math.round(v) : v.toFixed(1)) : '—';
  $('dialUnit').textContent = unit;
  const ratio = Number.isFinite(v) ? clamp(Math.log10(v + 1) / Math.log10(maxHint + 1), 0, 1) : 0;
  $('speedDial').style.setProperty('--meter', `${ratio * 270}deg`);
  $('dialNeedle').style.transform = `rotate(${135 + ratio * 270}deg)`;
}

function drawSpark(id, values) {
  const canvas = $(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const data = values.filter(Number.isFinite).slice(-24);
  if (data.length < 2) return;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1e-6, max - min);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() || '#31d8ff';
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = 3 + (i / (data.length - 1)) * (w - 6);
    const y = h - 4 - ((v - min) / range) * (h - 8);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function updateOnlineState() {
  const online = navigator.onLine;
  const badge = $('onlineBadge');
  badge.classList.toggle('online', online);
  badge.classList.toggle('offline', !online);
  badge.querySelector('span').textContent = online ? 'Online' : 'Offline';
  $('connectionStatus').textContent = online ? 'ONLINE' : 'OFFLINE';
  setDiag('internet', online, online ? 'Online' : 'Offline');
  $('lastUpdated').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function updateConnectionInfo() {
  updateOnlineState();
  $('connectionType').textContent = connection?.type ? connection.type.toUpperCase() : 'BROWSER N/A';
  $('effectiveType').textContent = connection?.effectiveType ? connection.effectiveType.toUpperCase() : 'Tidak tersedia';
  $('estimatedDownlink').textContent = Number.isFinite(connection?.downlink) ? `${connection.downlink} Mbps` : 'Tidak tersedia';
  $('estimatedRtt').textContent = Number.isFinite(connection?.rtt) ? `${connection.rtt} ms` : 'Tidak tersedia';
  $('saveData').textContent = typeof connection?.saveData === 'boolean' ? (connection.saveData ? 'Aktif' : 'Nonaktif') : 'Tidak tersedia';
  $('networkApiState').textContent = connection ? 'Didukung browser' : 'Tidak didukung';
  setDiag('network-api', Boolean(connection), connection ? 'Didukung' : 'Dibatasi browser');
}

function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/CriOS\//.test(ua)) return 'Chrome iOS';
  if (/FxiOS\//.test(ua)) return 'Firefox iOS';
  if (/Chrome\//.test(ua)) return 'Chrome / Chromium';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return 'Browser modern';
}

function fillDeviceInfo() {
  $('browserName').textContent = detectBrowser();
  $('platform').textContent = navigator.userAgentData?.platform || navigator.platform || 'Tidak tersedia';
  $('cpuCores').textContent = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logical` : 'Tidak tersedia';
  $('deviceMemory').textContent = navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'Tidak tersedia';
  $('screenInfo').textContent = `${screen.width} × ${screen.height} @ ${window.devicePixelRatio || 1}x`;
  $('secureContext').textContent = window.isSecureContext ? 'Ya · HTTPS' : 'Tidak';
  $('protocol').textContent = location.protocol.replace(':', '').toUpperCase();
  setDiag('https', window.isSecureContext, window.isSecureContext ? 'Secure' : 'Tidak aman');
  setDiag('geolocation', 'geolocation' in navigator, 'geolocation' in navigator ? 'Tersedia' : 'Tidak didukung');
}

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  state.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    state.controllers.delete(controller);
  }
}

function cancelAllRequests() {
  for (const controller of state.controllers) controller.abort();
  state.controllers.clear();
}

async function loadNetworkMeta() {
  try {
    const res = await fetchWithTimeout(`${SPEED_BASE}/meta?r=${Date.now()}`, {}, 7000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    state.meta = meta;
    const ip = meta.clientIp || meta.ip || 'Tidak tersedia';
    const org = meta.asOrganization || meta.asnOrganization || meta.organization || 'Tidak tersedia';
    const loc = [meta.city, meta.region, meta.country].filter(Boolean).join(', ') || 'Tidak tersedia';
    $('publicIp').textContent = ip;
    $('publicIpDetail').textContent = ip;
    $('isp').textContent = org;
    $('asn').textContent = meta.asn ? `AS${String(meta.asn).replace(/^AS/i, '')}` : 'Tidak tersedia';
    $('colo').textContent = meta.colo || 'Tidak tersedia';
    $('edgeChip').querySelector('b').textContent = meta.colo || '—';
    $('networkLocation').textContent = loc;
    return meta;
  } catch {
    state.meta = null;
    $('publicIp').textContent = 'Tidak tersedia';
    $('publicIpDetail').textContent = 'Tidak tersedia';
    $('isp').textContent = 'Tidak tersedia';
    $('asn').textContent = '—';
    $('colo').textContent = '—';
    $('networkLocation').textContent = '—';
    return null;
  }
}

async function probeSpeedEndpoint() {
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&r=${Math.random()}`, {}, 6500);
    if (!res.ok) throw new Error('unreachable');
    await res.arrayBuffer();
    const ms = performance.now() - start;
    setDiag('speed', true, `${Math.round(ms)} ms`);
    return true;
  } catch {
    setDiag('speed', false, 'Tidak terjangkau');
    return false;
  }
}

async function queryGeoPermission() {
  let permission = 'unknown';
  if (!('geolocation' in navigator)) permission = 'unsupported';
  else if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      permission = status.state;
      status.onchange = () => updateGeoPermissionUI(status.state);
    } catch {
      permission = 'prompt';
    }
  } else permission = 'prompt';
  updateGeoPermissionUI(permission);
  return permission;
}

function updateGeoPermissionUI(permission) {
  state.locationPermission = permission;
  const labels = { granted: 'Diizinkan', denied: 'Ditolak', prompt: 'Akan diminta', unsupported: 'Tidak didukung', unknown: 'Belum diketahui' };
  const label = labels[permission] || permission;
  for (const id of ['geoPermissionState', 'locationPermissionPill']) {
    const el = $(id);
    if (!el) continue;
    el.textContent = label;
    el.classList.remove('granted', 'denied', 'neutral');
    el.classList.add(permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'neutral');
  }
  setDiag('geolocation', permission !== 'unsupported', label);
}

function requestPreciseLocation() {
  if (!window.isSecureContext) {
    updateGeoPermissionUI('denied');
    return Promise.reject(new Error('Geolocation membutuhkan HTTPS.'));
  }
  if (!navigator.geolocation) {
    updateGeoPermissionUI('unsupported');
    return Promise.reject(new Error('Geolocation tidak didukung browser.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition((position) => {
      const c = position.coords;
      state.location = {
        latitude: c.latitude,
        longitude: c.longitude,
        accuracy: c.accuracy,
        altitude: c.altitude,
        altitudeAccuracy: c.altitudeAccuracy,
        heading: c.heading,
        speed: c.speed,
        timestamp: position.timestamp,
      };
      updateGeoPermissionUI('granted');
      paintLocation();
      resolve(state.location);
    }, (error) => {
      if (error.code === 1) updateGeoPermissionUI('denied');
      paintLocationError(error);
      reject(error);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

function paintLocation() {
  const loc = state.location;
  if (!loc) return;
  $('deviceCoords').textContent = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
  $('deviceAccuracy').textContent = `Akurasi yang dilaporkan browser ±${Math.round(loc.accuracy)} meter`;
  $('latitude').textContent = loc.latitude.toFixed(7);
  $('longitude').textContent = loc.longitude.toFixed(7);
  $('geoAccuracy').textContent = `±${Math.round(loc.accuracy)} m`;
  $('altitude').textContent = Number.isFinite(loc.altitude) ? `${loc.altitude.toFixed(1)} m` : 'Tidak tersedia';
}

function paintLocationError(error) {
  const messages = {
    1: 'Izin lokasi ditolak. Tes jaringan tetap dapat berjalan.',
    2: 'Posisi perangkat tidak dapat ditentukan.',
    3: 'Permintaan lokasi melewati batas waktu.',
  };
  $('deviceCoords').textContent = 'Lokasi tidak tersedia';
  $('deviceAccuracy').textContent = messages[error?.code] || 'Browser tidak memberikan lokasi.';
}

async function measureLatency(samples = 12, onProgress) {
  const values = [];
  for (let i = 0; i < samples; i++) {
    if (!state.running) throw new Error('Tes dibatalkan.');
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&r=${Date.now()}-${i}`, {}, 6000);
      if (!res.ok) throw new Error('latency request failed');
      await res.arrayBuffer();
      const ms = performance.now() - start;
      values.push(ms);
      state.points.ping.push(ms);
      if (values.length > 1) state.points.jitter.push(Math.abs(values.at(-1) - values.at(-2)));
      drawSpark('pingSpark', state.points.ping);
      drawSpark('jitterSpark', state.points.jitter);
    } catch (error) {
      if (!state.running) throw error;
    }
    onProgress?.(i + 1, samples);
    await sleep(70);
  }
  if (values.length < Math.max(3, Math.floor(samples / 2))) throw new Error('Sampel latency tidak mencukupi.');
  const stable = values.length > 4 ? values.slice(1) : values;
  return { ping: percentile(stable, 0.5), jitter: jitterOf(stable), points: stable };
}

async function loadedPingLoop(active, points) {
  while (active.value && state.running) {
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&loaded=${Math.random()}`, {}, 5000);
      if (res.ok) {
        await res.arrayBuffer();
        points.push(performance.now() - start);
      }
    } catch {}
    if (active.value) await sleep(260);
  }
}

async function downloadAttempt(bytes, withLoadedLatency = false) {
  const active = { value: withLoadedLatency };
  const loadedPoints = [];
  const pingPromise = withLoadedLatency ? loadedPingLoop(active, loadedPoints) : Promise.resolve();
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=${bytes}&r=${Math.random()}`, {}, 30000);
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    const data = await res.arrayBuffer();
    const seconds = (performance.now() - start) / 1000;
    const actual = data.byteLength || bytes;
    return { mbps: (actual * 8) / seconds / 1e6, seconds, bytes: actual, loadedPoints };
  } finally {
    active.value = false;
    await pingPromise;
  }
}

async function uploadAttempt(bytes, withLoadedLatency = false) {
  const payload = new Uint8Array(bytes);
  const active = { value: withLoadedLatency };
  const loadedPoints = [];
  const pingPromise = withLoadedLatency ? loadedPingLoop(active, loadedPoints) : Promise.resolve();
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(`${SPEED_BASE}/__up?r=${Math.random()}`, { method: 'POST', body: payload }, 30000);
    if (!res.ok) throw new Error(`Upload HTTP ${res.status}`);
    await res.text();
    const seconds = (performance.now() - start) / 1000;
    return { mbps: (bytes * 8) / seconds / 1e6, seconds, loadedPoints };
  } finally {
    active.value = false;
    await pingPromise;
  }
}

async function measureDownload(onProgress) {
  const warm = await downloadAttempt(750_000, false);
  const targetBytes = clamp(Math.round((warm.mbps * 1e6 / 8) * 1.35), 3_000_000, 25_000_000);
  const samples = [];
  const loaded = [];
  for (let i = 0; i < 3; i++) {
    if (!state.running) throw new Error('Tes dibatalkan.');
    const r = await downloadAttempt(targetBytes, i === 2);
    samples.push(r.mbps);
    loaded.push(...r.loadedPoints);
    state.points.download.push(r.mbps);
    drawSpark('downloadSpark', state.points.download);
    setDialMetric('DOWNLOAD', r.mbps, 'Mbps', 1000);
    onProgress?.(i + 1, 3, r.mbps);
  }
  return { mbps: percentile(samples, 0.9), samples, loadedLatency: loaded.length ? median(loaded) : NaN, targetBytes };
}

async function measureUpload(onProgress) {
  const warm = await uploadAttempt(300_000, false);
  const targetBytes = clamp(Math.round((warm.mbps * 1e6 / 8) * 1.35), 1_000_000, 10_000_000);
  const samples = [];
  const loaded = [];
  for (let i = 0; i < 3; i++) {
    if (!state.running) throw new Error('Tes dibatalkan.');
    const r = await uploadAttempt(targetBytes, i === 2);
    samples.push(r.mbps);
    loaded.push(...r.loadedPoints);
    state.points.upload.push(r.mbps);
    drawSpark('uploadSpark', state.points.upload);
    setDialMetric('UPLOAD', r.mbps, 'Mbps', 500);
    onProgress?.(i + 1, 3, r.mbps);
  }
  return { mbps: percentile(samples, 0.9), samples, loadedLatency: loaded.length ? median(loaded) : NaN, targetBytes };
}

async function dnsProbe(name, url) {
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/dns-json' } }, 7000);
    if (!res.ok) throw new Error('DNS request failed');
    const data = await res.json();
    if (typeof data.Status === 'number' && data.Status !== 0) throw new Error('DNS status nonzero');
    return { name, ok: true, ms: performance.now() - start };
  } catch {
    return { name, ok: false, ms: NaN };
  }
}

async function runDnsTests(silent = false) {
  if (!silent) {
    $('cloudflareDns').textContent = 'Menguji…';
    $('googleDns').textContent = 'Menguji…';
    $('fastestDns').textContent = '…';
  }
  const stamp = Date.now();
  const [cf, google] = await Promise.all([
    dnsProbe('Cloudflare', `https://cloudflare-dns.com/dns-query?name=example.com&type=A&ct=application/dns-json&r=${stamp}`),
    dnsProbe('Google', `https://dns.google/resolve?name=example.com&type=A&r=${stamp}`),
  ]);
  $('cloudflareDns').textContent = cf.ok ? `${Math.round(cf.ms)} ms` : 'Tidak terjangkau';
  $('googleDns').textContent = google.ok ? `${Math.round(google.ms)} ms` : 'Tidak terjangkau';
  const good = [cf, google].filter((x) => x.ok).sort((a, b) => a.ms - b.ms);
  $('fastestDns').textContent = good.length ? `${good[0].name} · ${Math.round(good[0].ms)} ms` : 'Tidak dapat dibandingkan';
  state.dns = { cloudflare: cf, google };
  return state.dns;
}

function gradeDownload(v) {
  if (!Number.isFinite(v)) return 'Tidak tersedia';
  if (v >= 200) return 'Ultra cepat';
  if (v >= 100) return 'Sangat cepat';
  if (v >= 50) return 'Cepat';
  if (v >= 25) return 'Baik';
  if (v >= 10) return 'Cukup';
  return 'Lambat';
}
function gradeUpload(v) {
  if (!Number.isFinite(v)) return 'Tidak tersedia';
  if (v >= 50) return 'Sangat baik';
  if (v >= 20) return 'Cepat';
  if (v >= 10) return 'Baik';
  if (v >= 5) return 'Cukup';
  return 'Rendah';
}
function gradePing(v) {
  if (!Number.isFinite(v)) return 'Tidak tersedia';
  if (v <= 20) return 'Excellent';
  if (v <= 40) return 'Sangat baik';
  if (v <= 70) return 'Baik';
  if (v <= 120) return 'Cukup';
  return 'Tinggi';
}
function gradeJitter(v) {
  if (!Number.isFinite(v)) return 'Tidak tersedia';
  if (v <= 5) return 'Sangat stabil';
  if (v <= 10) return 'Stabil';
  if (v <= 20) return 'Cukup stabil';
  return 'Tidak stabil';
}

function bufferbloatGrade(idle, downLoaded, upLoaded) {
  const loaded = [downLoaded, upLoaded].filter(Number.isFinite);
  if (!Number.isFinite(idle) || !loaded.length) return { grade: 'Tidak tersedia', delta: NaN };
  const delta = Math.max(...loaded) - idle;
  const grade = delta <= 5 ? 'A+' : delta <= 15 ? 'A' : delta <= 30 ? 'B' : delta <= 60 ? 'C' : delta <= 100 ? 'D' : 'F';
  return { grade, delta: Math.max(0, delta) };
}

function calculateScore(r) {
  let score = 0;
  score += r.download >= 200 ? 34 : r.download >= 100 ? 31 : r.download >= 50 ? 27 : r.download >= 25 ? 23 : r.download >= 10 ? 16 : 8;
  score += r.upload >= 50 ? 18 : r.upload >= 20 ? 16 : r.upload >= 10 ? 13 : r.upload >= 5 ? 9 : 4;
  score += r.ping <= 20 ? 24 : r.ping <= 40 ? 21 : r.ping <= 70 ? 16 : r.ping <= 120 ? 10 : 5;
  score += r.jitter <= 5 ? 14 : r.jitter <= 10 ? 12 : r.jitter <= 20 ? 8 : 4;
  const bb = bufferbloatGrade(r.ping, r.downLoadedLatency, r.upLoadedLatency);
  score += bb.grade === 'A+' ? 10 : bb.grade === 'A' ? 9 : bb.grade === 'B' ? 7 : bb.grade === 'C' ? 5 : bb.grade === 'D' ? 3 : 1;
  return clamp(Math.round(score), 0, 100);
}

function scoreText(score) {
  if (score >= 90) return 'Excellent — siap untuk gaming kompetitif, streaming, dan video call berat.';
  if (score >= 80) return 'Sangat baik — cepat dan stabil untuk mayoritas aktivitas.';
  if (score >= 65) return 'Baik — nyaman untuk streaming, meeting, dan penggunaan harian.';
  if (score >= 50) return 'Cukup — aktivitas sensitif latency mungkin sesekali terganggu.';
  return 'Perlu perbaikan — terdapat indikasi bottleneck pada kecepatan atau latency.';
}

function paintResult(result) {
  $('downloadValue').textContent = fmt(result.download);
  $('uploadValue').textContent = fmt(result.upload);
  $('pingValue').textContent = fmt(result.ping);
  $('jitterValue').textContent = fmt(result.jitter);
  $('downloadGrade').textContent = gradeDownload(result.download);
  $('uploadGrade').textContent = gradeUpload(result.upload);
  $('pingGrade').textContent = gradePing(result.ping);
  $('jitterGrade').textContent = gradeJitter(result.jitter);
  $('downLoadedLatency').textContent = Number.isFinite(result.downLoadedLatency) ? `${fmt(result.downLoadedLatency)} ms` : 'Tidak tersedia';
  $('upLoadedLatency').textContent = Number.isFinite(result.upLoadedLatency) ? `${fmt(result.upLoadedLatency)} ms` : 'Tidak tersedia';
  const bb = bufferbloatGrade(result.ping, result.downLoadedLatency, result.upLoadedLatency);
  $('bufferbloatGrade').textContent = bb.grade;
  $('bufferbloatDelta').textContent = Number.isFinite(bb.delta) ? `+${fmt(bb.delta)} ms` : '—';
  if (Number.isFinite(result.score)) {
    setDialScore(result.score);
    $('scoreHint').textContent = scoreText(result.score);
  }
  renderRecommendations(result);
}

function renderRecommendations(r) {
  const tips = [];
  if (r.ping > 70) tips.push(['↔', 'Latency tinggi', 'Coba koneksi kabel/Ethernet, dekatkan perangkat ke access point, dan hentikan VPN bila tidak diperlukan.']);
  if (r.jitter > 15) tips.push(['≈', 'Koneksi kurang stabil', 'Jitter tinggi sering muncul akibat interferensi Wi‑Fi atau jaringan yang sedang padat.']);
  if (r.download < 25) tips.push(['↓', 'Download terbatas', 'Bandingkan hasil dekat router dan jauh dari router untuk membedakan masalah ISP vs jangkauan Wi‑Fi.']);
  if (r.upload < 5) tips.push(['↑', 'Upload rendah', 'Upload rendah dapat memengaruhi video call, livestream, cloud backup, dan pengiriman file besar.']);
  const bb = bufferbloatGrade(r.ping, r.downLoadedLatency, r.upLoadedLatency);
  if (['C', 'D', 'F'].includes(bb.grade)) tips.push(['◎', 'Bufferbloat terdeteksi', 'Latency naik cukup besar saat koneksi dibebani. QoS/SQM pada router dapat membantu bila tersedia.']);
  if (!tips.length) tips.push(['✓', 'Koneksi terlihat sehat', 'Hasil utama berada pada rentang baik. Ulangi tes pada jam sibuk untuk membandingkan konsistensi.']);
  $('recommendations').innerHTML = tips.map(([icon, title, text]) => `<div class="tip"><i>${icon}</i><div><b>${title}</b><p>${text}</p></div></div>`).join('');
}

function sanitizedResultForStorage(r) {
  return {
    timestamp: r.timestamp,
    mode: r.mode,
    download: r.download,
    upload: r.upload,
    ping: r.ping,
    jitter: r.jitter,
    downLoadedLatency: r.downLoadedLatency,
    upLoadedLatency: r.upLoadedLatency,
    score: r.score,
    publicIp: state.meta?.clientIp || state.meta?.ip || null,
    isp: state.meta?.asOrganization || state.meta?.organization || null,
    colo: state.meta?.colo || null,
    locationPermission: state.locationPermission,
    locationAccuracyMeters: state.location?.accuracy ?? null,
  };
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(r) {
  if (!state.historyConsent) return;
  const history = loadHistory();
  history.unshift(sanitizedResultForStorage(r));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  renderHistory();
}
function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    $('historyList').innerHTML = '<p class="empty-state">Belum ada riwayat di browser ini.</p>';
    return;
  }
  $('historyList').innerHTML = history.map((item) => {
    const date = new Date(item.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    return `<div class="history-item"><div><b>${date}</b><p>↓ ${fmt(item.download)} Mbps · ↑ ${fmt(item.upload)} Mbps · ${fmt(item.ping)} ms</p></div><strong>${Number.isFinite(item.score) ? item.score : '—'}</strong></div>`;
  }).join('');
}

function openPermissionModal(mode) {
  state.selectedMode = mode;
  queryGeoPermission();
  const modal = $('permissionModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closePermissionModal() {
  const modal = $('permissionModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
function openPrivacyModal() {
  $('privacyModal').classList.add('open');
  $('privacyModal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closePrivacyModal() {
  $('privacyModal').classList.remove('open');
  $('privacyModal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function resetPoints() {
  state.points = { download: [], upload: [], ping: [], jitter: [] };
  ['downloadSpark', 'uploadSpark', 'pingSpark', 'jitterSpark'].forEach((id) => drawSpark(id, []));
}

async function runFullTest() {
  if (state.running) return;
  state.running = true;
  resetPoints();
  $('cancelTestBtn').classList.remove('hidden');
  $('runTestBtn').disabled = true;
  $('quickCheckBtn').disabled = true;
  $('testModeBadge').textContent = 'Full Test berjalan';
  setEngineState('RUNNING');
  setProgress(3, 'Preflight', 'Memeriksa endpoint dan identitas jaringan…');

  try {
    if (!navigator.onLine) throw new Error('Browser sedang offline.');
    const endpointOk = await probeSpeedEndpoint();
    if (!endpointOk) throw new Error('Server speed test tidak dapat dijangkau.');
    await loadNetworkMeta();

    setProgress(10, 'Idle latency', 'Mengambil sampel ping dan jitter…');
    setDialMetric('PING', 0, 'ms', 150);
    const latency = await measureLatency(12, (i, total) => setProgress(10 + (i / total) * 18, 'Idle latency', `Sampel latency ${i}/${total}`));
    $('pingValue').textContent = fmt(latency.ping);
    $('jitterValue').textContent = fmt(latency.jitter);
    $('pingGrade').textContent = gradePing(latency.ping);
    $('jitterGrade').textContent = gradeJitter(latency.jitter);
    setDialMetric('PING', latency.ping, 'ms', 150);

    setProgress(30, 'Download bandwidth', 'Mengukur throughput download adaptif…');
    const down = await measureDownload((i, total, mbps) => {
      setProgress(30 + (i / total) * 27, 'Download bandwidth', `Sampel download ${i}/${total} · ${fmt(mbps)} Mbps`);
      $('downloadValue').textContent = fmt(mbps);
    });
    $('downloadValue').textContent = fmt(down.mbps);
    $('downloadGrade').textContent = gradeDownload(down.mbps);

    setProgress(60, 'Upload bandwidth', 'Mengukur throughput upload adaptif…');
    const up = await measureUpload((i, total, mbps) => {
      setProgress(60 + (i / total) * 25, 'Upload bandwidth', `Sampel upload ${i}/${total} · ${fmt(mbps)} Mbps`);
      $('uploadValue').textContent = fmt(mbps);
    });
    $('uploadValue').textContent = fmt(up.mbps);
    $('uploadGrade').textContent = gradeUpload(up.mbps);

    setProgress(87, 'DNS diagnostics', 'Membandingkan resolver DNS-over-HTTPS…');
    await runDnsTests(true);

    const result = {
      timestamp: new Date().toISOString(), mode: 'full',
      download: down.mbps, upload: up.mbps,
      ping: latency.ping, jitter: latency.jitter,
      downLoadedLatency: down.loadedLatency,
      upLoadedLatency: up.loadedLatency,
      measurement: {
        latencySamples: latency.points.length,
        downloadSamples: down.samples.length,
        uploadSamples: up.samples.length,
        downloadBytesPerSample: down.targetBytes,
        uploadBytesPerSample: up.targetBytes,
      },
    };
    result.score = calculateScore(result);
    state.result = result;
    paintResult(result);
    saveHistory(result);
    setProgress(100, 'Selesai', 'Pengukuran selesai. Hasil di atas berasal dari request jaringan aktual.');
    $('testModeBadge').textContent = 'Full Test selesai';
    setEngineState('COMPLETE');
    toast('Full Test selesai');
  } catch (error) {
    if (!state.running || error?.name === 'AbortError') {
      setProgress(0, 'Dibatalkan', 'Tes dihentikan oleh pengguna.');
      setEngineState('CANCELLED');
      $('testModeBadge').textContent = 'Dibatalkan';
    } else {
      setProgress(0, 'Tes gagal', error?.message || 'Terjadi kesalahan saat pengujian.');
      setEngineState('ERROR');
      $('testModeBadge').textContent = 'Gagal';
      toast(error?.message || 'Tes gagal');
    }
  } finally {
    state.running = false;
    $('cancelTestBtn').classList.add('hidden');
    $('runTestBtn').disabled = false;
    $('quickCheckBtn').disabled = false;
    updateConnectionInfo();
  }
}

async function runQuickCheck() {
  if (state.running) return;
  state.running = true;
  resetPoints();
  $('cancelTestBtn').classList.remove('hidden');
  $('runTestBtn').disabled = true;
  $('quickCheckBtn').disabled = true;
  $('testModeBadge').textContent = 'Quick Check berjalan';
  setEngineState('RUNNING');
  try {
    setProgress(10, 'Quick preflight', 'Memeriksa edge dan jaringan…');
    if (!navigator.onLine) throw new Error('Browser sedang offline.');
    const endpointOk = await probeSpeedEndpoint();
    if (!endpointOk) throw new Error('Server speed test tidak dapat dijangkau.');
    await loadNetworkMeta();
    setProgress(30, 'Latency', 'Mengukur latency singkat…');
    const latency = await measureLatency(6, (i, total) => setProgress(30 + (i / total) * 25, 'Latency', `Sampel ${i}/${total}`));
    $('pingValue').textContent = fmt(latency.ping);
    $('jitterValue').textContent = fmt(latency.jitter);
    $('pingGrade').textContent = gradePing(latency.ping);
    $('jitterGrade').textContent = gradeJitter(latency.jitter);
    setDialMetric('PING', latency.ping, 'ms', 150);
    setProgress(62, 'Quick download', 'Mengukur throughput dengan payload kecil…');
    const d1 = await downloadAttempt(2_000_000, false);
    state.points.download.push(d1.mbps);
    $('downloadValue').textContent = fmt(d1.mbps);
    $('downloadGrade').textContent = 'Quick estimate';
    drawSpark('downloadSpark', state.points.download);
    setDialMetric('DOWNLOAD', d1.mbps, 'Mbps', 1000);
    setProgress(83, 'DNS', 'Menguji resolver…');
    await runDnsTests(true);
    const result = { timestamp: new Date().toISOString(), mode: 'quick', download: d1.mbps, upload: NaN, ping: latency.ping, jitter: latency.jitter, downLoadedLatency: NaN, upLoadedLatency: NaN, score: NaN };
    state.result = result;
    renderRecommendations(result);
    saveHistory(result);
    setProgress(100, 'Quick Check selesai', 'Quick Check memakai payload lebih kecil dan bukan pengganti Full Test untuk bandwidth presisi.');
    $('testModeBadge').textContent = 'Quick Check selesai';
    setEngineState('COMPLETE');
    toast('Quick Check selesai');
  } catch (error) {
    if (!state.running || error?.name === 'AbortError') {
      setProgress(0, 'Dibatalkan', 'Tes dihentikan oleh pengguna.');
      setEngineState('CANCELLED');
    } else {
      setProgress(0, 'Tes gagal', error?.message || 'Quick Check gagal.');
      setEngineState('ERROR');
      toast(error?.message || 'Quick Check gagal');
    }
  } finally {
    state.running = false;
    $('cancelTestBtn').classList.add('hidden');
    $('runTestBtn').disabled = false;
    $('quickCheckBtn').disabled = false;
  }
}

function startSelectedTest() {
  state.historyConsent = $('historyConsent').checked;
  if (state.selectedMode === 'quick') runQuickCheck(); else runFullTest();
}

function cancelTest() {
  if (!state.running) return;
  state.running = false;
  cancelAllRequests();
  toast('Tes dibatalkan');
}

function exportResult() {
  if (!state.result) return toast('Jalankan tes terlebih dahulu.');
  const payload = {
    app: 'WiFi Checker Pro',
    exportedAt: new Date().toISOString(),
    result: sanitizedResultForStorage(state.result),
    dns: state.dns,
    network: {
      effectiveType: connection?.effectiveType || null,
      downlinkEstimateMbps: connection?.downlink ?? null,
      rttEstimateMs: connection?.rtt ?? null,
      saveData: connection?.saveData ?? null,
    },
    privacy: 'Precise latitude/longitude intentionally excluded from export.',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wifi-checker-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copySummary() {
  if (!state.result) return toast('Jalankan tes terlebih dahulu.');
  const r = state.result;
  const lines = [
    'WiFi Checker Pro',
    `Mode: ${r.mode}`,
    `Download: ${fmt(r.download)} Mbps`,
    `Upload: ${fmt(r.upload)} Mbps`,
    `Ping: ${fmt(r.ping)} ms`,
    `Jitter: ${fmt(r.jitter)} ms`,
    `Loaded latency ↓: ${fmt(r.downLoadedLatency)} ms`,
    `Loaded latency ↑: ${fmt(r.upLoadedLatency)} ms`,
    `Score: ${Number.isFinite(r.score) ? r.score + '/100' : 'N/A'}`,
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('Ringkasan disalin');
  } catch {
    toast('Clipboard dibatasi browser');
  }
}

function initTheme() {
  const saved = localStorage.getItem('wifi-checker-theme');
  if (saved === 'light') document.documentElement.dataset.theme = 'light';
  $('themeBtn').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
    localStorage.setItem('wifi-checker-theme', light ? 'light' : 'dark');
    ['downloadSpark', 'uploadSpark', 'pingSpark', 'jitterSpark'].forEach((id) => drawSpark(id, state.points[id.replace('Spark', '')] || []));
  });
}

function initAmbientCanvas() {
  const canvas = $('networkCanvas');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dpr = 1, nodes = [];
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = clamp(Math.floor(width / 55), 14, 32);
    nodes = Array.from({ length: count }, () => ({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12 }));
  };
  const frame = () => {
    ctx.clearRect(0, 0, width, height);
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 170) {
          ctx.strokeStyle = `rgba(49,216,255,${(1 - d / 170) * .08})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(122,211,240,.20)';
      ctx.beginPath(); ctx.arc(nodes[i].x, nodes[i].y, 1.1, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(frame);
  };
  resize();
  addEventListener('resize', resize, { passive: true });
  frame();
}

function bindEvents() {
  $('runTestBtn').addEventListener('click', () => openPermissionModal('full'));
  $('quickCheckBtn').addEventListener('click', () => openPermissionModal('quick'));
  $('grantAndRunBtn').addEventListener('click', async () => {
    state.historyConsent = $('historyConsent').checked;
    closePermissionModal();
    try {
      toast('Meminta izin lokasi dari browser…');
      await requestPreciseLocation();
      toast('Lokasi perangkat diterima');
    } catch (error) {
      toast(error?.message || 'Lokasi tidak diberikan; tes tetap dilanjutkan');
    }
    startSelectedTest();
  });
  $('runWithoutLocationBtn').addEventListener('click', () => {
    closePermissionModal();
    startSelectedTest();
  });
  document.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closePermissionModal));
  $('privacyBtn').addEventListener('click', openPrivacyModal);
  document.querySelectorAll('[data-close-privacy]').forEach((el) => el.addEventListener('click', closePrivacyModal));
  $('cancelTestBtn').addEventListener('click', cancelTest);
  $('dnsBtn').addEventListener('click', async () => {
    $('dnsBtn').disabled = true;
    await runDnsTests(false);
    $('dnsBtn').disabled = false;
    toast('DNS diagnostic selesai');
  });
  $('clearHistoryBtn').addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    toast('Riwayat lokal dihapus');
  });
  $('copyBtn').addEventListener('click', copySummary);
  $('exportBtn').addEventListener('click', exportResult);
  addEventListener('online', updateOnlineState);
  addEventListener('offline', updateOnlineState);
  connection?.addEventListener?.('change', updateConnectionInfo);
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closePermissionModal(); closePrivacyModal(); }
  });
}

async function init() {
  initTheme();
  initAmbientCanvas();
  fillDeviceInfo();
  updateConnectionInfo();
  renderHistory();
  bindEvents();
  setDialScore(NaN);
  await queryGeoPermission();
  Promise.allSettled([loadNetworkMeta(), probeSpeedEndpoint(), runDnsTests(true)]).then(updateConnectionInfo);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
