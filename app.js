const $ = (id) => document.getElementById(id);
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const SPEED_BASE = 'https://speed.cloudflare.com';
const state = {
  running: false,
  result: null,
  meta: null,
  dns: null,
};

const fmt = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
const median = (values) => {
  const list = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!list.length) return NaN;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function setProgress(percent, stage, message) {
  const p = Math.max(0, Math.min(100, percent));
  $('progressBar').style.width = `${p}%`;
  $('testPercent').textContent = `${Math.round(p)}%`;
  if (stage) $('testStage').textContent = stage;
  if (message) $('testMessage').textContent = message;
}

function setDiag(key, ok, text) {
  const el = document.querySelector(`[data-diag="${key}"]`);
  if (!el) return;
  el.classList.remove('good','bad');
  el.classList.add(ok ? 'good' : 'bad');
  el.querySelector('b').textContent = text || (ok ? 'OK' : 'Gagal');
}

function updateOnlineState() {
  const online = navigator.onLine;
  const badge = $('onlineBadge');
  badge.classList.toggle('online', online);
  badge.classList.toggle('offline', !online);
  badge.querySelector('span').textContent = online ? 'Online' : 'Offline';
  $('connectionStatus').textContent = online ? 'Online' : 'Offline';
  setDiag('internet', online, online ? 'Online' : 'Offline');
}

function updateConnectionInfo() {
  updateOnlineState();
  $('connectionType').textContent = connection?.type ? connection.type.toUpperCase() : 'Tidak tersedia';
  $('effectiveType').textContent = connection?.effectiveType ? connection.effectiveType.toUpperCase() : 'Tidak tersedia';
  $('estimatedDownlink').textContent = Number.isFinite(connection?.downlink) ? `${connection.downlink} Mbps` : 'Tidak tersedia';
  $('estimatedRtt').textContent = Number.isFinite(connection?.rtt) ? `${connection.rtt} ms` : 'Tidak tersedia';
  $('saveData').textContent = typeof connection?.saveData === 'boolean' ? (connection.saveData ? 'Aktif' : 'Nonaktif') : 'Tidak tersedia';
  setDiag('network-api', Boolean(connection), connection ? 'Didukung' : 'Dibatasi browser');
  $('lastUpdated').textContent = `Diperbarui ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`;
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
  $('secureContext').textContent = window.isSecureContext ? 'Ya (HTTPS)' : 'Tidak';
  $('protocol').textContent = `${location.protocol.replace(':','').toUpperCase()} / ${navigator.onLine ? 'online' : 'offline'}`;
  setDiag('https', window.isSecureContext, window.isSecureContext ? 'Aman' : 'Tidak aman');
}

