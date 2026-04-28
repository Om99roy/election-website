// ElectAI — Typewriter / Auto-typing Effect

class Typewriter {
  constructor(element, options = {}) {
    this.el = typeof element === 'string' ? document.querySelector(element) : element;
    this.texts = options.texts || [''];
    this.speed = options.speed || 60;
    this.deleteSpeed = options.deleteSpeed || 35;
    this.pauseEnd = options.pauseEnd || 2200;
    this.pauseStart = options.pauseStart || 500;
    this.loop = options.loop !== false;
    this.cursor = options.cursor !== false;
    this.textIndex = 0;
    this.charIndex = 0;
    this.isDeleting = false;
    if (this.cursor && this.el) {
      this.el.classList.add('tw-cursor');
      if (!document.getElementById('tw-cursor-style')) {
        const s = document.createElement('style');
        s.id = 'tw-cursor-style';
        s.textContent = `.tw-cursor{border-right:2px solid var(--accent-purple);padding-right:2px;animation:blink-cursor 0.8s step-end infinite}@keyframes blink-cursor{0%,100%{border-color:var(--accent-purple)}50%{border-color:transparent}}`;
        document.head.appendChild(s);
      }
    }
    if (this.el) this.tick();
  }
  tick() {
    const fullText = this.texts[this.textIndex];
    if (this.isDeleting) {
      this.charIndex--;
      this.el.textContent = fullText.substring(0, this.charIndex);
      if (this.charIndex === 0) {
        this.isDeleting = false;
        this.textIndex = (this.textIndex + 1) % this.texts.length;
        setTimeout(() => this.tick(), this.pauseStart);
        return;
      }
      setTimeout(() => this.tick(), this.deleteSpeed);
    } else {
      this.charIndex++;
      this.el.textContent = fullText.substring(0, this.charIndex);
      if (this.charIndex === fullText.length) {
        if (!this.loop && this.textIndex === this.texts.length - 1) return;
        setTimeout(() => { this.isDeleting = true; this.tick(); }, this.pauseEnd);
        return;
      }
      setTimeout(() => this.tick(), this.speed);
    }
  }
}

function initTypewriters() {
  document.querySelectorAll('[data-typewriter]').forEach(el => {
    const texts = el.dataset.typewriter.split('|').map(t => t.trim());
    const speed = parseInt(el.dataset.twSpeed) || 60;
    const pause = parseInt(el.dataset.twPause) || 2200;
    new Typewriter(el, { texts, speed, pauseEnd: pause });
  });
}
document.addEventListener('DOMContentLoaded', initTypewriters);
