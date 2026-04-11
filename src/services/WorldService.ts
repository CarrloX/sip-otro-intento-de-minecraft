export const CHUNK_SIZE = 16;

const pseudoRandom = (x: number, z: number) => {
  let h = Math.imul(x ^ (z << 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const noise = (x: number, z: number) => {
  return Math.floor(Math.sin(x * 0.1) * 2 + Math.cos(z * 0.1) * 2);
};

export const generateChunk = (
  chunkX: number,
  chunkZ: number,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>
): string[] => {
  const generatedKeys: string[] = [];
  const chunkId = `${chunkX},${chunkZ}`;
  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  // Generate Base Terrain
  for (let x = startX; x < startX + CHUNK_SIZE; x++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      const surfaceY = noise(x, z);
      for (let y = surfaceY; y >= surfaceY - 4; y--) {
        const key = `${x},${y},${z}`;
        
        // 1. Check for user modifications (Option B)
        if (worldData.has(key)) {
          const modType = worldData.get(key);
          if (modType !== 0) { // 0 means destroyed/air
            loadedBlocks.set(key, modType!);
            generatedKeys.push(key);
          }
          continue; // Skip normal generation for modified blocks
        }

        // 2. Normal Generation
        let type = 3;
        if (y === surfaceY) type = 1;
        else if (y > surfaceY - 3) type = 2;
        loadedBlocks.set(key, type);
        generatedKeys.push(key);
      }

      // 3. Tree Generation (Deterministic)
      if (pseudoRandom(x, z) < 0.02) {
        generateTree(x, surfaceY + 1, z, chunkId, loadedBlocks, worldData, generatedKeys);
      }
    }
  }
  return generatedKeys;
};

const generateLeaves = (
  centerX: number,
  centerY: number,
  centerZ: number,
  height: number,
  chunkId: string,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>,
  generatedKeys: string[]
) => {
  for (let hx = centerX - 2; hx <= centerX + 2; hx++) {
    for (let hz = centerZ - 2; hz <= centerZ + 2; hz++) {
      for (let hy = centerY + height - 2; hy <= centerY + height + 1; hy++) {
        const isCornerTop = Math.abs(hx - centerX) === 2 && Math.abs(hz - centerZ) === 2 && hy === centerY + height + 1;
        if (isCornerTop) continue;
        
        const key = `${hx},${hy},${hz}`;
        if (!worldData.has(key)) {
          loadedBlocks.set(key, 5);
          generatedKeys.push(key);
        } else {
            const modType = worldData.get(key);
            if (modType !== 0) {
              loadedBlocks.set(key, modType!);
              generatedKeys.push(key);
            }
        }
      }
    }
  }
};

export const generateTree = (
  x: number,
  y: number,
  z: number,
  chunkId: string,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>,
  generatedKeys: string[]
) => {
  const height = 4;
  for (let i = 0; i < height; i++) {
    const key = `${x},${y + i},${z}`;
    if (!worldData.has(key)) {
       loadedBlocks.set(key, 4);
       generatedKeys.push(key);
    } else {
        const modType = worldData.get(key);
        if (modType !== 0) {
          loadedBlocks.set(key, modType!);
          generatedKeys.push(key);
        }
    }
  }
  
  generateLeaves(x, y, z, height, chunkId, loadedBlocks, worldData, generatedKeys);
};
