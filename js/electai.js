// ============================================================
// ElectAI — Core AI Engine  (Groq API — LLaMA 3.3 70B)
// ============================================================

const SYSTEM_PROMPT = `You are ElectAI, an expert AI assistant specializing in Indian elections, democracy, and civic education. You were built to educate Indian citizens about:

1. The Indian election process — all phases, timelines, ECI rules (from announcement to results)
2. Current and upcoming elections in India (West Bengal, Tamil Nadu, Bihar, Maharashtra, Odisha, etc.)
3. Voting rights and legal protections under Indian law
4. Representation of the People Act 1951 and Election Commission of India guidelines
5. IPC sections related to election offences: 171B, 171C, 171D, 171E, 171F
6. RPA Sections 58A, 135, 135A — booth capturing and related offences
7. Model Code of Conduct (MCC) and when it applies
8. How EVMs and VVPATs work
9. NOTA (None of the Above) option
10. Proxy voting, booth capturing, and how to report violations
11. Election violence reporting — cVIGIL app, National Voter Helpline 1950

Guidelines:
- Always give accurate, factual, useful information about Indian elections
- Be conversational, warm, and educational — like a knowledgeable friend
- Use emojis appropriately to make responses engaging
- Format with bullet points or numbered lists when explaining processes
- For legal questions, recommend consulting ECI or legal authorities
- NEVER repeat the same phrasing as a previous response — always vary your wording
- Keep responses well-structured but not overly long (3–6 paragraphs max)
- For emergency/violence situations, ALWAYS include: Police: 100, Voter Helpline: 1950, cVIGIL app
- Current date context: April 28, 2025`;

// ── State ──
let chatSessions = JSON.parse(localStorage.getItem('electai_chats') || '[]');
let currentSession = null;
let isTyping = false;
let voiceInputActive = false;
let speechRecognition = null;

// ── DOM refs ──
const messagesContainer = document.getElementById('messages-container');
const chatWelcome       = document.getElementById('chat-welcome');
const typingIndicator   = document.getElementById('typing-indicator');
const chatInput         = document.getElementById('chat-input');
const sendBtn           = document.getElementById('send-btn');
const historyList       = document.getElementById('chat-history-list');

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initWelcomeOrb();
  loadChatHistory();

  // Handle quick ask from dashboard
  const quickAsk = sessionStorage.getItem('electai_quick_ask');
  if (quickAsk) {
    sessionStorage.removeItem('electai_quick_ask');
    newChat();
    setTimeout(() => { chatInput.value = quickAsk; sendMessage(); }, 300);
  } else if (chatSessions.length > 0) {
    loadSession(chatSessions[0].id, false);
  } else {
    newChat();
  }
});

