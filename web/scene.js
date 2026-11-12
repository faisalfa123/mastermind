/* ==========================================================================
   MASTERMIND LIVING ZEN SCENE ENGINE
   Canvas 12-24 FPS Adaptive Animated Backgrounds with cursor physics:
   - Matcha Forest: layered fir trees, Kaligua tea leaves drifting, fireflies
   - Sakura Dusk: Torii shrine silhouette, twilight sky, falling cherry blossoms
   - Bamboo Mist: swaying bamboo stalks, rolling fog layers, morning dew
   - Onsen Slate: volcanic hot spring rockpool, pulsing steam vapors, ripple water
   - Slamet Dawn: Mount Slamet sunrise, onion farm terrace, morning breeze
   ========================================================================== */
'use strict';

(function () {
  const canvas = document.getElementById('zen-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0, height = 0;
  let mouseX = -1000, mouseY = -1000;
  let targetMouseX = -1000, targetMouseY = -1000;
  let currentTheme = document.documentElement.dataset.theme || 'matcha';
  let animMode = localStorage.getItem('mm-anim') || 'full'; // 'full' | 'eco' | 'off'
  let isVisible = true;
  let lastTime = performance.now();

  // Particle storage
  const particles = [];
  const ripplers = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initThemeParticles();
  }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    isVisible = !document.hidden;
  });

  window.addEventListener('mousemove', e => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
    if (Math.random() < 0.15 && currentTheme === 'onsen') {
      ripplers.push({ x: e.clientX, y: e.clientY, r: 2, maxR: 40 + Math.random() * 30, a: 0.6 });
    }
  }, { passive: true });

  function initThemeParticles() {
    particles.length = 0;
    if (animMode === 'off') return;

    const count = animMode === 'eco' ? 22 : 55;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.4 + Math.random() * 1.2,
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.05,
        alpha: 0.3 + Math.random() * 0.6,
        phase: Math.random() * 10
      });
    }
  }

  // Draw scene layers per theme
  function drawBackground() {
    ctx.clearRect(0, 0, width, height);
    if (animMode === 'off') return;

    // Smooth cursor interpolation
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;

    const parallaxX = (mouseX / (width || 1) - 0.5) * 20;

    if (currentTheme === 'sakura') {
      drawSakuraScene(parallaxX);
    } else if (currentTheme === 'bamboo') {
      drawBambooScene(parallaxX);
    } else if (currentTheme === 'onsen') {
      drawOnsenScene(parallaxX);
    } else if (currentTheme === 'slamet') {
      drawSlametDawnScene(parallaxX);
    } else {
      drawMatchaScene(parallaxX);
    }

    drawParticles();
  }

  // 1. MATCHA FOREST (Hutan Cemara & Daun Teh Kaligua)
  function drawMatchaScene(px) {
    // Distant mountain ridge (Mount Slamet silhouette)
    ctx.fillStyle = 'rgba(23, 35, 27, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.65);
    ctx.lineTo(width * 0.45 + px * 0.5, height * 0.45);
    ctx.lineTo(width * 0.65 + px * 0.5, height * 0.55);
    ctx.lineTo(width, height * 0.62);
    ctx.lineTo(width, height);
    ctx.fill();

    // Midground pine tree layer
    ctx.fillStyle = 'rgba(28, 44, 33, 0.5)';
    const step = 65;
    for (let x = -30; x < width + 60; x += step) {
      const treeH = 90 + Math.sin(x * 12.3) * 35;
      const baseX = x + px * 0.8;
      const baseY = height - 10;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + 18, baseY - treeH);
      ctx.lineTo(baseX + 36, baseY);
      ctx.fill();
    }
  }

  // 2. SAKURA DUSK (Senja Kuil & Torii)
  function drawSakuraScene(px) {
    // Distant twilight gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(45, 26, 42, 0.35)');
    grad.addColorStop(1, 'rgba(24, 18, 26, 0.2)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Torii Gate silhouette on bottom-right
    const toriiX = width * 0.82 + px * 0.4;
    const toriiY = height - 140;
    ctx.fillStyle = 'rgba(60, 28, 45, 0.55)';
    // Top beams
    ctx.fillRect(toriiX - 50, toriiY, 100, 8);
    ctx.fillRect(toriiX - 44, toriiY + 14, 88, 6);
    // Pillars
    ctx.fillRect(toriiX - 28, toriiY + 14, 8, 126);
    ctx.fillRect(toriiX + 20, toriiY + 14, 8, 126);
  }

  // 3. BAMBOO MIST (Rumpun Bambu & Kabut Berarak)
  function drawBambooScene(px) {
    // Swaying bamboo stalks
    const time = performance.now() * 0.001;
    ctx.fillStyle = 'rgba(38, 54, 42, 0.4)';
    for (let i = 0; i < 9; i++) {
      const bx = (width / 8) * i + px * 0.6;
      const sway = Math.sin(time + i * 1.5) * 8;
      ctx.beginPath();
      ctx.moveTo(bx - 4, height);
      ctx.quadraticCurveTo(bx + sway, height * 0.5, bx + sway * 1.5, 0);
      ctx.lineTo(bx + sway * 1.5 + 7, 0);
      ctx.quadraticCurveTo(bx + sway + 7, height * 0.5, bx + 3, height);
      ctx.fill();
    }

    // Rolling fog mist
    ctx.fillStyle = 'rgba(160, 195, 175, 0.06)';
    for (let f = 0; f < 3; f++) {
      const fogY = height * (0.6 + f * 0.14);
      const fogOffset = (time * 25 * (f + 1)) % width;
      ctx.beginPath();
      ctx.arc(fogOffset, fogY, 140, 0, Math.PI * 2);
      ctx.arc(fogOffset - width, fogY, 140, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. ONSEN SLATE (Pemandian Air Panas & Uap Mineral)
  function drawOnsenScene(px) {
    // Water basin border
    ctx.fillStyle = 'rgba(28, 40, 54, 0.45)';
    ctx.fillRect(0, height - 70, width, 70);

    // Ripples
    ctx.strokeStyle = 'rgba(120, 184, 230, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = ripplers.length - 1; i >= 0; i--) {
      const rip = ripplers[i];
      rip.r += 0.8;
      rip.a -= 0.012;
      if (rip.a <= 0 || rip.r >= rip.maxR) {
        ripplers.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.ellipse(rip.x, rip.y, rip.r, rip.r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 5. SLAMET DAWN (Fajar Gunung Slamet & Perkebunan Bumiayu)
  function drawSlametDawnScene(px) {
    // Sunrise glow behind Slamet peak
    const sunGrad = ctx.createRadialGradient(width * 0.5 + px * 0.3, height * 0.5, 10, width * 0.5 + px * 0.3, height * 0.5, 260);
    sunGrad.addColorStop(0, 'rgba(245, 180, 105, 0.35)');
    sunGrad.addColorStop(1, 'rgba(30, 40, 32, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, width, height);

    // Majestic Mount Slamet double peak
    ctx.fillStyle = 'rgba(35, 52, 42, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.7);
    ctx.lineTo(width * 0.35 + px * 0.4, height * 0.38);
    ctx.lineTo(width * 0.50 + px * 0.4, height * 0.33); // Peak of Slamet (3,428 m)
    ctx.lineTo(width * 0.65 + px * 0.4, height * 0.44);
    ctx.lineTo(width, height * 0.72);
    ctx.lineTo(width, height);
    ctx.fill();

    // Terraced onion & tea fields
    ctx.fillStyle = 'rgba(48, 72, 56, 0.4)';
    for (let r = 0; r < 4; r++) {
      const ry = height - (r + 1) * 24;
      ctx.fillRect(0, ry, width, 18);
    }
  }

  // Draw natural particle drift (Petals / Tea leaves / Steam / Fireflies)
  function drawParticles() {
    const time = performance.now() * 0.001;

    for (const p of particles) {
      // Wind reaction towards cursor
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 120 && dist > 1) {
        p.x -= (dx / dist) * 1.5;
        p.y -= (dy / dist) * 1.5;
      }

      p.x += p.vx + Math.sin(time + p.phase) * 0.5;
      p.y += p.vy;
      p.rot += p.vrot;

      if (p.y > height + 20) { p.y = -20; p.x = Math.random() * width; }
      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (currentTheme === 'sakura') {
        // Cherry blossom petal (pink)
        ctx.fillStyle = `rgba(242, 168, 192, ${p.alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (currentTheme === 'onsen') {
        // Rising steam particle (soft white/cyan bubble)
        ctx.fillStyle = `rgba(180, 220, 245, ${p.alpha * 0.45})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 1.4, 0, Math.PI * 2);
        ctx.fill();
        p.vy = -Math.abs(p.vy) * 0.7; // Steam rises
      } else if (currentTheme === 'slamet') {
        // Golden sunrise pollen / dawn spark
        ctx.fillStyle = `rgba(245, 210, 130, ${p.alpha})`;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
      } else {
        // Matcha & Bamboo: green tea leaf shape
        ctx.fillStyle = `rgba(138, 194, 117, ${p.alpha})`;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.quadraticCurveTo(0, -p.size * 0.6, p.size, 0);
        ctx.quadraticCurveTo(0, p.size * 0.6, -p.size, 0);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Animation render loop
  function loop(now) {
    if (isVisible) {
      drawBackground();
    }
    requestAnimationFrame(loop);
  }

  // Public control API for theme switcher
  window.MastermindScene = {
    setTheme(theme) {
      currentTheme = theme;
      initThemeParticles();
    },
    setAnimMode(mode) {
      animMode = mode;
      localStorage.setItem('mm-anim', mode);
      initThemeParticles();
    }
  };

  resize();
  requestAnimationFrame(loop);
})();
