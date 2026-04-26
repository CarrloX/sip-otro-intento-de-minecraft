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

let globalSeedOffset = 0;

export const setGlobalSeed = (seed: number) => {
  globalSeedOffset = seed;
};

export const getGlobalSeed = () => globalSeedOffset;

export const pseudoRandom = (x: number, z: number) => {
  const sx = x + globalSeedOffset;
  const sz = z + globalSeedOffset;
  let h = Math.imul(sx ^ (sz << 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// --- SIMPLEX NOISE IMPLEMENTATION ---
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const grad3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];

const p = new Uint8Array([151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,
  103,30,69,142,8,99,37,240,21,10,23,190, 6,148,247,120,234,75,0,26,197,62,94,252,219,
  203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,
  245,40,244,102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208, 89,18,169,200,
  196,135,130,116,188,159,86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,5,202,
  38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
  119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,129,22,39,253, 19,98,108,
  110,79,113,224,232,178,185, 112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,
  179,162,241, 81,51,145,235,249,14,239,107,49,192,214, 31,181,199,106,157,184, 84,204,
  176,115,121,50,45,127, 4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,
  78,66,215,61,156,180]);

const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  perm[i] = p[i & 255];
  permMod12[i] = perm[i] % 12;
}

const dot = (g: number[], x: number, y: number) => {
  return g[0]*x + g[1]*y;
};

const simplex2 = (xin: number, yin: number) => {
  let n0, n1, n2; 
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0; 
  const y0 = yin - Y0; 

  let i1, j1;
  if(x0 > y0) {i1 = 1; j1 = 0;} 
  else {i1 = 0; j1 = 1;}

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;
  const gi0 = permMod12[ii + perm[jj]];
  const gi1 = permMod12[ii + i1 + perm[jj + j1]];
  const gi2 = permMod12[ii + 1 + perm[jj + 1]];

  let t0 = 0.5 - x0*x0 - y0*y0;
  if(t0 < 0) n0 = 0;
  else {
    t0 *= t0;
    n0 = t0 * t0 * dot(grad3[gi0], x0, y0);
  }

  let t1 = 0.5 - x1*x1 - y1*y1;
  if(t1 < 0) n1 = 0;
  else {
    t1 *= t1;
    n1 = t1 * t1 * dot(grad3[gi1], x1, y1);
  }

  let t2 = 0.5 - x2*x2 - y2*y2;
  if(t2 < 0) n2 = 0;
  else {
    t2 *= t2;
    n2 = t2 * t2 * dot(grad3[gi2], x2, y2);
  }
  return 70 * (n0 + n1 + n2);
};

const fbm = (x: number, y: number, octaves: number, gain: number = 0.5, lacunarity: number = 2) => {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxVal = 0;

  for (let i = 0; i < octaves; i++) {
    total += simplex2(x * frequency, y * frequency) * amplitude;
    maxVal += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return total / maxVal; 
};

// --- NATURAL BIOME GENERATION ---
export const noise = (x: number, z: number) => {
  const scale = 0.002;
  const sx = x + globalSeedOffset;
  const sz = z + globalSeedOffset;
  
  // 1. Continental Elevation - defines huge slow-moving plains or mountains
  const elevation = fbm(sx * scale, sz * scale, 3, 0.5, 2);
  
  // 2. High-Frequency Detail - adds bumpy characteristics and small hills
  const detail = fbm(sx * 0.008, sz * 0.008, 4, 0.5, 2);

  // 3. Biome Masking
  // Smoothly normalize elevation to positive space
  let normalizedElevation = (elevation + 1) / 2; 
  // Sharpen the plains vs mountains contrast using exponentiation
  normalizedElevation = Math.pow(normalizedElevation, 1.8);

  const baseHeight = normalizedElevation * 40; 
  
  // If we are in the mountains, roughness is extreme. If in plains, it's gentle.
  const terrainRoughness = normalizedElevation * 50 + 5; 
  
  const finalY = baseHeight + (detail * terrainRoughness);
  return Math.floor(finalY);
};

export const getTerrainType = (y: number, surfaceY: number): number => {
  if (y === surfaceY) return 1; // Grass
  if (y > surfaceY - 3) return 2; // Dirt
  return 3; // Stone
};

const generateBaseTerrain = (
  startX: number,
  startZ: number,
  chunkData: Uint8Array
) => {
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
};

const generateTrees = (
  startX: number,
  startZ: number,
  chunkData: Uint8Array
) => {
  // 1.5 Generate Trees with Deterministic Procedural Overlapping (fixes cross-chunk bleeding)
  const TREE_OVERLAP = 2; // Leaves extend up to 2 blocks from trunk
  for (let lx = -TREE_OVERLAP; lx < CHUNK_SIZE + TREE_OVERLAP; lx++) {
    for (let lz = -TREE_OVERLAP; lz < CHUNK_SIZE + TREE_OVERLAP; lz++) {
      const gx = startX + lx;
      const gz = startZ + lz;
      
      if (pseudoRandom(gx, gz) < 0.02) {
        const surfaceY = noise(gx, gz);
        generateTree(gx, gz, lx, surfaceY + 1, lz, chunkData);
      }
    }
  }
};

const applyUserModifications = (
  startX: number,
  startZ: number,
  chunkWorldData: Map<string, number>,
  chunkData: Uint8Array
) => {
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
};

export const generateChunk = (
  chunkX: number,
  chunkZ: number,
  chunkWorldData: Map<string, number>
): Uint8Array => {
  const chunkData = new Uint8Array(CHUNK_VOLUME);
  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  generateBaseTerrain(startX, startZ, chunkData);
  generateTrees(startX, startZ, chunkData);
  applyUserModifications(startX, startZ, chunkWorldData, chunkData);

  return chunkData;
};

const placeLeaf = (hx: number, hy: number, hz: number, chunkData: Uint8Array) => {
  const idx = getBlockIndex(hx, hy, hz);
  if (idx !== -1) {
      // Only place if it's air or leaves (don't overwrite wood/stone)
      if (chunkData[idx] === 0 || chunkData[idx] === 5) {
          chunkData[idx] = 5; // Leaf
      }
  }
};

export const generateTree = (
  gx: number,
  gz: number,
  lx: number,
  y: number,
  lz: number,
  chunkData: Uint8Array
) => {
  const rand1 = pseudoRandom(gx * 1.3, gz * 1.7);
  const rand2 = pseudoRandom(gx * 2.1, gz * 0.9);
  
  // Height between 4 and 7
  const height = 4 + Math.floor(rand1 * 4);
  
  // Choose tree shape based on rand2
  // Shape 0: Standard oak (wider bottom, smaller top)
  // Shape 1: Tall pine-like (narrow, starts lower)
  // Shape 2: Bushy (short, wide leaves)
  const shape = Math.floor(rand2 * 3);

  // Generate Trunk
  for (let i = 0; i < height; i++) {
    const idx = getBlockIndex(lx, y + i, lz);
    if (idx !== -1) {
        chunkData[idx] = 4; // Log
    }
  }
  
  // Generate Leaves
  if (shape === 0) {
      // Standard Minecraft Oak
      for (let hy = y + height - 3; hy <= y + height + 1; hy++) {
          const dy = hy - (y + height);
          let radius = dy <= -1 ? 2 : 1;
          if (dy === 1) radius = 1;

          for (let hx = lx - radius; hx <= lx + radius; hx++) {
              for (let hz = lz - radius; hz <= lz + radius; hz++) {
                  const dist = Math.abs(hx - lx) + Math.abs(hz - lz);
                  const cornerSeed = pseudoRandom(hx * 1.1 + gx, hz * 1.2 + gz + hy);
                  if (radius === 2 && dist === 4 && cornerSeed < 0.5) continue;
                  if (dy === 1 && dist === 2) continue;

                  placeLeaf(hx, hy, hz, chunkData);
              }
          }
      }
  } else if (shape === 1) {
      // Pine tree (tall and narrow)
      const leafStart = Math.max(1, Math.floor(height / 2));
      for (let hy = y + leafStart; hy <= y + height + 1; hy++) {
          const dy = (y + height + 1) - hy; 
          const radius = (dy % 2 === 0) ? 1 : 2; 
          
          for (let hx = lx - radius; hx <= lx + radius; hx++) {
              for (let hz = lz - radius; hz <= lz + radius; hz++) {
                  const dist = Math.abs(hx - lx) + Math.abs(hz - lz);
                  if (radius === 2 && dist >= 3) continue; 
                  if (radius === 1 && dist >= 2) continue; 
                  
                  placeLeaf(hx, hy, hz, chunkData);
              }
          }
      }
  } else {
      // Bushy tree (spherical)
      const radius = 2.5;
      const centerY = y + height - 1;
      for (let hx = lx - 3; hx <= lx + 3; hx++) {
          for (let hy = centerY - 3; hy <= centerY + 3; hy++) {
              for (let hz = lz - 3; hz <= lz + 3; hz++) {
                  const dx = hx - lx;
                  const dy = hy - centerY;
                  const dz = hz - lz;
                  const distSq = dx*dx + dy*dy + dz*dz;
                  
                  const edgeNoise = pseudoRandom(hx * 1.5, hz * 1.5 + hy) * 2;
                  if (distSq < radius * radius + edgeNoise) {
                      placeLeaf(hx, hy, hz, chunkData);
                  }
              }
          }
      }
  }
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
  
  return idx === -1 ? 0 : chunkData[idx];
};
