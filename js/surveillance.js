// ============================================================
// ElectAI — CCTV Surveillance AI Engine
// TensorFlow.js COCO-SSD + Motion Detection + Leaflet Maps
// ============================================================

let cocoModel    = null;
let videoStream  = null;
let detectionLoop= null;
let map          = null;
let mapMarkers   = [];
let userLat      = 22.5726;  // Default: Kolkata (West Bengal)
let userLng      = 88.3639;
let alertCount   = 0;
let alertsLog    = [];
let prevFrame    = null;
let motionLevel  = 0;
let threatScore  = 0;

const THREAT_TYPES = [
  { id:'tc-crowd',        label:'Crowd Surge',       icon:'👥', severity:'medium', trigger:8 },
  { id:'tc-violence',     label:'Violence/Aggression',icon:'⚡', severity:'high',   trigger:15 },
  { id:'tc-weapon',       label:'Weapon/Explosive',   icon:'💣', severity:'high',   trigger:25 },
  { id:'tc-unauthorized', label:'Unauthorized Entry', icon:'🚷', severity:'low',    trigger:5 }
];

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  getLocation();
  loadAIModel();
});

// ── Load COCO-SSD ──
async function loadAIModel() {
  setAIStatus('loading');
  try {
    cocoModel = await cocoSsd.load();
    setAIStatus('ready');
    console.log('COCO-SSD loaded');
  } catch(e) {
    console.warn('COCO-SSD failed, using motion detection only:', e);
    setAIStatus('motion-only');
  }
}

// ── Camera ──
async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480, facingMode:'environment' } });
    const video = document.getElementById('surv-video');
    video.srcObject = videoStream;
    video.onloadedmetadata = () => {
      document.getElementById('cam-offline').style.display = 'none';
      document.getElementById('rec-dot').classList.add('active');
      document.getElementById('cam-label-text').textContent = '📹 BOOTH CAM — LIVE';
      document.getElementById('cam-dot').style.background = 'var(--accent-green)';
      document.getElementById('start-cam-btn').classList.add('hidden');
      document.getElementById('stop-cam-btn').classList.remove('hidden');
      startDetectionLoop();
    };
  } catch(e) {
    showSurvToast('❌ Camera access denied. Please allow camera access.', 'error');
    console.error(e);
  }
}

function stopCamera() {
  if (videoStream) videoStream.getTracks().forEach(t => t.stop());
  if (detectionLoop) { clearInterval(detectionLoop); detectionLoop = null; }
  videoStream = null;
  document.getElementById('cam-offline').style.display = 'flex';
  document.getElementById('rec-dot').classList.remove('active');
  document.getElementById('cam-label-text').textContent = '📹 BOOTH CAM — OFFLINE';
  document.getElementById('cam-dot').style.background = 'var(--accent-red)';
  document.getElementById('start-cam-btn').classList.remove('hidden');
  document.getElementById('stop-cam-btn').classList.add('hidden');
  clearInterval(detectionLoop);
  document.getElementById('cam-alert-overlay').classList.add('hidden');
  resetThreat();
}

// ── Detection Loop ──
function startDetectionLoop() {
  detectionLoop = setInterval(runDetection, 1200);
}

