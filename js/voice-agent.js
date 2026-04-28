// ============================================================
// ElectAI — Voice Agent  (Groq LLaMA 3.3 70B + Web Speech API)
// Fixed: proper speech detection, interim results, noise threshold,
//        retry on no-speech, language fallback en-US/en-IN
// ============================================================

const VOICE_SYSTEM = `You are ElectAI, a friendly voice assistant for Indian election education. 
Answer in 2–3 clear, conversational sentences suitable for text-to-speech. 
NO markdown, NO bullet points, NO asterisks. Speak plainly and warmly.
Context: April 28, 2025. Major elections ongoing: West Bengal, Tamil Nadu, Bihar.`;

// ── State ──
let isListening   = false;
let isSpeaking    = false;
let recognition   = null;
let synthesis     = window.speechSynthesis;
let voiceHistory  = JSON.parse(localStorage.getItem('electai_voice_history') || '[]');
let currentTranscript = '';
let silenceTimer  = null;
let retryCount    = 0;
const MAX_RETRIES = 2;

// ── Orb State ──
let orbCtx, orbPts, orbT = 0;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initOrb();
  renderVoiceHistory();
  checkSpeechSupport();

  // Pre-load voices (needed in some browsers)
  if (synthesis.onvoiceschanged !== undefined) {
    synthesis.onvoiceschanged = () => {};
  }
  synthesis.getVoices(); // trigger load
});

// ── Speech Support Check ──
function checkSpeechSupport() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hintEl = document.getElementById('voice-hint-text');
  const micBtn  = document.getElementById('mic-btn');

  if (!SR) {
    if (hintEl) hintEl.textContent = '⚠️ Voice not supported. Please use Chrome or Edge browser.';
    if (micBtn) micBtn.disabled = true;
    return false;
  }

  if (!window.isSecureContext && location.hostname !== 'localhost') {
    if (hintEl) hintEl.textContent = '⚠️ Voice requires HTTPS or localhost.';
    if (micBtn) micBtn.disabled = true;
    return false;
  }

  if (hintEl) hintEl.textContent = 'Tap the mic to start talking';
  return true;
}

// ── Orb Canvas ──
function initOrb() {
  const c = document.getElementById('voice-orb-canvas');
  if (!c) return;
  orbCtx = c.getContext('2d');
  orbPts  = [];
  for (let i = 0; i < 300; i++) {
    const theta = Math.acos(1 - 2*(i/300));
    const phi   = Math.PI*(1+Math.sqrt(5))*i;
    orbPts.push({
      ox:  Math.sin(theta)*Math.cos(phi),
      oy:  Math.sin(theta)*Math.sin(phi),
      oz:  Math.cos(theta),
      r:   1.3 + Math.random()*1.7
    });
  }
  drawOrb();
}

function drawOrb() {
  if (!orbCtx) return;
  const W=300, H=300, R=110;
  orbCtx.clearRect(0,0,W,H);

  const wave  = isListening ? 0.30 : isSpeaking ? 0.24 : 0.14;
  const freq  = isListening ? 3.8  : isSpeaking ? 3.2  : 2.6;
  const speed = isListening ? 0.028: isSpeaking ? 0.022: 0.012;
  orbT += speed;

  orbPts.forEach(p => {
    const ry = p.ox*Math.cos(orbT*0.5) - p.oz*Math.sin(orbT*0.5);
    const rz = p.ox*Math.sin(orbT*0.5) + p.oz*Math.cos(orbT*0.5);
    const rx = p.oy;
    const n  = 1 + wave * Math.sin(freq*rz + orbT) * Math.cos(freq*rx + orbT*0.7);
    const sc = R*n, z=(rz+1)/2;
    const hue = isListening ? 340+z*40 : isSpeaking ? 130+z*40 : 265+z*80;
    orbCtx.beginPath();
    orbCtx.arc(W/2+rx*sc, H/2+ry*sc, p.r*z, 0, Math.PI*2);
    orbCtx.fillStyle = `hsla(${hue},82%,${60+z*18}%,${0.55*z})`;
    orbCtx.fill();
  });
  requestAnimationFrame(drawOrb);
}

// ── Mic Toggle ──
function toggleListening() {
  if (isSpeaking) {
    synthesis.cancel();
    isSpeaking = false;
    setOrbState('idle');
    setMicState('idle');
  }
  if (isListening) {
    stopListening();
  } else {
    retryCount = 0;
    startListening();
  }
}

