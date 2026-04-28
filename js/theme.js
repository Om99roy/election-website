// ============================================================
// ElectAI — Theme Manager (Dark / Light / System)
// ============================================================

const ThemeManager = (() => {
  const STORAGE_KEY = 'electai-theme';
  const THEMES = { DARK: 'dark', LIGHT: 'light', SYSTEM: 'system' };
  const ICONS  = { dark: '🌙', light: '☀️', system: '💻' };
  const LABELS = { dark: 'Dark', light: 'Light', system: 'System' };

  let currentTheme = localStorage.getItem(STORAGE_KEY) || THEMES.DARK;

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === THEMES.SYSTEM) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? THEMES.DARK : THEMES.LIGHT);
    } else {
      root.setAttribute('data-theme', theme);
    }
    currentTheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    updateToggleButtons();
  }

  function cycle() {
    const order = [THEMES.DARK, THEMES.LIGHT, THEMES.SYSTEM];
    const idx   = order.indexOf(currentTheme);
    applyTheme(order[(idx + 1) % order.length]);
  }

  function set(theme) {
    if (Object.values(THEMES).includes(theme)) applyTheme(theme);
  }

  function updateToggleButtons() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = ICONS[currentTheme] || '🌙';
      btn.title = `Theme: ${LABELS[currentTheme]} (click to switch)`;
    });
    document.querySelectorAll('[data-theme-label]').forEach(el => {
      el.textContent = LABELS[currentTheme] || 'Dark';
    });
    // Update radio/select pickers
    document.querySelectorAll('.theme-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.theme === currentTheme);
    });
  }

  function init() {
    applyTheme(currentTheme);
    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === THEMES.SYSTEM) applyTheme(THEMES.SYSTEM);
    });
    // Attach click handlers to all theme toggle buttons
    document.addEventListener('click', e => {
      if (e.target.closest('.theme-toggle')) cycle();
      const opt = e.target.closest('.theme-option');
      if (opt && opt.dataset.theme) set(opt.dataset.theme);
    });
  }

  return { init, set, cycle, get: () => currentTheme, THEMES, ICONS };
})();

document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