async function fetchWithTimeout(url, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { cache:'no-store', ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadNetworkMeta() {
  try {
    const res = await fetchWithTimeout(`${SPEED_BASE}/meta?ts=${Date.now()}`, {}, 7000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    state.meta = meta;
    $('publicIp').textContent = meta.clientIp || meta.ip || 'Tidak tersedia';
    $('isp').textContent = meta.asOrganization || meta.asnOrganization || meta.organization || 'Tidak tersedia';
    $('asn').textContent = meta.asn ? `AS${String(meta.asn).replace(/^AS/i,'')}` : 'Tidak tersedia';
    $('colo').textContent = meta.colo || 'Tidak tersedia';
    const location = [meta.city, meta.region, meta.country].filter(Boolean).join(', ');
    $('networkLocation').textContent = location || 'Tidak tersedia';
    return meta;
  } catch (err) {
    state.meta = null;
    $('publicIp').textContent = 'Dibatasi / gagal dimuat';
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
    const res = await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&r=${Math.random()}`, {}, 5500);
    if (!res.ok) throw new Error('endpoint unavailable');
    const ms = performance.now() - start;
    setDiag('speed', true, `${Math.round(ms)} ms`);
    return true;
  } catch {
    setDiag('speed', false, 'Tidak terjangkau');
    return false;
  }
}

async function runLatency(samples = 8, onSample) {
  const values = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&r=${Date.now()}-${i}`, {}, 5000);
      if (!res.ok) throw new Error('latency request failed');
      await res.arrayBuffer();
      values.push(performance.now() - start);
    } catch (_) {}
    onSample?.(i + 1, samples);
    await sleep(80);
  }
  if (values.length < 3) throw new Error('Tidak cukup sampel ping.');
  const stable = values.length > 4 ? values.slice(1) : values;
  const ping = median(stable);
  const diffs = [];
  for (let i = 1; i < stable.length; i++) diffs.push(Math.abs(stable[i] - stable[i - 1]));
  const jitter = diffs.length ? diffs.reduce((a,b) => a+b, 0) / diffs.length : 0;
  return { ping, jitter, samples: stable };
}

async function downloadAttempt(bytes) {
  const url = `${SPEED_BASE}/__down?bytes=${bytes}&r=${Math.random()}`;
  const start = performance.now();
  const res = await fetchWithTimeout(url, {}, 20000);
  if (!res.ok) throw new Error(`Download endpoint HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  const actual = data.byteLength || bytes;
  return { mbps: (actual * 8) / seconds / 1_000_000, seconds, bytes: actual };
}

async function runDownload(onStep) {
  onStep?.('warmup');
  const warm = await downloadAttempt(1_000_000);
  if (warm.seconds > 4.5) return warm.mbps;
  onStep?.('5mb');
  const first = await downloadAttempt(5_000_000);
  if (first.seconds > 6) return first.mbps;
  onStep?.('10mb');
  const second = await downloadAttempt(10_000_000);
  return median([first.mbps, second.mbps]);
}

async function uploadAttempt(bytes) {
  const payload = new Uint8Array(bytes);
  const start = performance.now();
  const res = await fetchWithTimeout(`${SPEED_BASE}/__up?r=${Math.random()}`, { method:'POST', body: payload }, 20000);
  if (!res.ok) throw new Error(`Upload endpoint HTTP ${res.status}`);
  await res.text();
  const seconds = (performance.now() - start) / 1000;
  return { mbps: (bytes * 8) / seconds / 1_000_000, seconds };
}

async function runUpload(onStep) {
  onStep?.('warmup');
  await uploadAttempt(250_000);
  onStep?.('1mb');
  const first = await uploadAttempt(1_000_000);
  if (first.seconds > 5.5) return first.mbps;
  onStep?.('3mb');
  const second = await uploadAttempt(3_000_000);
  return median([first.mbps, second.mbps]);
}

async function dnsProbe(name, url) {
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept:'application/dns-json' } }, 6500);
    if (!res.ok) throw new Error('DNS request failed');
    const data = await res.json();
    const ms = performance.now() - start;
    if (typeof data.Status === 'number' && data.Status !== 0) throw new Error('DNS status non-zero');
    return { name, ok:true, ms };
  } catch {
    return { name, ok:false, ms:NaN };
  }
}

function paintDnsResult(id, result) {
  const el = $(id);
  el.classList.remove('good','bad','neutral');
  el.classList.add(result.ok ? 'good' : 'bad');
  el.textContent = result.ok ? `${Math.round(result.ms)} ms` : 'Tidak terjangkau';
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
  paintDnsResult('cloudflareDns', cf);
  paintDnsResult('googleDns', google);
  const good = [cf, google].filter(x => x.ok).sort((a,b) => a.ms - b.ms);
  $('fastestDns').textContent = good.length ? `${good[0].name} · ${Math.round(good[0].ms)} ms` : 'Tidak dapat dibandingkan';
  state.dns = { cloudflare:cf, google };
  return state.dns;
}

function gradeDownload(v) {
  if (!Number.isFinite(v)) return 'Tidak tersedia';
  if (v >= 100) return 'Sangat cepat';
  if (v >= 50) return 'Cepat';
  if (v >= 25) return 'Baik';
  if (v >= 10) return 'Cukup';
  return 'Lambat';
}
function gradeUpload(v) {
  if (!Number.isFinite(v)) return 'Tidak tersedia';
  if (v >= 30) return 'Sangat baik';
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

function calculateScore({download, upload, ping, jitter}) {
  let score = 0;
  score += download >= 100 ? 35 : download >= 50 ? 31 : download >= 25 ? 26 : download >= 10 ? 20 : download >= 5 ? 12 : 6;
  score += upload >= 30 ? 20 : upload >= 15 ? 17 : upload >= 5 ? 13 : upload >= 2 ? 9 : 4;
  score += ping <= 20 ? 25 : ping <= 40 ? 21 : ping <= 70 ? 16 : ping <= 120 ? 10 : 5;
  score += jitter <= 5 ? 20 : jitter <= 10 ? 16 : jitter <= 20 ? 11 : jitter <= 40 ? 6 : 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreText(score) {
  if (score >= 90) return ['Excellent','Sangat cocok untuk gaming, streaming 4K, dan panggilan video.'];
  if (score >= 80) return ['Sangat baik','Koneksi cepat dan stabil untuk mayoritas aktivitas berat.'];
  if (score >= 65) return ['Baik','Cukup nyaman untuk streaming, meeting, dan penggunaan harian.'];
  if (score >= 50) return ['Cukup','Dapat digunakan, tetapi beberapa aktivitas sensitif mungkin terganggu.'];
  return ['Perlu perbaikan','Ada indikasi koneksi lambat, latency tinggi, atau kurang stabil.'];
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
  const score = calculateScore(result);
  result.score = score;
  $('scoreValue').textContent = score;
  $('scoreRing').style.setProperty('--score', score);
  const [label,hint] = scoreText(score);
  $('scoreLabel').textContent = label;
  $('scoreHint').textContent = hint;
  renderRecommendations(result);
}

function renderRecommendations(r) {
  const tips = [];
  if (r.download < 25) tips.push(['Download terbatas','Dekatkan perangkat ke router, kurangi penghalang, atau coba band 5/6 GHz bila tersedia.']);
  if (r.upload < 5) tips.push(['Upload rendah','Untuk meeting atau upload besar, hentikan sinkronisasi cloud dan aktivitas upload perangkat lain sementara.']);
  if (r.ping > 60) tips.push(['Latency cukup tinggi','Untuk gaming, prioritaskan Ethernet atau posisi Wi‑Fi yang lebih dekat dan hindari jaringan yang padat.']);
  if (r.jitter > 15) tips.push(['Koneksi tidak stabil','Jitter tinggi sering muncul akibat interferensi, sinyal lemah, atau bufferbloat saat jaringan sedang sibuk.']);
  if (connection?.effectiveType && ['slow-2g','2g','3g'].includes(connection.effectiveType)) tips.push(['Effective connection rendah',`Browser melaporkan ${connection.effectiveType.toUpperCase()}; kualitas aktual dapat berubah mengikuti kondisi jaringan.`]);
  if (connection?.saveData) tips.push(['Data Saver aktif','Mode hemat data aktif dan dapat mengubah perilaku pemuatan konten di beberapa situs.']);
  if (!tips.length) tips.push(['Kondisi jaringan bagus','Tidak ada masalah besar yang terdeteksi dari metrik browser saat tes ini dijalankan.']);
  $('recommendations').innerHTML = tips.map(([title,desc]) => `<div class="tip"><strong>${title}</strong><p>${desc}</p></div>`).join('');
}

function historyKey() { return 'wifichecker-history-v1'; }
function getHistory() {
  try { return JSON.parse(localStorage.getItem(historyKey())) || []; } catch { return []; }
}
function saveHistory(result) {
  const history = getHistory();
  history.unshift({ ts:Date.now(), download:result.download, upload:result.upload, ping:result.ping, jitter:result.jitter, score:result.score });
  localStorage.setItem(historyKey(), JSON.stringify(history.slice(0,6)));
  renderHistory();
}
function renderHistory() {
  const list = getHistory();
  if (!list.length) {
    $('historyList').innerHTML = '<p class="empty-state">Belum ada riwayat tes di perangkat ini.</p>';
    return;
  }
  $('historyList').innerHTML = list.map(x => {
    const date = new Date(x.ts).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div class="history-item"><time>${date}<br>Score ${x.score ?? '—'}</time><b>${fmt(x.download)}<span>DOWN</span></b><b>${fmt(x.upload)}<span>UP</span></b><b>${fmt(x.ping)}<span>PING</span></b><b>${fmt(x.jitter)}<span>JITTER</span></b></div>`;
  }).join('');
}

