/**
 * workers/system.js - Worker & Meja Kerja Kategori Database / Server / Cloud / Storage
 */
'use strict';

window.WorkerSystem = (function () {
  function decorateDesk(desk, category, status, cpuPct) {
    const rackGroup = new THREE.Group();
    rackGroup.position.set(1.15, 0.76, 0.32);

    // Mini 4U Server Tower
    const rackGeo = new THREE.BoxGeometry(0.24, 0.44, 0.26);
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
    const rack = new THREE.Mesh(rackGeo, rackMat);
    rack.position.y = 0.22;
    rack.castShadow = true;
    rackGroup.add(rack);

    // Server bays & LEDs
    const leds = [];
    for (let s = 0; s < 4; s++) {
      const bayGeo = new THREE.BoxGeometry(0.22, 0.06, 0.01);
      const bay = new THREE.Mesh(bayGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      bay.position.set(0, 0.12 - s * 0.08, 0.135);
      rack.add(bay);

      // Status LED (Blinking IO)
      const ledMat = new THREE.MeshBasicMaterial({ color: s === 2 ? 0x06b6d4 : 0x22c55e });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), ledMat);
      led.position.set(0.08, 0.12 - s * 0.08, 0.142);
      rack.add(led);
      leds.push(led);
    }

    // Hardware Tool: Multimeter & Screwdriver on workbench
    const toolGroup = new THREE.Group();
    toolGroup.position.set(-0.25, 0.76, 0.25);
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.18), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 }));
    const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
    driver.rotation.z = Math.PI / 4;
    driver.position.set(0.12, 0.01, 0);
    toolGroup.add(meter, driver);
    rackGroup.add(toolGroup);

    desk.add(rackGroup);
    return { rackGroup, leds };
  }

  function applyWorkerStyle(worker, scale, skinMaterial, eyeMaterial) {
    // Systems Engineer / DevOps: Glowing Cyan Tech Visor & Comms Headset
    const headSize = 0.42 * scale;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    // Hair
    const hair = new THREE.Mesh(new THREE.BoxGeometry(headSize * 1.05, 0.22 * scale, headSize * 1.05), hairMat);
    hair.position.set(0, 1.32 * scale, -0.02 * scale);
    worker.add(hair);

    // Glowing Cyan Tech Visor
    const visorGeo = new THREE.BoxGeometry(headSize * 0.95, 0.1 * scale, 0.1 * scale);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.16 * scale, 0.18 * scale);
    worker.add(visor);

    // Comms Headset
    const micArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008 * scale, 0.008 * scale, 0.22 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x64748b })
    );
    micArm.rotation.x = Math.PI / 3;
    micArm.rotation.z = -Math.PI / 6;
    micArm.position.set(-0.2 * scale, 1.12 * scale, 0.12 * scale);
    worker.add(micArm);
  }

  return {
    decorateDesk,
    applyWorkerStyle
  };
})();
