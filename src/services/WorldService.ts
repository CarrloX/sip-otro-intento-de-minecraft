import * as THREE from 'three';

export const generateWorld = (
  worldSize: number,
  addBlockFn: (x: number, y: number, z: number, type: number) => void,
  generateTreeFn: (x: number, y: number, z: number) => void
) => {
  const noise = (x: number, z: number) => {
    return Math.floor(Math.sin(x * 0.1) * 2 + Math.cos(z * 0.1) * 2);
  };

  for (let x = -worldSize / 2; x < worldSize / 2; x++) {
    for (let z = -worldSize / 2; z < worldSize / 2; z++) {
      const surfaceY = noise(x, z);
      for (let y = surfaceY; y >= surfaceY - 4; y--) {
        let type = 3;
        if (y === surfaceY) type = 1;
        else if (y > surfaceY - 3) type = 2;
        addBlockFn(x, y, z, type);
      }
      if (
        Math.random() < 0.03 &&
        x > -worldSize / 2 + 2 &&
        x < worldSize / 2 - 2 &&
        z > -worldSize / 2 + 2 &&
        z < worldSize / 2 - 2
      ) {
        generateTreeFn(x, surfaceY + 1, z);
      }
    }
  }
};

export const generateTree = (
  x: number,
  y: number,
  z: number,
  addBlockFn: (x: number, y: number, z: number, type: number) => void,
  worldBlocks: Map<string, any>
) => {
  const height = 4;
  for (let i = 0; i < height; i++) {
    addBlockFn(x, y + i, z, 4);
  }
  for (let hx = x - 2; hx <= x + 2; hx++) {
    for (let hz = z - 2; hz <= z + 2; hz++) {
      for (let hy = y + height - 2; hy <= y + height + 1; hy++) {
        if (Math.abs(hx - x) === 2 && Math.abs(hz - z) === 2 && hy === y + height + 1) continue;
        if (!worldBlocks.has(`${hx},${hy},${hz}`)) {
          addBlockFn(hx, hy, hz, 5);
        }
      }
    }
  }
};
