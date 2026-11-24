/**
 * workers/financial.js - Worker & Meja Kerja Kategori Keuangan / Akuntansi
 */
'use strict';

window.WorkerFinancial = (function () {
  function decorateDesk(desk, category, status, cpuPct) {
    const finGroup = new THREE.Group();
    finGroup.position.set(0.88, 0.76, 0.28);

    // Ledger Book (Open accounting journal)
    const bookGeo = new THREE.BoxGeometry(0.38, 0.03, 0.28);
    const bookMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.9 });
    const book = new THREE.Mesh(bookGeo, bookMat);
    finGroup.add(book);

    // Book cover trim
    const coverGeo = new THREE.BoxGeometry(0.40, 0.015, 0.30);
    const cover = new THREE.Mesh(coverGeo, new THREE.MeshStandardMaterial({ color: 0x854d0e }));
    cover.position.y = -0.015;
    book.add(cover);

    // Mini Abacus / Calculator
    const abacusGeo = new THREE.BoxGeometry(0.24, 0.02, 0.16);
    const abacus = new THREE.Mesh(abacusGeo, new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 }));
    abacus.position.set(-0.25, 0.01, -0.08);
    finGroup.add(abacus);

    // Coin stacks (Gold & Bronze coins)
    const coinGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12);
    const coinGoldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.3 });
    const coinCopperMat = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.6, roughness: 0.4 });
    const coinStacks = [];
    [
      { x: -0.15, z: 0.16, h: 4, mat: coinGoldMat },
      { x: -0.06, z: 0.17, h: 6, mat: coinGoldMat },
      { x: 0.12, z: 0.15, h: 3, mat: coinCopperMat }
    ].forEach(stack => {
      for (let c = 0; c < stack.h; c++) {
        const coin = new THREE.Mesh(coinGeo, stack.mat);
        coin.position.set(stack.x, 0.02 + c * 0.014, stack.z);
        finGroup.add(coin);
        coinStacks.push(coin);
      }
    });

    desk.add(finGroup);
    return { finGroup, coinStacks };
  }

  function applyWorkerStyle(worker, scale, skinMaterial, eyeMaterial) {
    // Professional Emerald Vest, Crisp White Collar, and Golden Reading Glasses
    const headSize = 0.42 * scale;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });

    // Neat side-combed hair
    const hair = new THREE.Mesh(new THREE.BoxGeometry(headSize * 1.04, 0.18 * scale, headSize * 1.04), hairMat);
    hair.position.set(0, 1.31 * scale, 0);
    worker.add(hair);

    // White shirt collar
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * scale, 0.12 * scale, 0.29 * scale),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    collar.position.set(0, 0.82 * scale, 0);
    worker.add(collar);

    // Golden necktie
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.06 * scale, 0.32 * scale, 0.3 * scale),
      new THREE.MeshStandardMaterial({ color: 0xd97706 })
    );
    tie.position.set(0, 0.68 * scale, 0);
    worker.add(tie);

    // Gold reading spectacles
    [-0.09 * scale, 0.09 * scale].forEach(gx => {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.04 * scale, 0.008 * scale, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8 })
      );
      rim.position.set(gx, 1.14 * scale, 0.22 * scale);
      worker.add(rim);
    });
  }

  return {
    decorateDesk,
    applyWorkerStyle
  };
})();
