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

    // 1. Flooring with stylized grid tiles
    const floorGeo = new THREE.PlaneGeometry(36, 32);
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b130e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#182d21';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(18, 16);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.8,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    world.add(floor);

    // Outer office boundary walls (low-profile rim to keep top-down view clear)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x142019, roughness: 0.9 });
    const wallGeoH = new THREE.BoxGeometry(36, 1.2, 0.4);
    const wallGeoV = new THREE.BoxGeometry(0.4, 1.2, 32);

    const northWall = new THREE.Mesh(wallGeoH, wallMat);
    northWall.position.set(0, 0.6, -16);
    world.add(northWall);

    const southWall = new THREE.Mesh(wallGeoH, wallMat);
    southWall.position.set(0, 0.6, 16);
    world.add(southWall);

    const westWall = new THREE.Mesh(wallGeoV, wallMat);
    westWall.position.set(-18, 0.6, 0);
    world.add(westWall);

    const eastWall = new THREE.Mesh(wallGeoV, wallMat);
    eastWall.position.set(18, 0.6, 0);
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
    const glassFrontL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.1), glassMat);
    glassFrontL.position.set(-3.2, 1.2, 3.65);
    glassGroup.add(glassFrontL);

    const glassFrontR = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.1), glassMat);
    glassFrontR.position.set(3.2, 1.2, 3.65);
    glassGroup.add(glassFrontR);

    // Entrance opening in the middle (x between -1.1 and 1.1)

    // Executive curved desk for Mastermind
    const bossDesk = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 0.1, 24, 1, false, Math.PI * 0.15, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
    );
    bossDesk.position.set(0, 0.75, 0.8);
    bossDesk.rotation.y = Math.PI * 0.5;
    glassGroup.add(bossDesk);

    // 3 Curved Panorama Screens
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

    // 3. Zona Istirahat & Lounge (Sofa, Coffee Bar, Bed Pods) di pojok kiri bawah
    const loungeGroup = new THREE.Group();
    loungeGroup.position.set(-11, 0, 9);

    // Circular rug
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(3.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.9 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.02;
    loungeGroup.add(rug);

    // Modern Curved Sofa
    const sofa = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.45, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 })
    );
    sofa.position.set(0, 0.25, 0);
    sofa.castShadow = true;
    loungeGroup.add(sofa);

    const sofaBack = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.6, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
    );
    sofaBack.position.set(0, 0.55, -0.4);
    sofaBack.castShadow = true;
    loungeGroup.add(sofaBack);

    // Coffee Machine Bar Table
    const barTable = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.9, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    barTable.position.set(0, 0.45, 2.6);
    loungeGroup.add(barTable);

    // Coffee maker
    const coffeeMaker = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.55, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 })
    );
    coffeeMaker.position.set(-0.4, 1.15, 2.6);
    coffeeMaker.userData = { type: 'coffee' };
    loungeGroup.add(coffeeMaker);

    world.add(loungeGroup);

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
      loungePos: new THREE.Vector3(-11, 0, 9),
      bossPos: new THREE.Vector3(0, 0, -9.5)
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
