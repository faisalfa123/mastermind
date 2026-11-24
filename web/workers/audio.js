/**
 * workers/audio.js - Worker & Meja Kerja Kategori Musik / DJ
 */
'use strict';

window.WorkerAudio = (function () {
  function decorateDesk(desk, category, status, cpuPct) {
    const djGroup = new THREE.Group();
    djGroup.position.set(0.88, 0.76, 0.28);

    // DJ Mixer Console Box
    const consoleGeo = new THREE.BoxGeometry(0.52, 0.04, 0.38);
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.6, roughness: 0.4 });
    const consoleMesh = new THREE.Mesh(consoleGeo, consoleMat);
    djGroup.add(consoleMesh);

    // Turntable Platters (Jog Wheels)
    const jogGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
    const jogMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.2 });
    const jogGoldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.3 });
    const platters = [];
    [-0.14, 0.14].forEach(jx => {
      const jog = new THREE.Mesh(jogGeo, jogMat);
      jog.position.set(jx, 0.03, 0.03);
      djGroup.add(jog);
      const centerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), jogGoldMat);
      centerPin.position.set(jx, 0.035, 0.03);
      djGroup.add(centerPin);
      platters.push(jog);
    });

    // Volume faders / EQ knobs
    for (let k = 0; k < 3; k++) {
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8),
        new THREE.MeshBasicMaterial({ color: k === 1 ? 0xef4444 : 0x10b981 })
      );
      knob.position.set(0, 0.03, -0.1 + k * 0.08);
      djGroup.add(knob);
    }

    // Studio Monitor Speakers with angled acoustic design
    [-0.7, 0.7].forEach(sx => {
      const spkGeo = new THREE.BoxGeometry(0.18, 0.28, 0.16);
      const spkMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.7 });
      const spk = new THREE.Mesh(spkGeo, spkMat);
      spk.position.set(sx > 0 ? 1.25 : -0.65, 0.9, sx > 0 ? 0.4 : -0.2);
      spk.rotation.y = sx > 0 ? -0.4 : 0.4;
      spk.castShadow = true;

      // Speaker cones
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.04, 0.02, 12),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
      );
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, -0.02, 0.09);
      spk.add(cone);
      djGroup.add(spk);
    });

    // Mini Microphone on stand
    const micGroup = new THREE.Group();
    micGroup.position.set(-0.55, 0.76, 0.25);
    const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8 }));
    const micStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x71717a }));
    micStem.position.y = 0.09;
    const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshStandardMaterial({ color: 0xa1a1aa, metalness: 0.9, roughness: 0.2 }));
    micHead.position.y = 0.18;
    micGroup.add(micBase, micStem, micHead);
    djGroup.add(micGroup);

    desk.add(djGroup);
    return { djGroup, platters };
  }

  function applyWorkerStyle(worker, scale, skinMaterial, eyeMaterial) {
    // Streetwear Musician Outfit: Charcoal bomber jacket with gold zipper & red studio headphones
    const headSize = 0.42 * scale;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    // Modern styled hair
    const hair = new THREE.Mesh(new THREE.BoxGeometry(headSize * 1.05, 0.2 * scale, headSize * 1.05), hairMat);
    hair.position.set(0, 1.31 * scale, -0.02 * scale);
    worker.add(hair);

    // DJ Studio Headband
    const hpBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.25 * scale, 0.025 * scale, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5 })
    );
    hpBand.position.set(0, 1.35 * scale, 0);
    hpBand.rotation.x = -Math.PI / 2;
    worker.add(hpBand);

    // DJ Ear Cups (Padded red studio cups on sides)
    [-0.24 * scale, 0.24 * scale].forEach(hx => {
      const earCup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09 * scale, 0.09 * scale, 0.06 * scale, 12),
        new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.3 })
      );
      earCup.rotation.z = Math.PI / 2;
      earCup.position.set(hx, 1.12 * scale, 0);
      worker.add(earCup);
    });

    // Jacket zipper & Gold chain accent
    const zipMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.02 * scale, 0.44 * scale, 0.29 * scale),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    zipMesh.position.set(0, 0.65 * scale, 0);
    worker.add(zipMesh);
  }

  return {
    decorateDesk,
    applyWorkerStyle
  };
})();