async function runQuickCheck() {
  if (state.running) return;
  state.running = true;
  $('runTestBtn').disabled = true;
  $('quickCheckBtn').disabled = true;
  try {
    setProgress(10,'Quick Check','Memeriksa identitas jaringan dan endpoint…');
    await Promise.all([loadNetworkMeta(), runDnsTests(true), probeSpeedEndpoint()]);
    setProgress(45,'Mengukur latency','Mengambil beberapa sampel ping…');
    const latency = await runLatency(6, (i,total) => setProgress(45 + (i/total)*45,'Mengukur latency',`Sampel ${i}/${total}`));
    $('pingValue').textContent = fmt(latency.ping);
    $('jitterValue').textContent = fmt(latency.jitter);
    $('pingGrade').textContent = gradePing(latency.ping);
    $('jitterGrade').textContent = gradeJitter(latency.jitter);
    setProgress(100,'Quick Check selesai','Full Test diperlukan untuk skor download/upload lengkap.');
  } catch (err) {
    setProgress(0,'Quick Check gagal',err.message || 'Tes tidak dapat diselesaikan.');
  } finally {
    state.running = false;
    $('runTestBtn').disabled = false;
    $('quickCheckBtn').disabled = false;
  }
}

async function runFullTest() {
  if (state.running) return;
  if (!navigator.onLine) { toast('Perangkat sedang offline.'); return; }
  state.running = true;
  $('runTestBtn').disabled = true;
  $('quickCheckBtn').disabled = true;
  const btnText = $('runTestBtn').querySelector('span:last-child');
  const oldText = btnText.textContent;
  btnText.textContent = 'Testing…';
  try {
    setProgress(3,'Menyiapkan tes','Menghubungkan ke edge network…');
    await Promise.all([loadNetworkMeta(), runDnsTests(true), probeSpeedEndpoint()]);

    setProgress(12,'Mengukur ping & jitter','Mengambil sampel latency…');
    const latency = await runLatency(8, (i,total) => setProgress(12 + (i/total)*20,'Mengukur ping & jitter',`Sampel latency ${i}/${total}`));
    $('pingValue').textContent = fmt(latency.ping);
    $('jitterValue').textContent = fmt(latency.jitter);
    $('pingGrade').textContent = gradePing(latency.ping);
    $('jitterGrade').textContent = gradeJitter(latency.jitter);

    setProgress(36,'Mengukur download','Mengunduh data tes…');
    const download = await runDownload(step => {
      const p = step === 'warmup' ? 38 : step === '5mb' ? 46 : 57;
      setProgress(p,'Mengukur download',step === 'warmup' ? 'Warm-up koneksi…' : `Sample ${step.toUpperCase()}…`);
    });
    $('downloadValue').textContent = fmt(download);
    $('downloadGrade').textContent = gradeDownload(download);

    setProgress(66,'Mengukur upload','Mengirim data tes…');
    const upload = await runUpload(step => {
      const p = step === 'warmup' ? 68 : step === '1mb' ? 76 : 86;
      setProgress(p,'Mengukur upload',step === 'warmup' ? 'Warm-up upload…' : `Sample ${step.toUpperCase()}…`);
    });
    $('uploadValue').textContent = fmt(upload);
    $('uploadGrade').textContent = gradeUpload(upload);

    const result = {
      download, upload, ping:latency.ping, jitter:latency.jitter,
      timestamp:new Date().toISOString(),
      connection: connection ? { type:connection.type || null, effectiveType:connection.effectiveType || null, downlink:connection.downlink ?? null, rtt:connection.rtt ?? null, saveData:connection.saveData ?? null } : null,
      network: state.meta,
      dns: state.dns,
    };
    paintResult(result);
    state.result = result;
    saveHistory(result);
    setProgress(100,'Tes selesai','Hasil telah diperbarui dan riwayat tersimpan lokal.');
    toast(`Network score: ${result.score}/100`);
  } catch (err) {
    console.error(err);
    setProgress(0,'Tes gagal',err?.message || 'Tes jaringan tidak dapat diselesaikan. Coba lagi.');
    toast('Tes gagal. Periksa koneksi atau pembatasan browser.');
  } finally {
    state.running = false;
    $('runTestBtn').disabled = false;
    $('quickCheckBtn').disabled = false;
    btnText.textContent = oldText;
  }
}