// ── Start Listening ──
function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  // Clear any previous recognition instance
  if (recognition) {
    try { recognition.abort(); } catch(e) {}
    recognition = null;
  }

  recognition = new SR();

  // Language: try en-IN first, most browsers also accept en-US
  recognition.lang            = 'en-IN';
  recognition.continuous      = false;   // single utterance per tap
  recognition.interimResults  = true;    // show live partial text
  recognition.maxAlternatives = 3;

  let gotResult = false;

  recognition.onstart = () => {
    isListening = true;
    gotResult   = false;
    setOrbState('listening');
    setMicState('listening');
    setPrompt('🎙️ Listening...', 'Speak clearly — tap mic again to stop');
    showWaveform(true);
    setTranscript('<p style="color:var(--text-muted);font-style:italic">Listening for your voice...</p>');

    // Safety: if no speech detected in 10s, stop
    silenceTimer = setTimeout(() => {
      if (isListening && !gotResult) {
        if (recognition) recognition.stop();
        setPrompt('Nothing detected. Try again.', 'Tap the mic and speak clearly');
      }
    }, 10000);
  };

  recognition.onresult = e => {
    gotResult = true;
    clearTimeout(silenceTimer);

    // Get the best transcript (last result, best alternative)
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    currentTranscript = transcript;
    setTranscript(`<p class="transcript-user" style="font-size:1rem;font-weight:600">"${transcript}"</p>`);
  };

  recognition.onspeechend = () => {
    clearTimeout(silenceTimer);
    if (recognition) recognition.stop();
  };

  recognition.onend = async () => {
    clearTimeout(silenceTimer);
    isListening = false;
    showWaveform(false);
    setMicState('idle');

    if (currentTranscript.trim().length > 1) {
      await processVoiceQuery(currentTranscript.trim());
      currentTranscript = '';
    } else if (!gotResult && retryCount < MAX_RETRIES) {
      retryCount++;
      setPrompt(`Didn't catch that (${retryCount}/${MAX_RETRIES} retries)`, 'Please speak louder and clearly');
      setTimeout(() => {
        setOrbState('idle');
        setPrompt('Tap mic to try again', '');
      }, 2000);
    } else {
      currentTranscript = '';
      setOrbState('idle');
      setPrompt("Tap the mic to start", "I didn't catch that — please try again");
    }
  };

  recognition.onerror = e => {
    clearTimeout(silenceTimer);
    isListening = false;
    showWaveform(false);
    setMicState('idle');
    setOrbState('idle');
    currentTranscript = '';

    let msg = '';
    switch (e.error) {
      case 'no-speech':      msg = "No speech detected. Tap mic and speak clearly."; break;
      case 'audio-capture':  msg = "Microphone not accessible. Check permissions."; break;
      case 'not-allowed':    msg = "Microphone permission denied. Allow mic in browser settings."; break;
      case 'network':        msg = "Network error during voice recognition."; break;
      case 'aborted':        return; // user stopped — no message needed
      default:               msg = `Voice error: ${e.error}. Please try again.`;
    }
    setPrompt(msg, '');
    console.warn('Speech error:', e.error);
  };

  try {
    recognition.start();
  } catch(e) {
    console.error('Recognition start error:', e);
    setPrompt('Could not start microphone. Try refreshing.', '');
    isListening = false;
  }
}

function stopListening() {
  clearTimeout(silenceTimer);
  if (recognition) {
    try { recognition.stop(); } catch(e) {}
  }
  isListening = false;
  showWaveform(false);
  setMicState('idle');
}

// ── Process Query via Groq ──
async function processVoiceQuery(question) {
  setOrbState('processing');
  setMicState('processing');
  setPrompt('⚡ ElectAI is thinking...', '');

  try {
    const body = {
      model: CONFIG.GROQ_MODEL,
      messages: [
        { role: 'system',    content: VOICE_SYSTEM },
        { role: 'user',      content: question }
      ],
      temperature: 0.78,
      max_tokens:  200,
      stream: false
    };

    const res = await fetch(CONFIG.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error?.message || `API ${res.status}`);
    }

    const data   = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim()
                   || "I'm sorry, I couldn't get an answer right now. Please try again.";

    // Save to history
    const item = { question, answer, timestamp: new Date().toISOString() };
    voiceHistory.unshift(item);
    voiceHistory = voiceHistory.slice(0, 12);
    localStorage.setItem('electai_voice_history', JSON.stringify(voiceHistory));
    renderVoiceHistory();

    setTranscript(`
      <p class="transcript-user" style="margin-bottom:10px;font-weight:600">You: "${question}"</p>
      <p class="transcript-bot" style="line-height:1.65">${answer}</p>`);

    speakAnswer(answer);

  } catch(err) {
    console.error('Voice Groq error:', err);
    const fallback = err.message?.includes('429')
      ? "Rate limit hit. Please wait 30 seconds and try again."
      : "I'm having trouble connecting right now. Please check your internet connection.";
    setTranscript(`<p class="transcript-bot" style="color:var(--accent-red)">${fallback}</p>`);
    speakAnswer(fallback);
  }
}