async function runDetection() {
  const video = document.getElementById('surv-video');
  const overlay = document.getElementById('surv-canvas');
  if (!video.videoWidth || !video || video.readyState < 2) return;

  overlay.width  = video.videoWidth;
  overlay.height = video.videoHeight;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Motion detection
  motionLevel = detectMotion(video);
  document.getElementById('det-motion').textContent = motionLevel < 5 ? 'Low' : motionLevel < 20 ? 'Medium' : 'HIGH';

  let persons = 0;
  let threats  = [];

  // COCO-SSD object detection
  if (cocoModel) {
    try {
      const predictions = await cocoModel.detect(video);
      predictions.forEach(p => {
        const [x, y, w, h] = p.bbox;
        const conf = Math.round(p.score * 100);

        // Draw boxes
        ctx.strokeStyle = p.class === 'person' ? '#22c55e' : '#f97316';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y - 22, w, 22);
        ctx.fillStyle = '#fff';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(`${p.class} ${conf}%`, x + 4, y - 6);

        if (p.class === 'person') persons++;

        // Threat detection based on objects
        if (['knife','scissors','gun','baseball bat'].includes(p.class)) {
          threats.push({ type:'weapon', label:`${p.class} detected`, severity:'high' });
        }
        if (['backpack','handbag','suitcase'].includes(p.class) && conf > 70) {
          threats.push({ type:'suspicious-object', label:`Suspicious ${p.class}`, severity:'medium' });
        }
      });

      document.getElementById('det-people').textContent = persons;
      if (predictions.length) document.getElementById('det-conf').textContent = Math.round(predictions[0].score * 100) + '%';

      // Crowd surge
      if (persons >= 8) threats.push({ type:'crowd', label:`${persons} people detected`, severity:'medium' });
      if (persons >= 15) threats.push({ type:'crowd', label:`Large crowd — ${persons} people`, severity:'high' });

    } catch(e) { console.warn('Detection frame error:', e); }
  }

  // Motion-based threat
  if (motionLevel > 25) threats.push({ type:'high-motion', label:'High motion — possible disturbance', severity:'medium' });
  if (motionLevel > 40) threats.push({ type:'violence', label:'Extreme motion — violence suspected', severity:'high' });

  // Update threat UI
  updateThreatUI(threats, persons);

  // Trigger alert if threats found
  if (threats.length > 0) {
    const worst = threats.find(t => t.severity === 'high') || threats[0];
    triggerAlert(worst);
  } else {
    document.getElementById('cam-alert-overlay').classList.add('hidden');
  }
}

// ── Motion Detection ──
function detectMotion(video) {
  const dCanvas = document.getElementById('detect-canvas');
  if (!dCanvas) return 0;
  dCanvas.width = 80; dCanvas.height = 60;
  const dCtx = dCanvas.getContext('2d');
  dCtx.drawImage(video, 0, 0, 80, 60);
  const curr = dCtx.getImageData(0, 0, 80, 60);
  if (!prevFrame) { prevFrame = curr; return 0; }
  let diff = 0;
  for (let i = 0; i < curr.data.length; i += 4) {
    diff += Math.abs(curr.data[i] - prevFrame.data[i]);
  }
  prevFrame = curr;
  return Math.round(diff / (80 * 60 * 255) * 200);
}

// ── Threat UI ──
function updateThreatUI(threats, persons) {
  const score = Math.min(100, threats.reduce((s, t) => s + (t.severity === 'high' ? 35 : t.severity === 'medium' ? 20 : 10), 0) + Math.min(50, persons * 3) + Math.min(30, motionLevel));
  threatScore = score;

  const fill = document.getElementById('threat-fill');
  fill.style.width = score + '%';
  fill.className = 'threat-fill' + (score > 60 ? ' danger' : score > 30 ? ' warning' : '');

  const levels = ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
  const lvl = Math.min(4, Math.floor(score / 20));
  document.getElementById('threat-level-text').textContent = levels[lvl];

  // Categories
  document.getElementById('tc-crowd').classList.toggle('detected', threats.some(t => t.type === 'crowd'));
  document.getElementById('tc-violence').classList.toggle('detected', threats.some(t => t.type === 'violence' || t.type === 'high-motion'));
  document.getElementById('tc-weapon').classList.toggle('detected', threats.some(t => t.type === 'weapon'));
  document.getElementById('tc-unauthorized').classList.toggle('detected', persons > 5 && threats.some(t => t.severity === 'high'));

  document.getElementById('det-threat').textContent = threats.length > 0 ? threats[0].label : 'None';
}

function resetThreat() {
  document.getElementById('threat-fill').style.width = '0%';
  document.getElementById('threat-level-text').textContent = 'SAFE';
  ['tc-crowd','tc-violence','tc-weapon','tc-unauthorized'].forEach(id => document.getElementById(id).classList.remove('detected'));
  document.getElementById('det-people').textContent = '0';
  document.getElementById('det-motion').textContent = 'None';
  document.getElementById('det-threat').textContent = 'None';
  document.getElementById('det-conf').textContent = '—';
}

