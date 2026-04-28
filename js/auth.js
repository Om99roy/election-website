// ElectAI — Auth Logic (localStorage-based)

function switchTab(tab) {
  const loginForm  = document.getElementById('form-login');
  const signupForm = document.getElementById('form-signup');
  const tabLogin   = document.getElementById('tab-login');
  const tabSignup  = document.getElementById('tab-signup');
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
  } else {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
  }
}

function togglePass(id, btn) {
  const input = document.getElementById(id);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁️'; }
}

function previewPhoto(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      const wrap = document.getElementById('photo-preview-wrap');
      wrap.innerHTML = `<img src="${e.target.result}" class="photo-preview-img" alt="Profile preview"/>
        <span class="upload-text" style="margin-top:8px">Photo selected ✅</span>`;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const btnTxt= document.getElementById('login-btn-text');
  const spin  = document.getElementById('login-spinner');

  btn.disabled = true;
  btnTxt.classList.add('hidden');
  spin.classList.remove('hidden');

  setTimeout(() => {
    const users = JSON.parse(localStorage.getItem('electai_users') || '[]');
    const user  = users.find(u => u.email === email && u.password === pass);
    if (user) {
      localStorage.setItem('electai_current_user', JSON.stringify(user));
      showToast('✅ Login successful! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'face-verify.html'; }, 1200);
    } else {
      showToast('❌ Invalid email or password', 'error');
      btn.disabled = false;
      btnTxt.classList.remove('hidden');
      spin.classList.add('hidden');
    }
  }, 1200);
}

function handleSignup(e) {
  e.preventDefault();
  const name  = document.getElementById('su-name').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const state = document.getElementById('su-state').value;
  const voterId = document.getElementById('su-voter-id').value.trim();
  const pass  = document.getElementById('su-pass').value;
  const pass2 = document.getElementById('su-pass2').value;
  const photo = document.getElementById('su-photo');
  const btn   = document.getElementById('signup-btn');
  const btnTxt= document.getElementById('signup-btn-text');
  const spin  = document.getElementById('signup-spinner');

  if (pass !== pass2) { showToast('❌ Passwords do not match', 'error'); return; }

  btn.disabled = true;
  btnTxt.classList.add('hidden');
  spin.classList.remove('hidden');

  const readPhoto = () => new Promise(resolve => {
    if (photo.files && photo.files[0]) {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(photo.files[0]);
    } else resolve(null);
  });

  readPhoto().then(photoData => {
    const users = JSON.parse(localStorage.getItem('electai_users') || '[]');
    if (users.find(u => u.email === email)) {
      showToast('❌ Email already registered. Please login.', 'error');
      btn.disabled = false;
      btnTxt.classList.remove('hidden');
      spin.classList.add('hidden');
      return;
    }
    const user = { id: Date.now(), name, phone, email, state, voterId, password: pass, photo: photoData, joinedAt: new Date().toISOString(), faceVerified: false };
    users.push(user);
    localStorage.setItem('electai_users', JSON.stringify(users));
    localStorage.setItem('electai_current_user', JSON.stringify(user));
    showToast('🎉 Account created! Going to face verification...', 'success');
    setTimeout(() => { window.location.href = 'face-verify.html'; }, 1500);
  });
}

// Check if already logged in (on protected pages)
function requireAuth() {
  const user = JSON.parse(localStorage.getItem('electai_current_user') || 'null');
  if (!user) { window.location.href = 'login.html'; return null; }
  return user;
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem('electai_current_user') || 'null');
}

function logout() {
  localStorage.removeItem('electai_current_user');
  window.location.href = 'index.html';
}

function updateUser(updates) {
  const user  = getCurrentUser();
  if (!user) return;
  const merged = { ...user, ...updates };
  localStorage.setItem('electai_current_user', JSON.stringify(merged));
  const users = JSON.parse(localStorage.getItem('electai_users') || '[]');
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx > -1) { users[idx] = merged; localStorage.setItem('electai_users', JSON.stringify(users)); }
  return merged;
}

// Toast notification
function showToast(msg, type = 'info') {
  let existing = document.getElementById('toast-msg');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast-msg';
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3500);
}
