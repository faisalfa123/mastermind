/**
 * workers/media.js - Worker & Meja Kerja Kategori Foto / Video / Media
 */
'use strict';

window.WorkerMedia = (function () {
  function decorateDesk(desk, category, status, cpuPct) {
    const mediaGroup = new THREE.Group();
    mediaGroup.position.set(0.88, 0.76, 0.28);

    // Digital Drawing & Color Grading Tablet
    const tabletGeo = new THREE.BoxGeometry(0.44, 0.02, 0.32);
    const tabletMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
    const tablet = new THREE.Mesh(tabletGeo, tabletMat);
    mediaGroup.add(tablet);

    // Color palette strip on tablet
    const paletteColors = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0x8b5cf6];
    paletteColors.forEach((col, pIdx) => {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), new THREE.MeshBasicMaterial({ color: col }));
      dot.position.set(-0.16 + pIdx * 0.08, 0.015, -0.1);
      tablet.add(dot);
    });

    // Stylus Pen
    const stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x64748b }));
    stylus.rotation.z = Math.PI / 3;
    stylus.position.set(0.18, 0.02, 0.04);
    mediaGroup.add(stylus);

    // DSLR Camera with zoom lens & red ring
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.09), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 }));
    camBody.position.set(0.68, 0.81, 0.55);
    const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.035, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }));
    camLens.rotation.x = Math.PI / 2;
    camLens.position.set(0, 0, 0.08);
    camBody.add(camLens);

    // Mini Ring Light
    const ringGeo = new THREE.TorusGeometry(0.08, 0.012, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const ringLight = new THREE.Mesh(ringGeo, ringMat);
    ringLight.position.set(-0.6, 0.95, -0.15);
    ringLight.rotation.y = 0.5;
    mediaGroup.add(ringLight);

    desk.add(camBody);
    desk.add(mediaGroup);

    return { mediaGroup, camBody, ringLight };
  }

  function applyWorkerStyle(worker, scale, skinMaterial, eyeMaterial) {
    // Creative Artist: Warm Amber Jacket, Crossbody Leather Camera Strap, Beret, and Glasses
    const headSize = 0.42 * scale;

    // Crossbody camera leather strap
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.04 * scale, 0.54 * scale, 0.3 * scale),
      new THREE.MeshStandardMaterial({ color: 0x451a03 })
    );
    strap.rotation.z = -0.45;
    strap.position.set(0, 0.65 * scale, 0);
    worker.add(strap);

    // Artistic Beret / Flat Cap
    const beret = new THREE.Mesh(
      new THREE.CylinderGeometry(headSize * 0.65, headSize * 0.52, 0.14 * scale, 12),
      new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.9 })
    );
    beret.position.set(-0.04 * scale, 1.36 * scale, -0.02 * scale);
    beret.rotation.z = -0.15;
    worker.add(beret);

    // Dark-rimmed Editor Eyeglasses
    [-0.1 * scale, 0.1 * scale].forEach(gx => {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * scale, 0.07 * scale, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x18181b })
      );
      frame.position.set(gx, 1.15 * scale, 0.22 * scale);
      worker.add(frame);
    });
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.06 * scale, 0.015 * scale, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x18181b })
    );
    bridge.position.set(0, 1.16 * scale, 0.22 * scale);
    worker.add(bridge);
  }

  return {
    decorateDesk,
    applyWorkerStyle
  };
})();
