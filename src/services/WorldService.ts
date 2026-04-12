export const CHUNK_SIZE = 16;

const pseudoRandom = (x: number, z: number) => {
  let h = Math.imul(x ^ (z << 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const noise = (x: number, z: number) => {
  return Math.floor(Math.sin(x * 0.1) * 2 + Math.cos(z * 0.1) * 2);
};

const getTerrainType = (y: number, surfaceY: number): number => {
  if (y === surfaceY) return 1; // Grass
  if (y > surfaceY - 3) return 2; // Dirt
  return 3; // Stone
};

const generateBlockColumn = (
  x: number,
  z: number,
  surfaceY: number,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>,
  generatedKeys: string[]
) => {
  const depth = 64; // Minecraft-like depth
  for (let y = surfaceY; y >= surfaceY - depth; y--) {
    const key = `${x},${y},${z}`;
    
    // Check for user modifications
    const modType = worldData.get(key);
    if (modType !== undefined) {
      if (modType !== 0) {
        loadedBlocks.set(key, modType);
        generatedKeys.push(key);
      }
      continue;
    }

    // Normal Generation
    const type = getTerrainType(y, surfaceY);
    loadedBlocks.set(key, type);
    generatedKeys.push(key);
  }
};

export const generateChunk = (
  chunkX: number,
  chunkZ: number,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>
): string[] => {
  const generatedKeys: string[] = [];
  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  for (let x = startX; x < startX + CHUNK_SIZE; x++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      const surfaceY = noise(x, z);
      
      generateBlockColumn(x, z, surfaceY, loadedBlocks, worldData, generatedKeys);

      if (pseudoRandom(x, z) < 0.02) {
        generateTree(x, surfaceY + 1, z, loadedBlocks, worldData, generatedKeys);
      }
    }
  }

  // Final Pass: Ensure ALL user modifications in this chunk are captured
  worldData.forEach((type, key) => {
    const [x, , z] = key.split(',').map(Number);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);

    if (cx === chunkX && cz === chunkZ) {
      if (type === 0) {
        loadedBlocks.delete(key);
        const index = generatedKeys.indexOf(key);
        if (index > -1) generatedKeys.splice(index, 1);
      } else if (!loadedBlocks.has(key)) {
        loadedBlocks.set(key, type);
        generatedKeys.push(key);
      }
    }
  });

  return generatedKeys;
};

const addLeafBlock = (
  key: string,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>,
  generatedKeys: string[]
) => {
  const modType = worldData.get(key);
  
  if (modType === undefined) {
    loadedBlocks.set(key, 5); // Default leaf
    generatedKeys.push(key);
  } else if (modType !== 0) {
    loadedBlocks.set(key, modType);
    generatedKeys.push(key);
  }
};

const generateLeaves = (
  centerX: number,
  centerY: number,
  centerZ: number,
  height: number,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>,
  generatedKeys: string[]
) => {
  for (let hx = centerX - 2; hx <= centerX + 2; hx++) {
    for (let hz = centerZ - 2; hz <= centerZ + 2; hz++) {
      for (let hy = centerY + height - 2; hy <= centerY + height + 1; hy++) {
        const dist = Math.abs(hx - centerX) + Math.abs(hz - centerZ);
        const isCornerTop = dist === 4 && hy === centerY + height + 1;
        if (isCornerTop) continue;
        
        addLeafBlock(`${hx},${hy},${hz}`, loadedBlocks, worldData, generatedKeys);
      }
    }
  }
};

export const generateTree = (
  x: number,
  y: number,
  z: number,
  loadedBlocks: Map<string, number>,
  worldData: Map<string, number>,
  generatedKeys: string[]
) => {
  const height = 4;
  for (let i = 0; i < height; i++) {
    const key = `${x},${y + i},${z}`;
    const modType = worldData.get(key);
    
    if (modType === undefined) {
       loadedBlocks.set(key, 4); // Default log
       generatedKeys.push(key);
    } else if (modType !== 0) {
      loadedBlocks.set(key, modType);
      generatedKeys.push(key);
    }
  }
  
  generateLeaves(x, y, z, height, loadedBlocks, worldData, generatedKeys);
};