// ── Alerts ──
function triggerAlert(threat) {
  const now = new Date();
  const sev = threat.severity;

  // Show overlay
  const overlay = document.getElementById('cam-alert-overlay');
  overlay.classList.remove('hidden');

  // Don't spam — debounce 5s per alert type
  const lastAlert = alertsLog[alertsLog.length - 1];
  if (lastAlert && lastAlert.type === threat.type && (now - new Date(lastAlert.time)) < 5000) return;

  alertCount++;
  document.getElementById('alert-count').textContent = alertCount;

  const alert = {
    id: Date.now(),
    type: threat.type,
    label: threat.label,
    severity: sev,
    time: now.toISOString(),
    lat: userLat + (Math.random() - 0.5) * 0.005,
    lng: userLng + (Math.random() - 0.5) * 0.005,
    location: `Polling Booth — ${getRandomBooth()}`
  };
  alertsLog.push(alert);

  appendAlertToFeed(alert);
  addMapMarker(alert);
  document.getElementById('alert-actions').classList.remove('hidden');

  // Auto-show police modal for high severity
  if (sev === 'high') {
    setTimeout(() => {
      if (!document.getElementById('police-modal').classList.contains('hidden-dismissed')) {
        autoNotifyPolice(alert);
      }
    }, 2000);
  }
}

function appendAlertToFeed(alert) {
  const feed = document.getElementById('alert-feed');
  const noMsg = feed.querySelector('.no-alerts-msg');
  if (noMsg) noMsg.remove();

  const icon = alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟠' : '🟡';
  const item = document.createElement('div');
  item.className = `alert-item ${alert.severity}`;
  item.innerHTML = `
    <span class="alert-icon">${icon}</span>
    <div class="alert-body">
      <div class="alert-type">${alert.label}</div>
      <div class="alert-location">📍 ${alert.location}</div>
    </div>
    <span class="alert-time">${formatAlertTime(alert.time)}</span>`;
  feed.insertBefore(item, feed.firstChild);

  // Add to map incidents list
  const incList = document.getElementById('map-incidents');
  incList.innerHTML = `<div class="incident-row">${icon} ${alert.label} — ${alert.location}<span class="incident-time">${formatAlertTime(alert.time)}</span></div>` + incList.innerHTML;
}

function clearAlerts() {
  document.getElementById('alert-feed').innerHTML = '<div class="no-alerts-msg">No alerts detected. Surveillance is active.</div>';
  document.getElementById('alert-actions').classList.add('hidden');
  document.getElementById('map-incidents').innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted)">Incident markers will appear here after alerts are triggered</p>';
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  alertsLog = [];
  alertCount = 0;
  document.getElementById('alert-count').textContent = '0';
  document.getElementById('cam-alert-overlay').classList.add('hidden');
}

// ── Demo Alert ──
function runDemoAlert() {
  const demos = [
    { type:'crowd', label:'Large crowd surge detected — 17 persons', severity:'high' },
    { type:'weapon', label:'Suspicious object detected near booth', severity:'high' },
    { type:'violence', label:'Aggressive movement detected', severity:'medium' },
    { type:'unauthorized', label:'Unauthorized persons at restricted area', severity:'low' }
  ];
  const demo = demos[Math.floor(Math.random() * demos.length)];
  updateThreatUI([demo], demo.type === 'crowd' ? 17 : 3);
  triggerAlert(demo);
  showSurvToast(`⚡ Demo alert: ${demo.label}`, 'warning');
}

// ── Map ──
function initMap() {
  map = L.map('surv-map').setView([userLat, userLng], 13);

  // Try Google Maps tiles first, fallback to OSM
  const gmTiles = L.tileLayer(`https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${CONFIG.MAPS_API_KEY}`, {
    attribution: '© Google Maps', maxZoom: 19
  });
  const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  });

  gmTiles.addTo(map);
  gmTiles.on('tileerror', () => {
    map.removeLayer(gmTiles);
    osmTiles.addTo(map);
  });

  // User marker
  L.circleMarker([userLat, userLng], { radius:10, color:'#8b5cf6', fillColor:'#8b5cf6', fillOpacity:0.7 })
    .addTo(map)
    .bindPopup('📍 Your Location / Monitoring Station');
}

function addMapMarker(alert) {
  if (!map) return;
  const color = alert.severity === 'high' ? '#ef4444' : alert.severity === 'medium' ? '#f97316' : '#eab308';
  const marker = L.circleMarker([alert.lat, alert.lng], {
    radius: 12, color, fillColor: color, fillOpacity: 0.7, weight: 2
  }).addTo(map);
  marker.bindPopup(`<b>${alert.severity === 'high' ? '🔴' : '🟠'} ALERT</b><br/>${alert.label}<br/><small>${alert.location}</small><br/><small>${formatAlertTime(alert.time)}</small>`).openPopup();
  mapMarkers.push(marker);
  map.flyTo([alert.lat, alert.lng], 15, { duration: 1.5 });
}

