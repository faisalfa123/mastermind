/**
 * officeWorld.js - Diorama 3D "Bumiayu Zen" (Hokkaido Modern-Zen + Jawa Tengah)
 * Lantai parket bambu/jati, roster gebyok minimalis, jendela bukit terasering Bumiayu,
 * kolam koi mini, tanaman tropis indoor, lampu gantung hangat, dan Bumiayu Chill Lounge.
 */

'use strict';

window.OfficeWorld = (function () {
  /**
   * Generates a warm bamboo/teak wood parquet texture
   */
  function createWoodParquetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#7c5335';
    ctx.fillRect(0, 0, 256, 256);

    const plankW = 64;
    const plankH = 32;
    for (let y = 0; y < 256; y += plankH) {
      const offset = (y / plankH) % 2 === 0 ? 0 : 32;
      for (let x = -32; x < 256; x += plankW) {
        const shade = ((x + y) % 3 === 0) ? '#885c3c' : ((x + y) % 2 === 0 ? '#744c30' : '#805537');
        ctx.fillStyle = shade;
        ctx.fillRect(x + offset + 1, y + 1, plankW - 2, plankH - 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 7);
    return tex;
  }

  /**
   * Creates a low-poly tropical plant (Monstera / Fern / Bonsai)
   */
  function createTropicalPlant(type, scale = 1.0) {
    const plant = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: type === 'bonsai' ? 0x2d3748 : 0x9a4a22, roughness: 0.75 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.24 * scale, 0.45 * scale, 10), potMat);
    pot.position.y = 0.22 * scale;
    pot.castShadow = true;
    plant.add(pot);

    const leafMat = new THREE.MeshStandardMaterial({
      color: type === 'fern' ? 0x4ade80 : (type === 'bonsai' ? 0x16a34a : 0x22c55e),
      roughness: 0.65
    });

    if (type === 'bonsai') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * scale, 0.1 * scale, 0.55 * scale, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9 })
      );
      trunk.position.y = 0.62 * scale;
      trunk.rotation.z = 0.2;
      plant.add(trunk);

      [[0.12, 0.92, 0, 0.34], [-0.18, 0.78, 0.1, 0.25]].forEach(c => {
        const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(c[3] * scale, 0), leafMat);
        canopy.position.set(c[0] * scale, c[1] * scale, c[2] * scale);
        canopy.scale.y = 0.65;
        canopy.castShadow = true;
        plant.add(canopy);
      });
    } else {
      const count = type === 'fern' ? 7 : 5;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const leaf = new THREE.Mesh(
          new THREE.BoxGeometry(0.28 * scale, 0.04 * scale, 0.55 * scale),
          leafMat
        );
        leaf.position.set(Math.cos(angle) * 0.26 * scale, (0.55 + (i % 2) * 0.15) * scale, Math.sin(angle) * 0.26 * scale);
        leaf.rotation.y = -angle + Math.PI / 2;
        leaf.rotation.x = 0.45;
        leaf.castShadow = true;
        plant.add(leaf);
      }
    }
    return plant;
  }

  /**
   * Builds the entire Bumiayu Zen 3D Office Diorama
   */
  function createOfficeScene() {
    const world = new THREE.Group();

    // 1. Floating Mountain Island Foundation (Tanah/Batu Alam + Rumput + Parket Bambu)
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 0.95 });
    const stoneRimMat = new THREE.MeshStandardMaterial({ color: 0x4a4e48, roughness: 0.9 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a6b3e, roughness: 0.85 });
    const woodFloorMat = new THREE.MeshStandardMaterial({
      map: createWoodParquetTexture(),
      roughness: 0.65,
      metalness: 0.05
    });

    // Earth / rock base slab
    const baseSlab = new THREE.Mesh(new THREE.BoxGeometry(34.6, 1.3, 30.6), earthMat);
    baseSlab.position.set(0, -0.82, 0);
    baseSlab.castShadow = true;
    baseSlab.receiveShadow = true;
    world.add(baseSlab);

    // Grass terrace rim around the wooden floor
    const grassRim = new THREE.Mesh(new THREE.BoxGeometry(34.8, 0.22, 30.8), grassMat);
    grassRim.position.set(0, -0.09, 0);
    grassRim.receiveShadow = true;
    world.add(grassRim);

    // Main warm bamboo/teak office floor
    const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(32.0, 0.12, 28.0), woodFloorMat);
    mainFloor.position.set(0, 0.02, 0);
    mainFloor.receiveShadow = true;
    world.add(mainFloor);

    // 2. Dinding Kayu Jati, Roster Gebyok Minimalis, & Jendela Bukit Terasering Bumiayu
    const teakMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.75 });
    const windowGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd1fae5,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1
    });

    // Left & Right low wooden zen walls with gebyok roster slats
    [-16.0, 16.0].forEach(wx => {
      const baseWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 28.0), teakMat);
      baseWall.position.set(wx, 0.45, 0);
      baseWall.castShadow = true;
      world.add(baseWall);

      // Vertical wooden roster slats (gebyok minimalis)
      for (let z = -12; z <= 12; z += 1.6) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.14), darkWoodMat);
        slat.position.set(wx, 1.45, z);
        slat.castShadow = true;
        world.add(slat);
      }
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 28.0), darkWoodMat);
      topBeam.position.set(wx, 2.1, 0);
      world.add(topBeam);
    });

    // Back wall (North, z = -14.0) with large wooden-framed panorama windows
    const backWallLower = new THREE.Mesh(new THREE.BoxGeometry(32.3, 0.9, 0.35), teakMat);
    backWallLower.position.set(0, 0.45, -14.0);
    world.add(backWallLower);

    const backWallTop = new THREE.Mesh(new THREE.BoxGeometry(32.3, 0.3, 0.4), darkWoodMat);
    backWallTop.position.set(0, 2.75, -14.0);
    world.add(backWallTop);

    // Window mullions & glass
    for (let x = -15; x <= 15; x += 5) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 0.36), darkWoodMat);
      pillar.position.set(x, 1.85, -14.0);
      pillar.castShadow = true;
      world.add(pillar);
    }
    const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(31.5, 1.75), windowGlassMat);
    backGlass.position.set(0, 1.8, -14.0);
    world.add(backGlass);

    // Pemandangan Bukit Hijau & Sawah Terasering Bumiayu di luar jendela belakang
    const hillColors = [0x2d6a3e, 0x3a8249, 0x4c9a57];
    hillColors.forEach((col, i) => {
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(7.5 + i * 1.5, 4.2 - i * 0.6, 7),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, flatShading: true })
      );
      hill.position.set(-9 + i * 9, 1.8 - i * 0.2, -17.5 - (i % 2) * 1.2);
      world.add(hill);
    });

    // 3. Lampu Gantung Hangat (Warm Pendant Lights)
    [-5.5, 0, 5.5].forEach(lx => {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), darkWoodMat);
      cord.position.set(lx, 4.6, -1.0);
      world.add(cord);

      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 0.35, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xd97706, side: THREE.DoubleSide, roughness: 0.5 })
      );
      shade.position.set(lx, 3.85, -1.0);
      world.add(shade);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      bulb.position.set(lx, 3.72, -1.0);
      world.add(bulb);
    });

    // Warm indoor ambient point light
    const warmCeilingLight = new THREE.PointLight(0xffd89b, 0.85, 28);
    warmCeilingLight.position.set(0, 4.5, -1);
    world.add(warmCeilingLight);

    // 4. Ruang Komando Eksekutif Mastermind (Kayu Jati + Kaca Minimalis)
    const glassGroup = new THREE.Group();
    glassGroup.position.set(0, 0, -10.2);

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(10.6, 0.16, 6.8),
      new THREE.MeshStandardMaterial({ color: 0x4d311c, roughness: 0.5 })
    );
    platform.position.y = 0.08;
    platform.receiveShadow = true;
    glassGroup.add(platform);

    const hqGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xa7f3d0,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1
    });

    // Glass front partitions with open center doorway (x between -1.2 and +1.2)
    [-3.25, 3.25].forEach(gx => {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.0, 0.08), hqGlassMat);
      pane.position.set(gx, 1.1, 3.35);
      glassGroup.add(pane);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.1, 0.12), darkWoodMat);
      frame.position.set(gx, 2.1, 3.35);
      glassGroup.add(frame);
    });

    // Mastermind curved teak desk
    const bossDesk = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 2.3, 0.1, 24, 1, false, Math.PI * 0.15, Math.PI * 0.7),
      teakMat
    );
    bossDesk.position.set(0, 0.78, 0.5);
    bossDesk.rotation.y = Math.PI * 0.5;
    bossDesk.castShadow = true;
    glassGroup.add(bossDesk);

    // 3 Curved Neon Monitors facing Mastermind (+Z)
    [-0.85, 0, 0.85].forEach((offset, idx) => {
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.48),
        new THREE.MeshBasicMaterial({ color: idx === 1 ? 0x00f5d4 : 0x38bdf8 })
      );
      scr.position.set(offset * 0.92, 1.25, -0.05 + (idx === 1 ? -0.1 : 0.05));
      scr.rotation.y = -offset * 0.3;
      glassGroup.add(scr);
    });

    // Mini Server Rack & Router inside HQ
    const miniRack = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.7, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 })
    );
    miniRack.position.set(4.1, 0.9, -1.6);
    miniRack.castShadow = true;
    glassGroup.add(miniRack);

    for (let r = 0; r < 5; r++) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.04, 0.02),
        new THREE.MeshBasicMaterial({ color: r % 2 === 0 ? 0x22c55e : 0x38bdf8 })
      );
      led.position.set(4.1, 0.4 + r * 0.26, -1.19);
      glassGroup.add(led);
    }

    // Emergency red ceiling light for SoC thermal alert (>75°C)
    const socAlertLight = new THREE.PointLight(0xff0044, 0, 10);
    socAlertLight.position.set(0, 2.4, 0);
    glassGroup.add(socAlertLight);

    world.add(glassGroup);

    // 5. Bumiayu Chill Lounge (Zona Istirahat di pojok kiri bawah)
    const loungeGroup = new THREE.Group();
    loungeGroup.position.set(-10.0, 0.06, 8.2);

    // Woven bamboo mat rug
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 32),
      new THREE.MeshStandardMaterial({ color: 0xa38b65, roughness: 0.95 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.02;
    loungeGroup.add(rug);

    // Wooden Sofa with Matcha Green Cushions
    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 1.1), teakMat);
    sofaBase.position.set(0, 0.14, -1.6);
    sofaBase.castShadow = true;
    loungeGroup.add(sofaBase);

    const sofaCushion = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.22, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x4d7c4f, roughness: 0.85 })
    );
    sofaCushion.position.set(0, 0.34, -1.55);
    loungeGroup.add(sofaCushion);

    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.65, 0.24), teakMat);
    sofaBack.position.set(0, 0.5, -2.05);
    sofaBack.castShadow = true;
    loungeGroup.add(sofaBack);

    // Side Sofa
    const sideSofa = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 3.0), new THREE.MeshStandardMaterial({ color: 0x4d7c4f, roughness: 0.85 }));
    sideSofa.position.set(-2.6, 0.22, 0.4);
    sideSofa.castShadow = true;
    loungeGroup.add(sideSofa);

    // Low Wooden Tea/Coffee Table
    const teaTable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.08, 20),
      teakMat
    );
    teaTable.position.set(0, 0.38, 0.2);
    teaTable.castShadow = true;
    loungeGroup.add(teaTable);

    // Coffee / Tea Dispenser Bar
    const barTable = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.75), teakMat);
    barTable.position.set(0.2, 0.42, 3.1);
    barTable.castShadow = true;
    loungeGroup.add(barTable);

    const coffeeMaker = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.6, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.35 })
    );
    coffeeMaker.position.set(0.2, 1.15, 3.1);
    coffeeMaker.userData = { type: 'coffee' };
    loungeGroup.add(coffeeMaker);

    world.add(loungeGroup);

    // Rest Slots di Bumiayu Chill Lounge
    const restSlots = [
      { pos: new THREE.Vector3(-11.4, 0, 6.7), rotY: 0 },
      { pos: new THREE.Vector3(-10.0, 0, 6.7), rotY: 0 },
      { pos: new THREE.Vector3(-8.6, 0, 6.7), rotY: 0 },
      { pos: new THREE.Vector3(-12.4, 0, 8.0), rotY: Math.PI / 2 },
      { pos: new THREE.Vector3(-12.4, 0, 9.4), rotY: Math.PI / 2 },
      { pos: new THREE.Vector3(-8.8, 0, 9.6), rotY: -Math.PI / 4 }
    ];

    // 6. Kolam Ikan Koi Mini & Taman Batu Zen (di sudut kanan bawah teras)
    const koiGroup = new THREE.Group();
    koiGroup.position.set(10.5, 0.06, 8.2);

    const pondRim = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.25, 24),
      stoneRimMat
    );
    pondRim.position.y = 0.1;
    koiGroup.add(pondRim);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(2.85, 24),
      new THREE.MeshPhysicalMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.65, roughness: 0.1 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.18;
    koiGroup.add(water);

    // 3 Mini Koi Fish
    const koiFish = [];
    [0xf97316, 0xffffff, 0xef4444].forEach((col, i) => {
      const fish = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.36),
        new THREE.MeshBasicMaterial({ color: col })
      );
      const angle = (i / 3) * Math.PI * 2;
      fish.position.set(Math.cos(angle) * 1.4, 0.14, Math.sin(angle) * 1.4);
      koiGroup.add(fish);
      koiFish.push({ mesh: fish, angle, radius: 1.1 + i * 0.4, speed: 0.02 + i * 0.005 });
    });

    world.add(koiGroup);

    // 7. Server Tech Bay (Datacenter Racks) di pojok kanan atas
    const serverBay = new THREE.Group();
    serverBay.position.set(11.0, 0.06, -8.2);
    for (let i = 0; i < 3; i++) {
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2.7, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35 })
      );
      rack.position.set(i * 1.6 - 1.6, 1.35, 0);
      rack.castShadow = true;
      rack.userData = { type: 'server' };
      serverBay.add(rack);

      for (let s = 0; s < 6; s++) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.06, 0.02),
          new THREE.MeshBasicMaterial({ color: (i + s) % 2 === 0 ? 0x22c55e : 0x38bdf8 })
        );
        strip.position.set(i * 1.6 - 1.6, 0.35 + s * 0.4, 0.51);
        serverBay.add(strip);
      }
    }
    world.add(serverBay);

    // 8. Indoor Tropical Plants (Monstera, Fern, Bonsai)
    const plantPlacements = [
      { type: 'monstera', x: -14.2, z: -12.0, s: 1.3 },
      { type: 'bonsai', x: 5.0, z: -12.2, s: 1.1 },
      { type: 'fern', x: -6.2, z: 6.2, s: 1.1 },
      { type: 'monstera', x: 14.2, z: 5.0, s: 1.25 },
      { type: 'bonsai', x: 7.0, z: 8.2, s: 1.0 }
    ];
    plantPlacements.forEach(p => {
      const plant = createTropicalPlant(p.type, p.s);
      plant.position.set(p.x, 0.06, p.z);
      world.add(plant);
    });

    return {
      world,
      glassGroup,
      socAlertLight,
      miniRack,
      coffeeMaker,
      koiFish,
      restSlots,
      coffeeSpot: new THREE.Vector3(-9.8, 0, 10.2),
      hqDoorPos: new THREE.Vector3(0, 0, -6.0),
      loungePos: new THREE.Vector3(-10.0, 0, 8.2),
      bossPos: new THREE.Vector3(0, 0, -9.2)
    };
  }

  /**
   * Creates a floating command badge icon above Mastermind / Worker during instructions
   */
  function createCommandIcon(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 18, 0.92)';
    ctx.fillRect(4, 4, 184, 56);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 184, 56);
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label.slice(0, 12), 96, 40);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.45, 1);
    sprite.position.y = 2.85;
    return sprite;
  }

  return {
    createOfficeScene,
    createCommandIcon
  };
})();