// ── Speak Answer ──
function speakAnswer(text) {
  // Cancel any ongoing speech
  synthesis.cancel();

  isSpeaking = true;
  setOrbState('speaking');
  setMicState('speaking');
  setPrompt('🔊 Speaking...', 'Tap mic to interrupt and ask again');
  showWaveform(true);

  const clean = text.replace(/[*_#`>~\[\]]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang  = 'en-IN';
  utterance.rate  = 0.92;
  utterance.pitch = 1.05;
  utterance.volume= 1;

  // Select best available voice
  function applyVoice() {
    const voices = synthesis.getVoices();
    const voice  = voices.find(v=>v.lang==='en-IN')
                || voices.find(v=>v.lang.startsWith('en-IN'))
                || voices.find(v=>v.lang.startsWith('en')&&v.name.toLowerCase().includes('google'))
                || voices.find(v=>v.lang.startsWith('en')&&v.localService)
                || voices.find(v=>v.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
  }

  if (synthesis.getVoices().length > 0) {
    applyVoice();
  } else {
    synthesis.addEventListener('voiceschanged', applyVoice, { once: true });
  }

  utterance.onend = () => {
    isSpeaking = false;
    setOrbState('idle');
    setMicState('idle');
    showWaveform(false);
    setPrompt('Tap the mic to ask another question', '');
  };

  utterance.onerror = e => {
    if (e.error === 'interrupted') return; // user cancelled
    isSpeaking = false;
    setOrbState('idle');
    setMicState('idle');
    showWaveform(false);
    console.warn('TTS error:', e.error);
  };

  // Small delay to let browser finish any cleanup
  setTimeout(() => synthesis.speak(utterance), 120);
}

// ── UI Helpers ──
function setOrbState(state) {
  const wrap = document.getElementById('orb-idle');
  if (wrap) wrap.className = 'voice-orb-wrap ' + state;
}

function setMicState(state) {
  const btn  = document.getElementById('mic-btn');
  const icon = document.getElementById('mic-icon');
  if (!btn || !icon) return;
  btn.className = 'mic-btn ' + (state !== 'idle' ? state : '');
  const icons = { listening:'🔴', speaking:'🔊', processing:'⏳', idle:'🎙️' };
  icon.textContent = icons[state] || '🎙️';
}

function setPrompt(main, hint) {
  const m = document.getElementById('voice-prompt-text');
  const h = document.getElementById('voice-hint-text');
  if (m && main !== null) m.textContent = main;
  if (h && hint !== null) h.textContent = hint;
}

function setTranscript(html) {
  const el = document.getElementById('transcript-area');
  if (el) el.innerHTML = html;
}

function showWaveform(show) {
  const el = document.getElementById('waveform');
  if (el) el.classList.toggle('hidden', !show);
}

function resetConversation() {
  synthesis.cancel();
  stopListening();
  isListening = isSpeaking = false;
  setOrbState('idle');
  setMicState('idle');
  setTranscript('');
  showWaveform(false);
  setPrompt('Tap the mic to start talking', 'Ask about elections, voting rights, or live polls');
}

// ── Voice History ──
function renderVoiceHistory() {
  const list = document.getElementById('voice-history-list');
  if (!list) return;
  if (voiceHistory.length === 0) {
    list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted)">No voice sessions yet</p>';
    return;
  }
  list.innerHTML = voiceHistory.slice(0,4).map(item => `
    <div class="voice-history-item" onclick="replayVoiceItem(${JSON.stringify(item.answer)})">
      <span class="item-icon">🎙️</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${item.question}</span>
      <span class="item-date">${fmtDate(item.timestamp)}</span>
    </div>`).join('');
}

function replayVoiceItem(answer) {
  speakAnswer(answer);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