function summaryText() {
  const r = state.result;
  if (!r) return 'Belum ada Full Test yang selesai.';
  const net = r.network || {};
  return [
    'WiFi Checker Pro — Network Result',
    `Score: ${r.score}/100`,
    `Download: ${fmt(r.download)} Mbps`,
    `Upload: ${fmt(r.upload)} Mbps`,
    `Ping: ${fmt(r.ping)} ms`,
    `Jitter: ${fmt(r.jitter)} ms`,
    `Public IP: ${net.clientIp || net.ip || 'N/A'}`,
    `ISP: ${net.asOrganization || net.organization || 'N/A'}`,
    `Tested: ${new Date(r.timestamp).toLocaleString('id-ID')}`
  ].join('\n');
}

async function copySummary() {
  const text = summaryText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Ringkasan disalin.');
  } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('Ringkasan disalin.');
  }
}

function exportJson() {
  if (!state.result) { toast('Jalankan Full Test terlebih dahulu.'); return; }
  const blob = new Blob([JSON.stringify({ app:'WiFi Checker Pro', ...state.result }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `wifichecker-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function setupTheme() {
  const stored = localStorage.getItem('wifichecker-theme');
  if (stored === 'light') document.documentElement.classList.add('light');
  $('themeBtn').addEventListener('click', () => {
    const light = document.documentElement.classList.toggle('light');
    localStorage.setItem('wifichecker-theme', light ? 'light' : 'dark');
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

async function init() {
  setupTheme();
  fillDeviceInfo();
  updateConnectionInfo();
  renderHistory();
  $('runTestBtn').addEventListener('click', runFullTest);
  $('quickCheckBtn').addEventListener('click', runQuickCheck);
  $('dnsBtn').addEventListener('click', () => runDnsTests(false));
  $('copyBtn').addEventListener('click', copySummary);
  $('exportBtn').addEventListener('click', exportJson);
  $('clearHistoryBtn').addEventListener('click', () => { localStorage.removeItem(historyKey()); renderHistory(); toast('Riwayat lokal dihapus.'); });
  window.addEventListener('online', updateConnectionInfo);
  window.addEventListener('offline', updateConnectionInfo);
  connection?.addEventListener?.('change', updateConnectionInfo);
  registerServiceWorker();
  await Promise.allSettled([loadNetworkMeta(), runDnsTests(true), probeSpeedEndpoint()]);
}

init();
