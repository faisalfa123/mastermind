/**
 * workerFactory.js - Procedural 3D Chibi Worker & Mastermind Generator
 * High-Angle / Top-Down Isometric (45°-60°) Optimized Silhouettes
 * Multi-joint arms (shoulder, elbow, hand), swivel chairs, L-desks, canvas monitors
 */

'use strict';

window.WorkerFactory = (function () {
  // Shared materials & geometries for ultra-light memory usage
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd1a4, roughness: 0.6 });
  const darkSkinMaterial = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.6 });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const chairMetalMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5568, metalness: 0.8, roughness: 0.2 });
  const chairCushionMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.7 });
  const deskTopMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
  const deskTrimMaterial = new THREE.MeshBasicMaterial({ color: 0x48bb78 }); // LED edge
  const cupMaterial = new THREE.MeshStandardMaterial({ color: 0xf7fafc, roughness: 0.3 });
  const keyboardMaterial = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.5 });

  /**
   * Creates a dynamic canvas texture for computer screens
   */
  function createScreenTexture(title, status, cpuPct) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = status === 'failed' ? '#4a0e0e' : (status === 'inactive' ? '#0d1310' : '#0a1612');
    ctx.fillRect(0, 0, 256, 160);

    // Frame border
    ctx.strokeStyle = status === 'failed' ? '#ff3b30' : (status === 'inactive' ? '#334155' : '#48bb78');
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 156);

    // Title Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(title.toUpperCase().slice(0, 16), 14, 28);

    if (status === 'failed') {
      ctx.fillStyle = '#ff4d4f';
      ctx.font = 'bold 32px monospace';
      ctx.fillText('ERR CRASH', 28, 88);
      ctx.font = '14px monospace';
      ctx.fillText('exit code: 1', 28, 120);
    } else if (status === 'inactive') {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('STANDBY / OFF', 28, 90);
    } else {
      // Matrix code lines
      ctx.fillStyle = cpuPct > 65 ? '#ff9800' : '#52c41a';
      ctx.font = '13px monospace';
      ctx.fillText(`CPU: ${cpuPct.toFixed(1)}% | RAM OK`, 14, 56);
      ctx.fillText('> journalctl -u active', 14, 80);
      ctx.fillText('>> 200 OK - socket live', 14, 102);
      ctx.fillText('>> sync state verified', 14, 124);
      // Mini activity bar
      ctx.fillStyle = '#22c55e';
      const w = Math.min(228, (cpuPct / 100) * 228);
      ctx.fillRect(14, 138, w, 8);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture, canvas, ctx };
  }

  /**
   * Constructs an articulated multi-joint arm (Upper arm -> Forearm -> Hand)
   */
  function createArm(colorHex, isLeft) {
    const armGroup = new THREE.Group();
    const clothMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });

    // Shoulder / Upper Arm
    const upperGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
    upperGeo.translate(0, -0.16, 0);
    const upperArm = new THREE.Mesh(upperGeo, clothMat);
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    // Elbow joint & Forearm
    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0, -0.32, 0);

    const foreGeo = new THREE.BoxGeometry(0.1, 0.28, 0.1);
    foreGeo.translate(0, -0.14, 0);
    const forearm = new THREE.Mesh(foreGeo, clothMat);
    forearm.castShadow = true;
    forearmGroup.add(forearm);

    // Hand
    const handGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const hand = new THREE.Mesh(handGeo, skinMaterial);
    hand.position.set(0, -0.28, 0.04);
    hand.castShadow = true;
    forearmGroup.add(hand);

    armGroup.add(forearmGroup);

    return {
      root: armGroup,
      upperArm,
      forearmGroup,
      hand
    };
  }

  /**
   * Constructs a Swivel Office Chair (Kaki bintang 5, tiang hidrolik, sandaran rendah)
   */
  function createSwivelChair() {
    const chair = new THREE.Group();

    // 5-star wheeled base
    const baseGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const legGeo = new THREE.BoxGeometry(0.42, 0.04, 0.06);
      legGeo.translate(0.21, 0, 0);
      const leg = new THREE.Mesh(legGeo, chairMetalMaterial);
      leg.rotation.y = angle;
      baseGroup.add(leg);

      const wheelGeo = new THREE.SphereGeometry(0.04, 6, 6);
      const wheel = new THREE.Mesh(wheelGeo, keyboardMaterial);
      wheel.position.set(Math.cos(angle) * 0.4, -0.04, Math.sin(angle) * 0.4);
      baseGroup.add(wheel);
    }
    baseGroup.position.y = 0.06;
    chair.add(baseGroup);

    // Hydraulic center column
    const columnGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8);
    const column = new THREE.Mesh(columnGeo, chairMetalMaterial);
    column.position.y = 0.24;
    chair.add(column);

    // Swivel Seat & Low Backrest Group (bisa berputar mandiri)
    const seatGroup = new THREE.Group();
    seatGroup.position.y = 0.42;

    // Cushion
    const cushionGeo = new THREE.BoxGeometry(0.55, 0.08, 0.52);
    const cushion = new THREE.Mesh(cushionGeo, chairCushionMaterial);
    cushion.castShadow = true;
    seatGroup.add(cushion);

    // Low ergonomic backrest (agar bahu & kepala tetap sangat terlihat dari atas)
    const backGeo = new THREE.BoxGeometry(0.52, 0.42, 0.06);
    const back = new THREE.Mesh(backGeo, chairCushionMaterial);
    back.position.set(0, 0.22, -0.24);
    back.rotation.x = 0.08;
    back.castShadow = true;
    seatGroup.add(back);

    // Armrests
    [-0.28, 0.28].forEach(x => {
      const armrestGeo = new THREE.BoxGeometry(0.06, 0.2, 0.32);
      const armrest = new THREE.Mesh(armrestGeo, chairMetalMaterial);
      armrest.position.set(x, 0.12, 0);
      seatGroup.add(armrest);
    });

    chair.add(seatGroup);

    return {
      root: chair,
      seatGroup
    };
  }

  /**
   * Constructs an L-Shape Modern Workstation Desk
   */
  function createLDesk(appName, status, cpuPct) {
    const desk = new THREE.Group();

    // Main desk surface
    const mainTopGeo = new THREE.BoxGeometry(1.6, 0.08, 0.9);
    const mainTop = new THREE.Mesh(mainTopGeo, deskTopMaterial);
    mainTop.position.set(0, 0.72, 0);
    mainTop.receiveShadow = true;
    mainTop.castShadow = true;
    desk.add(mainTop);

    // L-extension wing surface
    const wingTopGeo = new THREE.BoxGeometry(0.8, 0.08, 0.7);
    const wingTop = new THREE.Mesh(wingTopGeo, deskTopMaterial);
    wingTop.position.set(0.9, 0.72, 0.35);
    wingTop.receiveShadow = true;
    wingTop.castShadow = true;
    desk.add(wingTop);

    // Metal legs
    const legGeo = new THREE.BoxGeometry(0.06, 0.72, 0.06);
    const legPositions = [
      [-0.74, 0.36, -0.4],
      [-0.74, 0.36, 0.4],
      [0.68, 0.36, -0.4],
      [1.24, 0.36, 0.05],
      [1.24, 0.36, 0.65],
      [0.55, 0.36, 0.65]
    ];
    legPositions.forEach(p => {
      const leg = new THREE.Mesh(legGeo, chairMetalMaterial);
      leg.position.set(p[0], p[1], p[2]);
      leg.castShadow = true;
      desk.add(leg);
    });

    // Desk LED Edge Beacon (Strip status di tepi meja)
    const beaconColor = status === 'active' ? (cpuPct > 65 ? 0xffaa00 : 0x48bb78) : (status === 'failed' ? 0xe53e3e : 0x4a5568);
    const beaconMat = new THREE.MeshBasicMaterial({ color: beaconColor });
    const beaconGeo = new THREE.BoxGeometry(1.62, 0.02, 0.02);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.75, 0.44);
    desk.add(beacon);

    // Mechanical Keyboard mini
    const kbGeo = new THREE.BoxGeometry(0.48, 0.025, 0.18);
    const kb = new THREE.Mesh(kbGeo, keyboardMaterial);
    kb.position.set(0, 0.77, 0.16);
    desk.add(kb);

    // Glowing Mousepad & Mouse
    const padGeo = new THREE.BoxGeometry(0.72, 0.005, 0.32);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0.06, 0.762, 0.16);
    desk.add(pad);

    const mouseGeo = new THREE.BoxGeometry(0.06, 0.02, 0.09);
    const mouse = new THREE.Mesh(mouseGeo, keyboardMaterial);
    mouse.position.set(0.32, 0.775, 0.16);
    desk.add(mouse);

    // Coffee Mug with steam
    const mugGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.12, 12);
    const mug = new THREE.Mesh(mugGeo, cupMaterial);
    mug.position.set(0.85, 0.82, 0.25);
    mug.castShadow = true;
    desk.add(mug);

    // Steam particles placeholder
    const steamGroup = new THREE.Group();
    steamGroup.position.set(0.85, 0.92, 0.25);
    for (let s = 0; s < 3; s++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      p.position.set((Math.random() - 0.5) * 0.04, s * 0.06, (Math.random() - 0.5) * 0.04);
      steamGroup.add(p);
    }
    desk.add(steamGroup);

    // Dynamic Canvas Monitor (miring 15° ke atas agar terbaca dari top-down)
    const screenData = createScreenTexture(appName, status, cpuPct);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenData.texture });
    const screenGeo = new THREE.PlaneGeometry(0.7, 0.44);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 1.1, -0.22);
    screenMesh.rotation.x = -0.25; // 15° tilt backward towards camera

    // Monitor Frame & Stand
    const frameGeo = new THREE.BoxGeometry(0.74, 0.48, 0.04);
    const frameMesh = new THREE.Mesh(frameGeo, keyboardMaterial);
    frameMesh.position.copy(screenMesh.position);
    frameMesh.rotation.copy(screenMesh.rotation);
    frameMesh.position.z -= 0.02;
    frameMesh.castShadow = true;
    desk.add(frameMesh);
    desk.add(screenMesh);

    const standGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.32, 8);
    const stand = new THREE.Mesh(standGeo, chairMetalMaterial);
    stand.position.set(0, 0.88, -0.25);
    desk.add(stand);

    const standBaseGeo = new THREE.BoxGeometry(0.24, 0.02, 0.18);
    const standBase = new THREE.Mesh(standBaseGeo, chairMetalMaterial);
    standBase.position.set(0, 0.77, -0.24);
    desk.add(standBase);

    return {
      root: desk,
      beacon,
      screenMesh,
      screenData,
      steamGroup,
      mug
    };
  }

  /**
   * Procedural Chibi Worker Body with Top-Down Visibility Focus
   */
  function createWorkerCharacter(emp) {
    const worker = new THREE.Group();
    const isMastermind = emp.isHQ === true;
    const scale = isMastermind ? 1.25 : 1.0;

    // Body (Torso)
    const bodyColor = isMastermind ? 0x0f172a : (emp.color || 0x3b82f6);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.5,
      metalness: isMastermind ? 0.3 : 0.0
    });
    const torsoGeo = new THREE.BoxGeometry(0.44 * scale, 0.52 * scale, 0.28 * scale);
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.65 * scale;
    torso.castShadow = true;
    worker.add(torso);

    // Neon trim for Mastermind executive suit
    if (isMastermind) {
      const trimGeo = new THREE.BoxGeometry(0.04, 0.48 * scale, 0.3 * scale);
      const trimMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.position.set(0, 0.65 * scale, 0);
      worker.add(trim);
    }

    // Chibi Head (Enlarged 1.25x for top-down camera clarity)
    const headSize = 0.42 * scale;
    const headGeo = new THREE.BoxGeometry(headSize, headSize * 0.95, headSize * 0.95);
    const head = new THREE.Mesh(headGeo, skinMaterial);
    head.position.y = 1.12 * scale;
    head.castShadow = true;
    worker.add(head);

    // Eyes (Tampak dari depan/atas)
    [-0.1 * scale, 0.1 * scale].forEach(x => {
      const eyeGeo = new THREE.BoxGeometry(0.06 * scale, 0.06 * scale, 0.02);
      const eye = new THREE.Mesh(eyeGeo, eyeMaterial);
      eye.position.set(x, 1.14 * scale, 0.21 * scale);
      worker.add(eye);
    });

    // Procedural Hair / Hats according to Category
    const hairColor = emp.hairColor || 0x1e293b;
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });

    if (isMastermind) {
      // Slicked dark boss hair with neon hairband
      const hairGeo = new THREE.BoxGeometry(headSize * 1.06, 0.16 * scale, headSize * 1.06);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 1.34 * scale, 0);
      worker.add(hair);
    } else if (emp.category === 'docker') {
      // Docker cyan worker cap
      const capGeo = new THREE.CylinderGeometry(headSize * 0.58, headSize * 0.62, 0.18 * scale, 12);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x0db7ed });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 1.36 * scale, 0);
      worker.add(cap);
    } else if (emp.category === 'database') {
      // Glowing tech visor / goggles
      const visorGeo = new THREE.BoxGeometry(headSize * 0.95, 0.1 * scale, 0.1 * scale);
      const visorMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 1.16 * scale, 0.18 * scale);
      worker.add(visor);
    } else {
      // Standard stylish voxel hairstyle + headset
      const hairGeo = new THREE.BoxGeometry(headSize * 1.05, 0.22 * scale, headSize * 1.05);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 1.32 * scale, -0.02 * scale);
      worker.add(hair);

      // Thin headset with mic
      const bandGeo = new THREE.TorusGeometry(0.24 * scale, 0.02 * scale, 6, 16, Math.PI);
      const bandMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(0, 1.35 * scale, 0);
      band.rotation.x = -Math.PI / 2;
      worker.add(band);
    }

    // Articulated Multi-Joint Arms
    const leftArm = createArm(bodyColor, true);
    leftArm.root.position.set(-0.28 * scale, 0.88 * scale, 0);
    worker.add(leftArm.root);

    const rightArm = createArm(bodyColor, false);
    rightArm.root.position.set(0.28 * scale, 0.88 * scale, 0);
    worker.add(rightArm.root);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.14 * scale, 0.38 * scale, 0.14 * scale);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    [-0.12 * scale, 0.12 * scale].forEach(x => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, 0.2 * scale, 0);
      leg.castShadow = true;
      worker.add(leg);
    });

    // Octahedron Plumbob Indicator
    const plumbobColor = emp.status === 'active' ? (emp.cpu_pct > 65 ? 0xffaa00 : 0x48bb78) : 0xe53e3e;
    const plumbobGeo = new THREE.OctahedronGeometry(0.18 * scale, 0);
    const plumbobMat = new THREE.MeshBasicMaterial({ color: plumbobColor, wireframe: false });
    const plumbob = new THREE.Mesh(plumbobGeo, plumbobMat);
    plumbob.position.y = 1.75 * scale;
    worker.add(plumbob);

    // Floating text label sprite
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 256;
    textCanvas.height = 64;
    const tCtx = textCanvas.getContext('2d');
    tCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    tCtx.fillRect(4, 4, 248, 56);
    tCtx.strokeStyle = isMastermind ? '#00f5d4' : '#48bb78';
    tCtx.lineWidth = 3;
    tCtx.strokeRect(4, 4, 248, 56);
    tCtx.fillStyle = '#ffffff';
    tCtx.font = 'bold 22px monospace';
    tCtx.textAlign = 'center';
    tCtx.fillText(emp.name.slice(0, 14), 128, 38);

    const textTexture = new THREE.CanvasTexture(textCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: textTexture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.15 * scale;
    sprite.scale.set(1.6 * scale, 0.4 * scale, 1);
    worker.add(sprite);

    return {
      root: worker,
      head,
      torso,
      leftArm,
      rightArm,
      plumbob,
      sprite
    };
  }

  return {
    createSwivelChair,
    createLDesk,
    createWorkerCharacter
  };
})();