// ── Welcome Orb ──
function initWelcomeOrb() {
  const c = document.getElementById('welcome-orb');
  if (!c) return;
  const ctx = c.getContext('2d');
  const pts = [];
  for (let i = 0; i < 200; i++) {
    const theta = Math.acos(1 - 2*(i/200));
    const phi   = Math.PI*(1+Math.sqrt(5))*i;
    pts.push({ ox:Math.sin(theta)*Math.cos(phi), oy:Math.sin(theta)*Math.sin(phi), oz:Math.cos(theta), r:1.4+Math.random()*1.4 });
  }
  let t = 0;
  (function draw() {
    ctx.clearRect(0,0,200,200);
    const R=74; t+=0.014;
    pts.forEach(p => {
      const ry=p.ox*Math.cos(t*0.5)-p.oz*Math.sin(t*0.5);
      const rz=p.ox*Math.sin(t*0.5)+p.oz*Math.cos(t*0.5);
      const rx=p.oy;
      const n=1+0.18*Math.sin(3*rz+t)*Math.cos(3*rx+t*0.7);
      const sc=R*n; const z=(rz+1)/2;
      ctx.beginPath(); ctx.arc(100+rx*sc,100+ry*sc,p.r*z,0,Math.PI*2);
      ctx.fillStyle=`hsla(${270+z*80},80%,70%,${0.55*z})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  })();
}

// ── Session ──
function newChat() {
  const s = { id:Date.now().toString(), title:'New Chat', messages:[], createdAt:new Date().toISOString() };
  currentSession = s;
  chatSessions.unshift(s);
  saveSessions();
  renderMessages();
  showWelcome(true);
  loadChatHistory();
  const el = document.getElementById('chat-subtitle-text');
  if (el) el.textContent = 'Indian Elections Expert';
}

function loadSession(id, scroll=true) {
  const s = chatSessions.find(s=>s.id===id);
  if (!s) return;
  currentSession = s;
  renderMessages(scroll);
  showWelcome(s.messages.length===0);
  document.querySelectorAll('.history-item').forEach(el=>el.classList.toggle('active',el.dataset.id===id));
}

function saveSessions() {
  chatSessions = chatSessions.slice(0,20);
  localStorage.setItem('electai_chats', JSON.stringify(chatSessions));
}

function loadChatHistory() {
  if (!historyList) return;
  historyList.innerHTML = '';
  chatSessions.forEach(s => {
    const item = document.createElement('div');
    item.className = `history-item${s.id===currentSession?.id?' active':''}`;
    item.dataset.id = s.id;
    item.innerHTML = `<span class="history-item-icon">💬</span><span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.title||'Chat')}</span>`;
    item.onclick = () => { loadSession(s.id); closeSidebar(); };
    historyList.appendChild(item);
  });
}

function showWelcome(show) {
  if (!chatWelcome) return;
  chatWelcome.style.display = show ? 'flex' : 'none';
}

function renderMessages(scroll=true) {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = '';
  if (!currentSession) return;
  currentSession.messages.forEach(msg => appendMessageDOM(msg, false));
  if (scroll) scrollToBottom();
}

// ── Send Message ──
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isTyping) return;
  if (!currentSession) newChat();

  chatInput.value = '';
  autoResize(chatInput);
  showWelcome(false);

  const userMsg = { role:'user', text, timestamp:new Date().toISOString() };
  currentSession.messages.push(userMsg);
  appendMessageDOM(userMsg);

  if (currentSession.messages.filter(m=>m.role==='user').length===1) {
    currentSession.title = text.substring(0,42)+(text.length>42?'...':'');
    loadChatHistory();
  }
  saveSessions();
  await fetchAIResponse(text);
}

// ── Groq API ──
async function fetchAIResponse(userText) {
  isTyping = true;
  sendBtn.disabled = true;
  typingIndicator.classList.remove('hidden');
  scrollToBottom();

  try {
    // Build message history for context (last 20 turns)
    const history = currentSession.messages.slice(-20).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    const body = {
      model: CONFIG.GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history
      ],
      temperature: 0.82,
      max_tokens: 1024,
      top_p: 0.9,
      stream: false
    };

    const res = await fetch(CONFIG.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error ${res.status}`);
    }

    const data = await res.json();
    const responseText = data.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

    const botMsg = { role:'bot', text:responseText, timestamp:new Date().toISOString() };
    currentSession.messages.push(botMsg);
    saveSessions();
    typingIndicator.classList.add('hidden');
    appendMessageDOM(botMsg);

  } catch(err) {
    console.error('ElectAI Groq Error:', err);
    typingIndicator.classList.add('hidden');
    const errMsg = err.message || '';
    let friendly = `⚠️ Connection issue. Please try again.\n\n_${err.message}_`;
    if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate')) {
      friendly = `⏳ **Rate limit reached.** Groq free tier allows limited requests/minute. Please wait 30 seconds and try again.`;
    } else if (errMsg.includes('401') || errMsg.toLowerCase().includes('auth')) {
      friendly = `🔑 **API key error.** Please check the Groq API key.`;
    }
    const errorMsg = { role:'bot', text:friendly, timestamp:new Date().toISOString(), isError:true };
    currentSession.messages.push(errorMsg);
    saveSessions();
    appendMessageDOM(errorMsg);
  } finally {
    isTyping = false;
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

// ── Append Message DOM ──
function appendMessageDOM(msg, animate=true) {
  const isUser = msg.role === 'user';
  const user   = getCurrentUser();
  const row    = document.createElement('div');
  row.className = `msg-row ${isUser?'user':'bot'}`;
  if (!animate) row.style.animation='none';

  const time    = formatTime(msg.timestamp);
  const htmlText= isUser ? escapeHtml(msg.text) : markdownToHtml(msg.text);

  if (isUser) {
    const avatar = user?.photo
      ? `<img src="${user.photo}" alt="You" style="width:32px;height:32px;object-fit:cover;border-radius:10px"/>`
      : '👤';
    row.innerHTML = `
      <div class="user-msg-avatar">${avatar}</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">${htmlText}</div>
        <div class="msg-time">${time}</div>
      </div>`;
  } else {
    row.innerHTML = `
      <div class="bot-msg-avatar">✦</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">${htmlText}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" title="Copy"       onclick="copyMsg(this,${JSON.stringify(msg.text)})">📋</button>
          <button class="msg-action-btn" title="Like"       onclick="likeMsg(this)">👍</button>
          <button class="msg-action-btn" title="Speak"      onclick="speakMsg(${JSON.stringify(msg.text)})">🔊</button>
          <button class="msg-action-btn" title="Regenerate" onclick="regenerateMsg()">🔄</button>
        </div>
        <div class="msg-time">${time}</div>
      </div>`;
  }
  messagesContainer.appendChild(row);
  if (animate) scrollToBottom();
}

// ── Action Handlers ──
function copyMsg(btn, text) {
  navigator.clipboard.writeText(text).then(() => { btn.textContent='✅'; setTimeout(()=>btn.textContent='📋',2000); });
}
function likeMsg(btn) {
  btn.classList.toggle('liked');
  btn.textContent = btn.classList.contains('liked') ? '💚' : '👍';
}
function speakMsg(text) {
  const clean = text.replace(/[*_#`>~]/g,'').replace(/\n+/g,' ');
  const u = new SpeechSynthesisUtterance(clean);
  u.lang='en-IN'; u.rate=0.95; u.pitch=1.05;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v=>v.lang.includes('en-IN'))||voices.find(v=>v.lang.includes('en')&&v.name.includes('Google'))||voices.find(v=>v.lang.includes('en'));
  if (preferred) u.voice=preferred;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
async function regenerateMsg() {
  if (isTyping||!currentSession) return;
  const msgs = currentSession.messages;
  let lastUserIdx=-1;
  for (let i=msgs.length-1;i>=0;i--) { if(msgs[i].role==='user'){lastUserIdx=i;break;} }
  if (lastUserIdx===-1) return;
  currentSession.messages = msgs.slice(0,lastUserIdx+1);
  saveSessions();
  renderMessages(false);
  await fetchAIResponse(msgs[lastUserIdx].text);
}

// ── Voice Input (in chat) ──
function startVoiceInput() {
  const btn = document.getElementById('voice-input-btn');
  if (voiceInputActive) {
    if (speechRecognition) speechRecognition.stop();
    voiceInputActive=false; btn.classList.remove('active'); btn.textContent='🎙️'; return;
  }
  const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
  if (!SR) { showToast('Voice input needs Chrome or Edge','error'); return; }

  speechRecognition = new SR();
  speechRecognition.lang = 'en-IN';
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 3;

  speechRecognition.onstart = () => { voiceInputActive=true; btn.classList.add('active'); btn.textContent='🔴'; };
  speechRecognition.onresult = e => {
    const best = e.results[e.results.length-1];
    chatInput.value = best[0].transcript;
    autoResize(chatInput);
  };
  speechRecognition.onend = () => {
    voiceInputActive=false; btn.classList.remove('active'); btn.textContent='🎙️';
    if (chatInput.value.trim()) sendMessage();
  };
  speechRecognition.onerror = e => {
    voiceInputActive=false; btn.classList.remove('active'); btn.textContent='🎙️';
    if (e.error!=='aborted') showToast(`Voice error: ${e.error}`,'error');
  };
  speechRecognition.start();
}

// ── Quick Topic ──
function askTopic(text) {
  if (!currentSession) newChat();
  chatInput.value = text;
  sendMessage();
}

// ── Utilities ──
function handleInputKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,160)+'px'; }
function scrollToBottom() { const a=document.getElementById('chat-messages'); if(a) setTimeout(()=>a.scrollTop=a.scrollHeight,50); }
function clearChat() {
  if (!currentSession||!confirm('Clear this chat?')) return;
  currentSession.messages=[]; currentSession.title='New Chat';
  saveSessions(); renderMessages(); showWelcome(true); loadChatHistory();
}
function formatTime(iso) { if(!iso) return ''; return new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function markdownToHtml(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<h4 style="margin:10px 0 4px;font-weight:700;font-size:0.95rem">$1</h4>')
    .replace(/^## (.+)$/gm,'<h3 style="margin:12px 0 6px;font-weight:700">$1</h3>')
    .replace(/^# (.+)$/gm,'<h2 style="margin:12px 0 6px;font-weight:800">$1</h2>')
    .replace(/^\s*[-*]\s+(.+)$/gm,'<li style="margin-bottom:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>[\s\S]*?)(?=(?:<li|$))/g, m => `<ul style="padding-left:18px;margin:6px 0">${m}</ul>`)
    .replace(/^\d+\.\s+(.+)$/gm,'<li style="margin-bottom:4px">$1</li>')
    .replace(/\n\n+/g,'</p><p style="margin-bottom:8px;margin-top:4px">')
    .replace(/\n/g,'<br>')
    .replace(/^/,'<p style="margin:0">')
    + '</p>';
}

// ── Sidebar ──
function openSidebar() {
  document.getElementById('chat-sidebar').classList.add('open');
  let ov=document.getElementById('sidebar-overlay');
  if(!ov){ov=document.createElement('div');ov.id='sidebar-overlay';ov.className='sidebar-overlay';ov.onclick=closeSidebar;document.body.appendChild(ov);}
  ov.classList.add('show');
}
function closeSidebar() {
  document.getElementById('chat-sidebar').classList.remove('open');
  const ov=document.getElementById('sidebar-overlay');
  if(ov) ov.classList.remove('show');
}

function showToast(msg,type='info') {
  let t=document.getElementById('toast-msg');
  if(t)t.remove();
  t=document.createElement('div');t.id='toast-msg';t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity 0.4s';setTimeout(()=>t.remove(),400);},3500);
}
