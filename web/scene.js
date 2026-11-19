/* Studio Ghibli Watercolor & Seasonal Scene Engine (Fixed 24 FPS for Odroid C2) */
'use strict';

(function () {
  const canvas = document.getElementById('zen-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let mouseX = -1000;
  let mouseY = -1000;
  let targetMouseX = -1000;
  let targetMouseY = -1000;
  let currentMode = document.documentElement.dataset.mode || 'day';
  let currentSeason = document.documentElement.dataset.season || 'kemarau';
  let animMode = localStorage.getItem('mm-anim') || 'full';
  let isVisible = true;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) animMode = 'off';

  const particles = [];
  const clouds = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initClouds();
    initParticles();
    drawFrame(performance.now());
  }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    isVisible = !document.hidden;
  });

  window.addEventListener('mousemove', e => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
  }, { passive: true });

  function initClouds() {
    clouds.length = 0;
    const count = 5;
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: (width / count) * i + Math.random() * 120,
        y: height * (0.08 + Math.random() * 0.24),
        scale: 0.7 + Math.random() * 0.9,
        speed: 0.12 + Math.random() * 0.18
      });
    }
  }

  function initParticles() {
    particles.length = 0;
    if (animMode === 'off') return;
    const baseCount = currentSeason === 'hujan' ? 56 : 36;
    const count = animMode === 'eco' ? Math.round(baseCount * 0.45) : baseCount;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: currentSeason === 'hujan' ? -1.4 : (Math.random() - 0.5) * 0.65,
        vy: currentSeason === 'hujan' ? (5 + Math.random() * 4) : (currentSeason === 'summer' || currentSeason === 'ramadhan' || currentSeason === 'merdeka' ? -(0.25 + Math.random() * 0.5) : (0.35 + Math.random() * 0.85)),
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.035,
        alpha: 0.35 + Math.random() * 0.5,
        phase: Math.random() * 10
      });
    }
  }

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    if (currentMode === 'night') {
      if (currentSeason === 'ramadhan') {
        grad.addColorStop(0, '#121829');
        grad.addColorStop(0.65, '#1d2740');
        grad.addColorStop(1, '#2b2c3a');
      } else if (currentSeason === 'merdeka') {
        grad.addColorStop(0, '#1d1624');
        grad.addColorStop(0.65, '#2b1e2d');
        grad.addColorStop(1, '#1d2230');
      } else {
        grad.addColorStop(0, '#111622');
        grad.addColorStop(0.65, '#1b2436');
        grad.addColorStop(1, '#232c3d');
      }
    } else {
      if (currentSeason === 'sakura') {
        grad.addColorStop(0, '#dbe9f4');
        grad.addColorStop(0.65, '#f6ebe9');
        grad.addColorStop(1, '#f4ede0');
      } else if (currentSeason === 'autumn') {
        grad.addColorStop(0, '#d8e4ec');
        grad.addColorStop(0.6, '#f2e3ce');
        grad.addColorStop(1, '#f4ede0');
      } else if (currentSeason === 'hujan') {
        grad.addColorStop(0, '#cbd7df');
        grad.addColorStop(0.65, '#e2e8e8');
        grad.addColorStop(1, '#eceae2');
      } else if (currentSeason === 'winter') {
        grad.addColorStop(0, '#d5e4f0');
        grad.addColorStop(0.65, '#eaf1f6');
        grad.addColorStop(1, '#f3f2ee');
      } else {
        grad.addColorStop(0, '#cfe3ef');
        grad.addColorStop(0.55, '#ece9dc');
        grad.addColorStop(1, '#f4ede0');
      }
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  function drawCelestial(px) {
    if (currentMode === 'night' || currentSeason === 'ramadhan') {
      const mx = width * 0.84 + px * 0.2;
      const my = height * 0.16;
      ctx.save();
      ctx.fillStyle = currentSeason === 'ramadhan' ? 'rgba(244, 206, 114, 0.88)' : 'rgba(243, 232, 198, 0.75)';
      ctx.beginPath();
      ctx.arc(mx, my, 24, 0, Math.PI * 2);
      ctx.fill();
      if (currentSeason === 'ramadhan') {
        ctx.fillStyle = currentMode === 'night' ? '#141b2e' : '#dbe7ee';
        ctx.beginPath();
        ctx.arc(mx + 9, my - 5, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (currentSeason === 'kemarau' || currentSeason === 'summer') {
      const sx = width * 0.85 + px * 0.15;
      const sy = height * 0.15;
      const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 90);
      sun.addColorStop(0, 'rgba(255, 224, 145, 0.55)');
      sun.addColorStop(1, 'rgba(255, 224, 145, 0)');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(sx, sy, 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGhibliClouds() {
    ctx.save();
    ctx.fillStyle = currentMode === 'night' ? 'rgba(180, 198, 224, 0.08)' : 'rgba(255, 253, 247, 0.65)';
    for (const c of clouds) {
      if (animMode !== 'off') {
        c.x += c.speed;
        if (c.x > width + 180) c.x = -180;
      }
      const s = c.scale;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 26 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 24 * s, c.y - 10 * s, 32 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 56 * s, c.y - 4 * s, 26 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 76 * s, c.y + 4 * s, 20 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRollingHills(px) {
    // Distant Mount Slamet watercolor ridge
    ctx.fillStyle = currentMode === 'night' ? 'rgba(24, 34, 48, 0.72)' : 'rgba(130, 162, 146, 0.34)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.74);
    ctx.quadraticCurveTo(width * 0.25 + px * 0.25, height * 0.62, width * 0.48 + px * 0.3, height * 0.56);
    ctx.quadraticCurveTo(width * 0.72 + px * 0.25, height * 0.66, width, height * 0.72);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Foreground soft meadow hill (Ghibli countryside)
    ctx.fillStyle = currentMode === 'night' ? 'rgba(18, 28, 36, 0.82)' : 'rgba(104, 148, 114, 0.26)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.85);
    ctx.quadraticCurveTo(width * 0.3 + px * 0.5, height * 0.76, width * 0.65 + px * 0.5, height * 0.84);
    ctx.quadraticCurveTo(width * 0.85 + px * 0.5, height * 0.88, width, height * 0.81);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticles(time) {
    if (animMode === 'off') return;
    for (const p of particles) {
      p.x += p.vx + Math.sin(time + p.phase) * (currentSeason === 'hujan' ? 0 : 0.35);
      p.y += p.vy;
      p.rot += p.vrot;

      if (p.vy > 0 && p.y > height + 20) { p.y = -15; p.x = Math.random() * width; }
      if (p.vy < 0 && p.y < -20) { p.y = height + 15; p.x = Math.random() * width; }
      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (currentSeason === 'sakura') {
        ctx.fillStyle = `rgba(235, 152, 178, ${p.alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.1, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (currentSeason === 'autumn') {
        ctx.fillStyle = p.phase > 5 ? `rgba(198, 92, 52, ${p.alpha})` : `rgba(218, 148, 56, ${p.alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (currentSeason === 'winter') {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.48, 0, Math.PI * 2);
        ctx.fill();
      } else if (currentSeason === 'hujan') {
        ctx.rotate(0);
        ctx.strokeStyle = currentMode === 'night' ? `rgba(170, 205, 232, ${p.alpha * 0.55})` : `rgba(92, 126, 152, ${p.alpha * 0.55})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-3, 12);
        ctx.stroke();
      } else if (currentSeason === 'ramadhan') {
        ctx.rotate(0);
        ctx.fillStyle = `rgba(232, 178, 72, ${p.alpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.7, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.7, 0);
        ctx.closePath();
        ctx.fill();
      } else if (currentSeason === 'merdeka') {
        ctx.fillStyle = p.phase > 5 ? `rgba(196, 56, 56, ${p.alpha * 0.78})` : `rgba(248, 245, 238, ${p.alpha * 0.85})`;
        ctx.beginPath();
        ctx.roundRect(-p.size * 0.6, -p.size * 0.8, p.size * 1.2, p.size * 1.6, 3);
        ctx.fill();
      } else if (currentSeason === 'summer') {
        const pulse = 0.45 + Math.abs(Math.sin(time * 2 + p.phase)) * 0.55;
        ctx.fillStyle = `rgba(245, 212, 102, ${p.alpha * pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Kemarau: warm dandelion seeds drifting
        ctx.fillStyle = currentMode === 'night' ? `rgba(235, 214, 158, ${p.alpha * 0.6})` : `rgba(122, 152, 98, ${p.alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFrame(now) {
    ctx.clearRect(0, 0, width, height);
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;
    const px = (mouseX / (width || 1) - 0.5) * 16;

    drawSky();
    drawCelestial(px);
    drawGhibliClouds();
    drawRollingHills(px);
    drawParticles(now * 0.001);
  }

  let lastFrame = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!isVisible) return;
    if (animMode === 'off') return;
    const targetMs = animMode === 'eco' ? 83 : 42;
    if (now - lastFrame < targetMs) return;
    lastFrame = now;
    drawFrame(now);
  }

  window.MastermindScene = {
    setMode(mode) {
      currentMode = mode === 'night' ? 'night' : 'day';
      drawFrame(performance.now());
    },
    setSeason(season) {
      currentSeason = season || 'kemarau';
      initParticles();
      drawFrame(performance.now());
    },
    setTheme(theme) {
      currentSeason = theme || 'kemarau';
      initParticles();
      drawFrame(performance.now());
    },
    setAnimMode(mode) {
      animMode = mode;
      localStorage.setItem('mm-anim', mode);
      initParticles();
      drawFrame(performance.now());
    }
  };

  resize();
  requestAnimationFrame(tick);
})();
