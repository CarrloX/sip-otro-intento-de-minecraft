import { CHUNK_SIZE, Y_MIN, Y_MAX, CHUNK_VOLUME, getBlockIndex, noise, pseudoRandom, getTerrainType } from '../services/WorldService';

const ATLAS_COLS = 6;
const getTexIndex = (blockType: number, face: string): number => {
  if (blockType === 1) { // Grass
    if (face === 'top') return 1;
    if (face === 'bottom') return 0;
    return 0; // Sides
  }
  if (blockType === 2) return 0; // Dirt
  if (blockType === 3) return 2; // Stone
  if (blockType === 4) { // Wood
    if (face === 'top' || face === 'bottom') return 4;
    return 3;
  }
  if (blockType === 5) return 5; // Leaves
  return 0;
};

export const PAD = 15;
export const STRIDE = CHUNK_SIZE + PAD * 2;
export const PADDED_VOLUME = STRIDE * STRIDE * (Y_MAX - Y_MIN + 1);

const getPaddedIndex = (lx: number, y: number, lz: number) => {
    const px = lx + PAD;
    const pz = lz + PAD;
    const py = y - Y_MIN;
    if (px < 0 || px >= STRIDE || pz < 0 || pz >= STRIDE || py < 0 || py >= (Y_MAX - Y_MIN + 1)) return -1;
    return px + (pz * STRIDE) + (py * STRIDE * STRIDE);
};

