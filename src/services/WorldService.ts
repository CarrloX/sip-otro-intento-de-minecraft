export const CHUNK_SIZE = 16;
export const Y_MIN = -64;
export const Y_MAX = 255;
export const Y_HEIGHT = Y_MAX - Y_MIN + 1; // 320
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * Y_HEIGHT; // 81920

export const getBlockIndex = (lx: number, y: number, lz: number): number => {
  const indexY = y - Y_MIN;
  if (indexY < 0 || indexY >= Y_HEIGHT || lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return -1;
  return lx + (lz * CHUNK_SIZE) + (indexY * CHUNK_SIZE * CHUNK_SIZE);
};

export const pseudoRandom = (x: number, z: number) => {
  let h = Math.imul(x ^ (z << 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const noise = (x: number, z: number) => {
  return Math.floor(Math.sin(x * 0.1) * 2 + Math.cos(z * 0.1) * 2);
};

export const getTerrainType = (y: number, surfaceY: number): number => {
  if (y === surfaceY) return 1; // Grass
  if (y > surfaceY - 3) return 2; // Dirt
  return 3; // Stone
};

export const generateChunk = (
  chunkX: number,
  chunkZ: number,
  chunkWorldData: Map<string, number>
): Uint8Array => {
  const chunkData = new Uint8Array(CHUNK_VOLUME);
  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  // 1. Generate Base Terrain Let's iterate linearly local coords
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const gx = startX + lx;
      const gz = startZ + lz;
      const surfaceY = noise(gx, gz);
      
      const depth = 64; 
      for (let y = surfaceY; y >= surfaceY - depth; y--) {
        const idx = getBlockIndex(lx, y, lz);
        if (idx !== -1) {
            chunkData[idx] = getTerrainType(y, surfaceY);
        }
      }
    }
  }

  // 1.5 Generate Trees with Deterministic Procedural Overlapping (fixes cross-chunk bleeding)
  const TREE_OVERLAP = 2; // Leaves extend up to 2 blocks from trunk
  for (let lx = -TREE_OVERLAP; lx < CHUNK_SIZE + TREE_OVERLAP; lx++) {
    for (let lz = -TREE_OVERLAP; lz < CHUNK_SIZE + TREE_OVERLAP; lz++) {
      const gx = startX + lx;
      const gz = startZ + lz;
      
      if (pseudoRandom(gx, gz) < 0.02) {
        const surfaceY = noise(gx, gz);
        generateTree(lx, surfaceY + 1, lz, chunkData);
      }
    }
  }

  // 2. Apply User Modifications
  chunkWorldData.forEach((type, key) => {
    const [gx, gy, gz] = key.split(',').map(Number);
    // Convert global to local
    const lx = gx - startX;
    const lz = gz - startZ;
    const idx = getBlockIndex(lx, gy, lz);
    
    // Only apply if inside THIS chunk's bounds.
    // (If the mod map contained neighbors for lighting, they are ignored structurally here)
    if (idx !== -1) {
      if (type === 0) {
          chunkData[idx] = 0; // Air / removed block
      } else {
          chunkData[idx] = type;
      }
    }
  });

  return chunkData;
};

const generateLeaves = (
  centerX: number,
  centerY: number,
  centerZ: number,
  height: number,
  chunkData: Uint8Array
) => {
  for (let hx = centerX - 2; hx <= centerX + 2; hx++) {
    for (let hz = centerZ - 2; hz <= centerZ + 2; hz++) {
      for (let hy = centerY + height - 2; hy <= centerY + height + 1; hy++) {
        const dist = Math.abs(hx - centerX) + Math.abs(hz - centerZ);
        const isCornerTop = dist === 4 && hy === centerY + height + 1;
        if (isCornerTop) continue;
        
        const idx = getBlockIndex(hx, hy, hz);
        if (idx !== -1) {
            // Only place if it's air or leaves (don't overwrite wood/stone)
            if (chunkData[idx] === 0 || chunkData[idx] === 5) {
                chunkData[idx] = 5; // Leaf
            }
        }
      }
    }
  }
};

export const generateTree = (
  lx: number,
  y: number,
  lz: number,
  chunkData: Uint8Array
) => {
  const height = 4;
  for (let i = 0; i < height; i++) {
    const idx = getBlockIndex(lx, y + i, lz);
    if (idx !== -1) {
        chunkData[idx] = 4; // Log
    }
  }
  
  generateLeaves(lx, y, lz, height, chunkData);
};

export const getGlobalBlockType = (
  x: number, y: number, z: number,
  chunksData: Map<string, Uint8Array>
): number => {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rz = Math.round(z);

  if (ry < Y_MIN || ry > Y_MAX) return 0;

  const cx = Math.floor(rx / CHUNK_SIZE);
  const cz = Math.floor(rz / CHUNK_SIZE);
  const chunkData = chunksData.get(`${cx},${cz}`);
  
  if (!chunkData) return 0;
  
  const lx = ((rx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((rz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const idx = getBlockIndex(lx, ry, lz);
  
  return idx !== -1 ? chunkData[idx] : 0;
};
