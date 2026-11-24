/**
 * workers/webWorker.js - Worker & Meja Kerja Kategori Web / Frontend / App
 */
'use strict';

window.WorkerWeb = (function () {
  function decorateDesk(desk, category, status, cpuPct) {
    const webGroup = new THREE.Group();
    webGroup.position.set(0.88, 0.76, 0.28);

    // Wireframe Blueprint Paper
    const paperGeo = new THREE.BoxGeometry(0.42, 0.01, 0.32);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.8 });
    const paper = new THREE.Mesh(paperGeo, paperMat);
    webGroup.add(paper);

    // Wireframe UI grid blocks on blueprint
    [
      { x: -0.1, z: -0.08, w: 0.16, d: 0.05, c: 0x0284c7 },
      { x: 0.08, z: -0.08, w: 0.16, d: 0.05, c: 0x38bdf8 },
      { x: -0.01, z: 0.04, w: 0.34, d: 0.14, c: 0x93c5fd }
    ].forEach(box => {
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, 0.012, box.d), new THREE.MeshBasicMaterial({ color: box.c }));
      bMesh.position.set(box.x, 0.008, box.z);
      paper.add(bMesh);
    });

    // 3D Mini Bar Chart / Analytics on desk
    const chartGroup = new THREE.Group();
    chartGroup.position.set(-0.55, 0.76, 0.22);
    [0.08, 0.14, 0.19, 0.12].forEach((h, idx) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, h, 0.04),
        new THREE.MeshStandardMaterial({ color: idx === 2 ? 0x10b981 : 0x0284c7 })
      );
      bar.position.set(idx * 0.06 - 0.09, h / 2, 0);
      chartGroup.add(bar);
    });
    webGroup.add(chartGroup);

    desk.add(webGroup);
    return { webGroup, chartGroup };
  }

  function applyWorkerStyle(worker, scale, skinMaterial, eyeMaterial) {
    // Modern Frontend Dev: Vibrant Ocean Blue Hoodie with Kangaroo Pouch & Backward Baseball Cap
    const headSize = 0.42 * scale;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    // Hair
    const hair = new THREE.Mesh(new THREE.BoxGeometry(headSize * 1.05, 0.22 * scale, headSize * 1.05), hairMat);
    hair.position.set(0, 1.32 * scale, -0.02 * scale);
    worker.add(hair);

    // Front kangaroo pouch on hoodie
    const pouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.32 * scale, 0.16 * scale, 0.06 * scale),
      new THREE.MeshStandardMaterial({ color: 0x0369a1 })
    );
    pouch.position.set(0, 0.56 * scale, 0.13 * scale);
    worker.add(pouch);

    // Backward baseball cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(headSize * 0.55, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0284c7 })
    );
    cap.position.set(0, 1.28 * scale, 0);
    worker.add(cap);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 * scale, 0.02 * scale, 0.16 * scale),
      new THREE.MeshStandardMaterial({ color: 0x0369a1 })
    );
    visor.position.set(0, 1.29 * scale, -0.26 * scale);
    worker.add(visor);
  }

  return {
    decorateDesk,
    applyWorkerStyle
  };
})();