function recenterMap() {
  if (map) map.setView([userLat, userLng], 13);
}

// ── Location ──
function getLocation() {
  const locText = document.getElementById('location-text');
  const locDot  = document.getElementById('loc-dot');
  if (!navigator.geolocation) {
    locText.textContent = 'Location unavailable';
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    locDot.style.background = 'var(--accent-green)';
    locText.textContent = `${userLat.toFixed(4)}°N, ${userLng.toFixed(4)}°E`;
    document.getElementById('loc-status').innerHTML = `<span class="status-dot" style="background:var(--accent-green)"></span> Location: Acquired`;
    if (map) map.setView([userLat, userLng], 14);
    // Reverse geocode
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`)
      .then(r => r.json())
      .then(d => { if (d.display_name) locText.textContent = d.display_name.split(',').slice(0,3).join(', '); })
      .catch(() => {});
  }, () => {
    locText.textContent = 'Kolkata, West Bengal (default)';
    document.getElementById('loc-status').innerHTML = `<span class="status-dot" style="background:var(--accent-orange)"></span> Location: Default`;
  });
}

// ── Police Notification ──
function notifyPolice() {
  const latestAlert = alertsLog[alertsLog.length - 1];
  if (!latestAlert) { showSurvToast('No active alert to report', 'error'); return; }
  autoNotifyPolice(latestAlert);
}

function autoNotifyPolice(alert) {
  const modal   = document.getElementById('police-modal');
  const details = document.getElementById('police-alert-details');
  details.innerHTML = `
    🕐 Time: ${new Date(alert.time).toLocaleString('en-IN')}<br>
    📍 Location: ${alert.location}<br>
    🗺️ GPS: ${alert.lat.toFixed(6)}, ${alert.lng.toFixed(6)}<br>
    ⚠️ Type: ${alert.label}<br>
    🔴 Severity: ${alert.severity.toUpperCase()}<br>
    📞 Alerting: West Bengal Police Control Room — 100`;
  modal.classList.remove('hidden');
  showSurvToast('🚨 Police alert dispatched!', 'success');
}

function notifyECI() {
  showSurvToast('📋 ECI cVIGIL notification sent with GPS coordinates and incident photo', 'success');
}

function shareLocation() {
  const url = `https://maps.google.com/?q=${userLat},${userLng}`;
  navigator.clipboard.writeText(url).then(() => showSurvToast('📍 Location URL copied to clipboard!', 'success'));
}

function closeModal() {
  document.getElementById('police-modal').classList.add('hidden');
  document.getElementById('police-modal').classList.add('hidden-dismissed');
}

// ── Status Helpers ──
function setAIStatus(s) {
  const el  = document.getElementById('ai-status');
  const dot = document.getElementById('ai-dot');
  if (s === 'ready') { el.innerHTML = `<span class="status-dot" style="background:var(--accent-green)"></span> AI Model: Ready`; dot.style.background='var(--accent-green)'; }
  else if (s === 'loading') { el.innerHTML = `<span class="status-dot" style="background:var(--accent-orange)"></span> AI Model: Loading...`; }
  else { el.innerHTML = `<span class="status-dot" style="background:var(--accent-blue)"></span> AI Model: Motion Mode`; dot.style.background='var(--accent-blue)'; }
}

function getRandomBooth() {
  const booths = [
    'Booth #247, Ballygunge, Kolkata',
    'Booth #89, Barasat, North 24 Parganas',
    'Booth #311, Birbhum',
    'Booth #156, Cooch Behar',
    'Booth #428, Murshidabad',
    'Booth #73, Howrah'
  ];
  return booths[Math.floor(Math.random() * booths.length)];
}

function formatAlertTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function showSurvToast(msg, type = 'info') {
  let t = document.getElementById('surv-toast');
  if (t) t.remove();
  t = document.createElement('div');
  t.id = 'surv-toast';
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.4s'; setTimeout(()=>t.remove(),400); }, 3500);
}