self.onmessage = (e) => {
  const { cx, cz, lodLevel, userModsArray, taskId } = e.data;
  const worldData = new Map<string, number>(userModsArray);

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // 1. Generate Padded Terrain
  const paddedChunkData = new Uint8Array(PADDED_VOLUME);
  
  for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
    for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
      const gx = startX + lx;
      const gz = startZ + lz;
      const surfaceY = noise(gx, gz);
      
      const depth = 64; 
      for (let y = surfaceY; y >= surfaceY - depth; y--) {
        const idx = getPaddedIndex(lx, y, lz);
        if (idx !== -1) {
            paddedChunkData[idx] = getTerrainType(y, surfaceY);
        }
      }
    }
  }

  // 1.5 Padded Trees overlapping
  const TREE_OVERLAP = 2;
  for (let lx = -PAD - TREE_OVERLAP; lx < CHUNK_SIZE + PAD + TREE_OVERLAP; lx++) {
    for (let lz = -PAD - TREE_OVERLAP; lz < CHUNK_SIZE + PAD + TREE_OVERLAP; lz++) {
      const gx = startX + lx;
      const gz = startZ + lz;
      
      if (pseudoRandom(gx, gz) < 0.02) {
        const surfaceY = noise(gx, gz);
        const y = surfaceY + 1;
        
        // Wood
        const height = 4;
        for (let i = 0; i < height; i++) {
            const idx = getPaddedIndex(lx, y + i, lz);
            if (idx !== -1) paddedChunkData[idx] = 4;
        }
        
        // Leaves
        for (let hx = lx - 2; hx <= lx + 2; hx++) {
            for (let hz = lz - 2; hz <= lz + 2; hz++) {
                for (let hy = y + height - 2; hy <= y + height + 1; hy++) {
                    const dist = Math.abs(hx - lx) + Math.abs(hz - lz);
                    if (dist === 4 && hy === y + height + 1) continue;
                    const idx = getPaddedIndex(hx, hy, hz);
                    if (idx !== -1 && (paddedChunkData[idx] === 0 || paddedChunkData[idx] === 5)) {
                        paddedChunkData[idx] = 5;
                    }
                }
            }
        }
      }
    }
  }

  // 2. Apply User Mods (They include neighbors!)
  worldData.forEach((type, key) => {
    const [gx, gy, gz] = key.split(',').map(Number);
    const lx = gx - startX;
    const lz = gz - startZ;
    const idx = getPaddedIndex(lx, gy, lz);
    
    if (idx !== -1) {
      if (type === 0) {
          paddedChunkData[idx] = 0; 
      } else {
          paddedChunkData[idx] = type;
      }
    }
  });

  // 2.5 Extract Core Chunk Data (16x16) for Main Thread Memory Storage
  const chunkData = new Uint8Array(CHUNK_VOLUME);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = Y_MIN; y <= Y_MAX; y++) {
              const pIdx = getPaddedIndex(lx, y, lz);
              const cIdx = getBlockIndex(lx, y, lz);
              chunkData[cIdx] = paddedChunkData[pIdx];
          }
      }
  }

  // Abstraction functions using PADDED buffer
  const getBlock = (lx: number, y: number, lz: number) => {
    const idx = getPaddedIndex(lx, y, lz);
    return idx !== -1 ? paddedChunkData[idx] : 0;
  };

  const isTransparent = (type: number) => {
      return type === 0 || type === 5;
  };

  const isSolid = (lx: number, y: number, lz: number) => {
      const type = getBlock(lx, y, lz);
      return type !== 0 && type !== 5; 
  };

  // 3. Pre-calculate Padded Heightmap
  const heightMap = new Int16Array(STRIDE * STRIDE);
  heightMap.fill(Y_MIN - 1);
  for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
      for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
          const px = lx + PAD;
          const pz = lz + PAD;
          for (let y = Y_MAX; y >= Y_MIN; y--) {
              if (getBlock(lx, y, lz) !== 0) {
                  heightMap[px + pz * STRIDE] = y;
                  break;
              }
          }
      }
  }

  // 4. Fast Flood Fill Light Propagation over Padded Bounds
  const lightMap = new Uint8Array(PADDED_VOLUME);
  const queue: number[] = [];

  for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
      for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
          const px = lx + PAD;
          const pz = lz + PAD;
          const surfaceY = heightMap[px + pz * STRIDE];
          for (let y = Y_MAX; y >= Math.max(Y_MIN, surfaceY - 2); y--) {
              const idx = getPaddedIndex(lx, y, lz);
              if (idx !== -1 && isTransparent(paddedChunkData[idx])) {
                  lightMap[idx] = 15;
                  queue.push(lx, y, lz, 15);
              }
          }
      }
  }

  let head = 0;
  const dirs = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
  while (head < queue.length) {
      const lx = queue[head++];
      const y = queue[head++];
      const lz = queue[head++];
      const l = queue[head++];
      if (l <= 1) continue;
      
      for (const [dx, dy, dz] of dirs) {
          const nx = lx + dx, ny = y + dy, nz = lz + dz;
          const nIdx = getPaddedIndex(nx, ny, nz);
          if (nIdx !== -1 && isTransparent(paddedChunkData[nIdx])) {
              const currentL = lightMap[nIdx];
              const nextL = (dy === -1 && l === 15) ? 15 : l - 1;
              if (nextL > currentL) {
                  lightMap[nIdx] = nextL;
                  queue.push(nx, ny, nz, nextL);
              }
          }
      }
  }

  const getLightLevel = (lx: number, y: number, lz: number) => {
      const idx = getPaddedIndex(lx, y, lz);
      return idx !== -1 ? (lightMap[idx] || 3) : 3;
  };

  const vertexAO = (s1: boolean, s2: boolean, c: boolean) => {
      if (s1 && s2) return 0;
      return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
  };
  
  const getAoMultiplier = (ao: number) => {
      return 0.5 + (ao / 3.0) * 0.5;
  };

  // 5. Topology Mesher
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  
  const step = lodLevel === 0 ? 1 : lodLevel === 1 ? 2 : 4;
  const offset = lodLevel === 0 ? 0 : lodLevel === 1 ? 0.5 : 1.5;
  const h = step * 0.5;

  const pushQuadWithAO = (lx: number, y: number, lz: number, gx: number, gz: number, blockType: number, face: string) => {
      const texIndex = getTexIndex(blockType, face);
      const u0 = texIndex / ATLAS_COLS, u1 = (texIndex + 1) / ATLAS_COLS;
      const v0 = 0, v1 = 1;
      const baseIndex = positions.length / 3;

      let fx = lx, fy = y, fz = lz;
      if (face === 'top') fy++; else if (face === 'bottom') fy--;
      else if (face === 'right') fx++; else if (face === 'left') fx--;
      else if (face === 'front') fz++; else if (face === 'back') fz--;

      const light = getLightLevel(fx, fy, fz);
      const l = 0.05 + (light / 15) * 0.95;
      let ao0=3, ao1=3, ao2=3, ao3=3;

      switch(face) {
          case 'top':
              ao0 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx-1,fy,fz+1));
              ao1 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx+1,fy,fz+1));
              ao2 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx+1,fy,fz-1));
              ao3 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx-1,fy,fz-1));
              positions.push(gx-h, y+h, gz+h,  gx+h, y+h, gz+h,  gx+h, y+h, gz-h,  gx-h, y+h, gz-h);
              normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'bottom': 
              ao0 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx-1,fy,fz-1));
              ao1 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx+1,fy,fz-1));
              ao2 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx+1,fy,fz+1));
              ao3 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx-1,fy,fz+1));
              positions.push(gx-h, y-h, gz-h,  gx+h, y-h, gz-h,  gx+h, y-h, gz+h,  gx-h, y-h, gz+h);
              normals.push(0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0);
              uvs.push(u0,v1, u1,v1, u1,v0, u0,v0); 
              break;
          case 'right': 
              ao0 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy-1,fz+1));
              ao1 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy-1,fz-1));
              ao2 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy+1,fz-1));
              ao3 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy+1,fz+1));
              positions.push(gx+h, y-h, gz+h,  gx+h, y-h, gz-h,  gx+h, y+h, gz-h,  gx+h, y+h, gz+h);
              normals.push(1,0,0, 1,0,0, 1,0,0, 1,0,0);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'left': 
              ao0 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy-1,fz-1));
              ao1 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy-1,fz+1));
              ao2 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy+1,fz+1));
              ao3 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy+1,fz-1));
              positions.push(gx-h, y-h, gz-h,  gx-h, y-h, gz+h,  gx-h, y+h, gz+h,  gx-h, y+h, gz-h);
              normals.push(-1,0,0, -1,0,0, -1,0,0, -1,0,0);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'front':  
              ao0 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx-1,fy-1,fz));
              ao1 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx+1,fy-1,fz));
              ao2 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx+1,fy+1,fz));
              ao3 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx-1,fy+1,fz));
              positions.push(gx-h, y-h, gz+h,  gx+h, y-h, gz+h,  gx+h, y+h, gz+h,  gx-h, y+h, gz+h);
              normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'back':   
              ao0 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx+1,fy-1,fz));
              ao1 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx-1,fy-1,fz));
              ao2 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx-1,fy+1,fz));
              ao3 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx+1,fy+1,fz));
              positions.push(gx+h, y-h, gz-h,  gx-h, y-h, gz-h,  gx-h, y+h, gz-h,  gx+h, y+h, gz-h);
              normals.push(0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
      }

      const m0 = l * getAoMultiplier(ao0);
      const m1 = l * getAoMultiplier(ao1);
      const m2 = l * getAoMultiplier(ao2);
      const m3 = l * getAoMultiplier(ao3);

      colors.push(m0, m0, m0,  m1, m1, m1,  m2, m2, m2,  m3, m3, m3);

      indices.push(
          baseIndex + 0, baseIndex + 1, baseIndex + 2,
          baseIndex + 0, baseIndex + 2, baseIndex + 3
      );
  };


  if (lodLevel === 0) {
      for(let lx = 0; lx < CHUNK_SIZE; lx++) {
         for(let lz = 0; lz < CHUNK_SIZE; lz++) {
            for(let y = Y_MAX; y >= Y_MIN; y--) {
               const type = getBlock(lx, y, lz);
               if (type === 0) continue;
               
               const gx = cx * CHUNK_SIZE + lx;
               const gz = cz * CHUNK_SIZE + lz;
               const isMeLeaf = type === 5;
               
               if (isTransparent(getBlock(lx,y+1,lz)) && !(isMeLeaf && getBlock(lx,y+1,lz)===5)) pushQuadWithAO(lx, y, lz, gx, gz, type, 'top');
               if (isTransparent(getBlock(lx,y-1,lz)) && !(isMeLeaf && getBlock(lx,y-1,lz)===5)) pushQuadWithAO(lx, y, lz, gx, gz, type, 'bottom');
               if (isTransparent(getBlock(lx-1,y,lz)) && !(isMeLeaf && getBlock(lx-1,y,lz)===5)) pushQuadWithAO(lx, y, lz, gx, gz, type, 'left');
               if (isTransparent(getBlock(lx+1,y,lz)) && !(isMeLeaf && getBlock(lx+1,y,lz)===5)) pushQuadWithAO(lx, y, lz, gx, gz, type, 'right');
               if (isTransparent(getBlock(lx,y,lz+1)) && !(isMeLeaf && getBlock(lx,y,lz+1)===5)) pushQuadWithAO(lx, y, lz, gx, gz, type, 'front');
               if (isTransparent(getBlock(lx,y,lz-1)) && !(isMeLeaf && getBlock(lx,y,lz-1)===5)) pushQuadWithAO(lx, y, lz, gx, gz, type, 'back');
            }
         }
      }
  } else {
      for(let lx = 0; lx < CHUNK_SIZE; lx+=step) {
         for(let lz = 0; lz < CHUNK_SIZE; lz+=step) {
            for(let y = Y_MAX; y >= Y_MIN; y-=step) {
               const type = getBlock(lx, y, lz);
               if (type === 0) continue;
               
               const px = cx * CHUNK_SIZE + lx + offset;
               const py = y + offset;
               const pz = cz * CHUNK_SIZE + lz + offset;
               
               if (isTransparent(getBlock(lx,y+step,lz))) pushQuadWithAO(lx, py, lz, px, pz, type, 'top');
               if (isTransparent(getBlock(lx,y-step,lz))) pushQuadWithAO(lx, py, lz, px, pz, type, 'bottom');
               if (isTransparent(getBlock(lx-step,y,lz))) pushQuadWithAO(lx, py, lz, px, pz, type, 'left');
               if (isTransparent(getBlock(lx+step,y,lz))) pushQuadWithAO(lx, py, lz, px, pz, type, 'right');
               if (isTransparent(getBlock(lx,y,lz+step))) pushQuadWithAO(lx, py, lz, px, pz, type, 'front');
               if (isTransparent(getBlock(lx,y,lz-step))) pushQuadWithAO(lx, py, lz, px, pz, type, 'back');
            }
         }
      }
  }

  // 6. Compact Arrays for Zero-Copy Transfer
  const posArray = new Float32Array(positions);
  const normArray = new Float32Array(normals);
  const uvArray = new Float32Array(uvs);
  const indArray = new Uint32Array(indices);
  const colorArray = new Float32Array(colors);
  
  const response = {
     cx, cz, lodLevel,
     taskId
  };
  
  self.postMessage({ response, chunkData, posArray, normArray, uvArray, indArray, colorArray }, 
                   { transfer: [chunkData.buffer, posArray.buffer, normArray.buffer, uvArray.buffer, indArray.buffer, colorArray.buffer] });
};
