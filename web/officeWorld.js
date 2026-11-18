/**
 * officeWorld.js - 3D Virtual Office Environment Setup
 * Mastermind HQ Executive Glass Suite, Lounge Break Zone, Server Bay,
 * Lighting, Shadows, and Dynamic Curved Data Packet Projectiles.
 */

'use strict';

window.OfficeWorld = (function () {
  /**
   * Builds the entire 3D architectural office layout
   */
  function createOfficeScene() {
    const world = new THREE.Group();

    // 1. Thick 3D Diorama Island Floor Slab (melayang solid di atas latar Matcha Forest)
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0e1912';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#1c3526';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(16, 14);

    const floorTopMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.75,
      metalness: 0.1
    });
    const floorSideMat = new THREE.MeshStandardMaterial({
      color: 0x0b120e,
      roughness: 0.9,
      metalness: 0.05
    });
    const floorGeo = new THREE.BoxGeometry(34, 1.4, 30);
    const floor = new THREE.Mesh(floorGeo, [
      floorSideMat, floorSideMat,
      floorTopMat, floorSideMat,
      floorSideMat, floorSideMat
    ]);
    floor.position.set(0, -0.7, 0);
    floor.receiveShadow = true;
    floor.castShadow = true;
    world.add(floor);

    // Outer office boundary walls (low-profile rim to keep top-down view clear)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x16261d, roughness: 0.85 });
    const wallGeoH = new THREE.BoxGeometry(34, 0.9, 0.35);
    const wallGeoV = new THREE.BoxGeometry(0.35, 0.9, 30);

    const northWall = new THREE.Mesh(wallGeoH, wallMat);
    northWall.position.set(0, 0.45, -14.82);
    world.add(northWall);

    const westWall = new THREE.Mesh(wallGeoV, wallMat);
    westWall.position.set(-16.82, 0.45, 0);
    world.add(westWall);

    const eastWall = new THREE.Mesh(wallGeoV, wallMat);
    eastWall.position.set(16.82, 0.45, 0);
    world.add(eastWall);

    // 2. Ruang Kaca Eksekutif Mastermind (Bos Kernel Odroid-C2)
    const glassGroup = new THREE.Group();
    glassGroup.position.set(0, 0, -10.5);

    // Raised executive wood platform
    const platformGeo = new THREE.BoxGeometry(11, 0.2, 7.5);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x1a261f, roughness: 0.5 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 0.1;
    platform.receiveShadow = true;
    glassGroup.add(platform);

    // Transparent Glass Partitions
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x00f5d4,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.6,
      ior: 1.5
    });

    // Glass walls
    const glassFrontL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.1), glassMat);
    glassFrontL.position.set(-3.2, 1.1, 3.65);
    glassGroup.add(glassFrontL);

    const glassFrontR = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.1), glassMat);
    glassFrontR.position.set(3.2, 1.1, 3.65);
    glassGroup.add(glassFrontR);

    // Executive curved desk for Mastermind
    const bossDesk = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 0.1, 24, 1, false, Math.PI * 0.15, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
    );
    bossDesk.position.set(0, 0.75, 0.8);
    bossDesk.rotation.y = Math.PI * 0.5;
    glassGroup.add(bossDesk);

    // 3 Curved Panorama Screens facing Mastermind (+Z inside glass room)
    [-0.8, 0, 0.8].forEach((offset, idx) => {
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.5),
        new THREE.MeshBasicMaterial({ color: idx === 1 ? 0x00f5d4 : 0x0284c7 })
      );
      scr.position.set(offset * 0.9, 1.25, 0.2 + (idx === 1 ? -0.1 : 0.05));
      scr.rotation.y = -offset * 0.3;
      glassGroup.add(scr);
    });

    // Mini Server Rack with blinking LEDs inside Mastermind Room
    const miniRack = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x0a0f0d, roughness: 0.4 })
    );
    miniRack.position.set(4.2, 0.9, -1.8);
    miniRack.castShadow = true;
    glassGroup.add(miniRack);

    // LED indicators
    const rackLightGroup = new THREE.Group();
    for (let r = 0; r < 5; r++) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.04, 0.02),
        new THREE.MeshBasicMaterial({ color: r % 2 === 0 ? 0x22c55e : 0x38bdf8 })
      );
      led.position.set(4.2, 0.4 + r * 0.28, -1.39);
      rackLightGroup.add(led);
    }
    glassGroup.add(rackLightGroup);

    // Emergency red ceiling light for SoC thermal alert
    const socAlertLight = new THREE.PointLight(0xff0044, 0, 10);
    socAlertLight.position.set(0, 2.4, 0);
    glassGroup.add(socAlertLight);

    world.add(glassGroup);

    // 3. Zona Istirahat & Chill Lounge (Sofa, Karpet, Meja Kopi, Tanaman, & restSlots)
    const loungeGroup = new THREE.Group();
    loungeGroup.position.set(-10.5, 0, 8.5);

    // Circular warm carpet
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x28382e, roughness: 0.95 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.02;
    loungeGroup.add(rug);

    // Modern Main Sofa (menghadap +Z ke arah meja kecil)
    const sofa = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.42, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x3b5244, roughness: 0.8 })
    );
    sofa.position.set(0, 0.25, -1.6);
    sofa.castShadow = true;
    loungeGroup.add(sofa);

    const sofaBack = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.65, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2b3d32, roughness: 0.8 })
    );
    sofaBack.position.set(0, 0.52, -2.05);
    sofaBack.castShadow = true;
    loungeGroup.add(sofaBack);

    // Side Sofa (menghadap +X)
    const sideSofa = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.42, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x3b5244, roughness: 0.8 })
    );
    sideSofa.position.set(-2.6, 0.25, 0.4);
    sideSofa.castShadow = true;
    loungeGroup.add(sideSofa);

    const sideSofaBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.65, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x2b3d32, roughness: 0.8 })
    );
    sideSofaBack.position.set(-3.05, 0.52, 0.4);
    sideSofaBack.castShadow = true;
    loungeGroup.add(sideSofaBack);

    // Small Lounge Coffee Table
    const smallTable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })
    );
    smallTable.position.set(0, 0.42, 0.2);
    smallTable.castShadow = true;
    loungeGroup.add(smallTable);

    const smallTableLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x475569 })
    );
    smallTableLeg.position.set(0, 0.2, 0.2);
    loungeGroup.add(smallTableLeg);

    // Potted Plant (Tanaman Hias Low-Poly)
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.24, 0.45, 12),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 })
    );
    pot.position.set(3.2, 0.22, -1.8);
    pot.castShadow = true;
    loungeGroup.add(pot);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.7 });
    [0, 1, 2].forEach(i => {
      const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 - i * 0.06, 0), foliageMat);
      leaf.position.set(3.2 + (i - 1) * 0.12, 0.65 + i * 0.18, -1.8);
      leaf.castShadow = true;
      loungeGroup.add(leaf);
    });

    // Coffee Machine Bar Table
    const barTable = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.9, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    barTable.position.set(0, 0.45, 3.0);
    loungeGroup.add(barTable);

    // Coffee maker
    const coffeeMaker = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.55, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 })
    );
    coffeeMaker.position.set(-0.4, 1.15, 3.0);
    coffeeMaker.userData = { type: 'coffee' };
    loungeGroup.add(coffeeMaker);

    world.add(loungeGroup);

    // Rest Slots di Chill Lounge agar worker duduk rapi & tidak bertumpuk
    const restSlots = [
      { pos: new THREE.Vector3(-12.0, 0, 7.0), rotY: 0 },
      { pos: new THREE.Vector3(-10.5, 0, 7.0), rotY: 0 },
      { pos: new THREE.Vector3(-9.0, 0, 7.0), rotY: 0 },
      { pos: new THREE.Vector3(-12.8, 0, 8.2), rotY: Math.PI / 2 },
      { pos: new THREE.Vector3(-12.8, 0, 9.6), rotY: Math.PI / 2 },
      { pos: new THREE.Vector3(-9.2, 0, 9.8), rotY: -Math.PI / 4 }
    ];

    // 4. Server Tech Bay (Datacenter Racks) di pojok kanan atas
    const serverBay = new THREE.Group();
    serverBay.position.set(11, 0, -8);
    for (let i = 0; i < 3; i++) {
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2.8, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x090d0b, roughness: 0.3 })
      );
      rack.position.set(i * 1.6 - 1.6, 1.4, 0);
      rack.castShadow = true;
      rack.userData = { type: 'server' };
      serverBay.add(rack);

      // Blinking rack strips
      for (let s = 0; s < 6; s++) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.06, 0.02),
          new THREE.MeshBasicMaterial({ color: (i + s) % 2 === 0 ? 0x22c55e : 0x06b6d4 })
        );
        strip.position.set(i * 1.6 - 1.6, 0.4 + s * 0.42, 0.51);
        serverBay.add(strip);
      }
    }
    world.add(serverBay);

    return {
      world,
      glassGroup,
      socAlertLight,
      miniRack,
      coffeeMaker,
      restSlots,
      loungePos: new THREE.Vector3(-10.5, 0, 8.5),
      bossPos: new THREE.Vector3(0, 0, -9.2)
    };
  }

  /**
   * Creates a curved Data Packet projectile fired from Mastermind to a worker
   */
  function createDataProjectile(startPos, endPos, onArrival) {
    const group = new THREE.Group();

    // Glowing energy core
    const coreGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Outer aura
    const auraGeo = new THREE.SphereGeometry(0.32, 12, 12);
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4 });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    group.add(aura);

    // Parabolic Bezier control points
    const p0 = startPos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const p2 = endPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const p1 = new THREE.Vector3(
      (p0.x + p2.x) / 2,
      Math.max(p0.y, p2.y) + 3.2,
      (p0.z + p2.z) / 2
    );

    let t = 0;
    const speed = 0.035; // 24-30 frames to reach destination

    return {
      group,
      update: function () {
        t += speed;
        if (t >= 1) {
          if (onArrival) onArrival();
          return false; // Done
        }
        // Quadratic bezier formula
        const u = 1 - t;
        group.position.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
        group.position.y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
        group.position.z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
        core.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.4);
        return true; // Still active
      }
    };
  }

  return {
    createOfficeScene,
    createDataProjectile
  };
})();
