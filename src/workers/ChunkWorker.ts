import { CHUNK_SIZE, generateChunk } from '../services/WorldService';

// Atlas UV mappings
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

self.onmessage = (e) => {
  const { cx, cz, lodLevel, userModsArray } = e.data;
  
  const worldData = new Map<string, number>(userModsArray);
  const loadedBlocks = new Map<string, number>();

  // 1. Generate local grid
  const generatedKeys = generateChunk(cx, cz, loadedBlocks, worldData);

  // 2. Pre-calculate Heightmap & Global Y Bounds
  const heightMap = new Map<string, number>();
  let minY = Infinity, maxY = -Infinity;
  generatedKeys.forEach(key => {
      const [x, y, z] = key.split(',').map(Number);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const hKey = `${x},${z}`;
      const currentMax = heightMap.get(hKey) ?? -Infinity;
      if (y > currentMax) heightMap.set(hKey, y);
  });

  const isTransparent = (type: number | undefined) => {
      return type === undefined || type === 5; // Air or Leaves
  };

  const isSolid = (x: number, y: number, z: number) => {
      const type = loadedBlocks.get(`${x},${y},${z}`);
      return type !== undefined && type !== 5; 
  };

  // 3. Flood Fill Light Propagation (BFS)
  const lightMap = new Map<string, number>();
  const queue: [number, number, number, number][] = [];

  const startX = cx * CHUNK_SIZE - 2;
  const endX = startX + CHUNK_SIZE + 4;
  const startZ = cz * CHUNK_SIZE - 2;
  const endZ = startZ + CHUNK_SIZE + 4;

  for (let x = startX; x < endX; x++) {
      for (let z = startZ; z < endZ; z++) {
          const surfaceY = heightMap.get(`${x},${z}`) ?? -Infinity;
          for (let y = maxY + 2; y >= Math.max(surfaceY, minY - 2); y--) {
              const k = `${x},${y},${z}`;
              if (isTransparent(loadedBlocks.get(k))) {
                  lightMap.set(k, 15);
                  queue.push([x, y, z, 15]);
              }
          }
      }
  }

  let head = 0;
  const dirs = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
  while (head < queue.length) {
      const [x, y, z, l] = queue[head++];
      if (l <= 1) continue;
      
      for (const [dx, dy, dz] of dirs) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (ny < minY - 5 || ny > maxY + 5) continue; 
          
          const nk = `${nx},${ny},${nz}`;
          if (isTransparent(loadedBlocks.get(nk))) {
              const currentL = lightMap.get(nk) ?? 0;
              // Sun travels downwards natively
              const nextL = (dy === -1 && l === 15) ? 15 : l - 1;
              
              if (nextL > currentL) {
                  lightMap.set(nk, nextL);
                  queue.push([nx, ny, nz, nextL]);
              }
          }
      }
  }

  const getLightLevel = (x: number, y: number, z: number) => {
      return lightMap.get(`${x},${y},${z}`) ?? 3; // Minimum cave light is 3
  };

  const vertexAO = (s1: boolean, s2: boolean, c: boolean) => {
      if (s1 && s2) return 0;
      return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
  };
  
  const getAoMultiplier = (ao: number) => {
      return 0.5 + (ao / 3.0) * 0.5; // Scale from 0.5 to 1.0 multiplier
  };

  // 4. Topology Mesher (Advanced Face Culling & Ambient Occlusion)
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  
  const step = lodLevel === 0 ? 1 : lodLevel === 1 ? 2 : 4;
  const offset = lodLevel === 0 ? 0 : lodLevel === 1 ? 0.5 : 1.5;
  const h = step * 0.5;

  const pushQuadWithAO = (cx: number, cy: number, cz: number, blockType: number, face: string) => {
      const texIndex = getTexIndex(blockType, face);
      const u0 = texIndex / ATLAS_COLS, u1 = (texIndex + 1) / ATLAS_COLS;
      const v0 = 0, v1 = 1;
      const baseIndex = positions.length / 3;

      let fx = cx, fy = cy, fz = cz;
      if (face === 'top') fy++; else if (face === 'bottom') fy--;
      else if (face === 'right') fx++; else if (face === 'left') fx--;
      else if (face === 'front') fz++; else if (face === 'back') fz--;

      const light = getLightLevel(fx, fy, fz);
      const l = 0.05 + (light / 15) * 0.95; // Light modifier mapping
      let ao0=3, ao1=3, ao2=3, ao3=3;

      switch(face) {
          case 'top':
              ao0 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx-1,fy,fz+1));
              ao1 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx+1,fy,fz+1));
              ao2 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx+1,fy,fz-1));
              ao3 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx-1,fy,fz-1));
              positions.push(cx-h, cy+h, cz+h,  cx+h, cy+h, cz+h,  cx+h, cy+h, cz-h,  cx-h, cy+h, cz-h);
              normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'bottom': 
              ao0 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx-1,fy,fz-1));
              ao1 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz-1), isSolid(fx+1,fy,fz-1));
              ao2 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx+1,fy,fz+1));
              ao3 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy,fz+1), isSolid(fx-1,fy,fz+1));
              positions.push(cx-h, cy-h, cz-h,  cx+h, cy-h, cz-h,  cx+h, cy-h, cz+h,  cx-h, cy-h, cz+h);
              normals.push(0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0);
              uvs.push(u0,v1, u1,v1, u1,v0, u0,v0); // Adjusted for bottom projection
              break;
          case 'right': 
              ao0 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy-1,fz+1));
              ao1 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy-1,fz-1));
              ao2 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy+1,fz-1));
              ao3 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy+1,fz+1));
              positions.push(cx+h, cy-h, cz+h,  cx+h, cy-h, cz-h,  cx+h, cy+h, cz-h,  cx+h, cy+h, cz+h);
              normals.push(1,0,0, 1,0,0, 1,0,0, 1,0,0);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'left': 
              ao0 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy-1,fz-1));
              ao1 = vertexAO(isSolid(fx,fy-1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy-1,fz+1));
              ao2 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz+1), isSolid(fx,fy+1,fz+1));
              ao3 = vertexAO(isSolid(fx,fy+1,fz), isSolid(fx,fy,fz-1), isSolid(fx,fy+1,fz-1));
              positions.push(cx-h, cy-h, cz-h,  cx-h, cy-h, cz+h,  cx-h, cy+h, cz+h,  cx-h, cy+h, cz-h);
              normals.push(-1,0,0, -1,0,0, -1,0,0, -1,0,0);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'front':  
              ao0 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx-1,fy-1,fz));
              ao1 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx+1,fy-1,fz));
              ao2 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx+1,fy+1,fz));
              ao3 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx-1,fy+1,fz));
              positions.push(cx-h, cy-h, cz+h,  cx+h, cy-h, cz+h,  cx+h, cy+h, cz+h,  cx-h, cy+h, cz+h);
              normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);
              uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'back':   
              ao0 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx+1,fy-1,fz));
              ao1 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy-1,fz), isSolid(fx-1,fy-1,fz));
              ao2 = vertexAO(isSolid(fx-1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx-1,fy+1,fz));
              ao3 = vertexAO(isSolid(fx+1,fy,fz), isSolid(fx,fy+1,fz), isSolid(fx+1,fy+1,fz));
              positions.push(cx+h, cy-h, cz-h,  cx-h, cy-h, cz-h,  cx-h, cy+h, cz-h,  cx+h, cy+h, cz-h);
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
      generatedKeys.forEach(key => {
         const type = loadedBlocks.get(key);
         if (!type) return;
         const [x, y, z] = key.split(',').map(Number);
         
         const isMeLeaf = type === 5;
         
         if (isTransparent(loadedBlocks.get(`${x},${y+1},${z}`)) && !(isMeLeaf && loadedBlocks.get(`${x},${y+1},${z}`)===5)) pushQuadWithAO(x, y, z, type, 'top');
         if (isTransparent(loadedBlocks.get(`${x},${y-1},${z}`)) && !(isMeLeaf && loadedBlocks.get(`${x},${y-1},${z}`)===5)) pushQuadWithAO(x, y, z, type, 'bottom');
         if (isTransparent(loadedBlocks.get(`${x-1},${y},${z}`)) && !(isMeLeaf && loadedBlocks.get(`${x-1},${y},${z}`)===5)) pushQuadWithAO(x, y, z, type, 'left');
         if (isTransparent(loadedBlocks.get(`${x+1},${y},${z}`)) && !(isMeLeaf && loadedBlocks.get(`${x+1},${y},${z}`)===5)) pushQuadWithAO(x, y, z, type, 'right');
         if (isTransparent(loadedBlocks.get(`${x},${y},${z+1}`)) && !(isMeLeaf && loadedBlocks.get(`${x},${y},${z+1}`)===5)) pushQuadWithAO(x, y, z, type, 'front');
         if (isTransparent(loadedBlocks.get(`${x},${y},${z-1}`)) && !(isMeLeaf && loadedBlocks.get(`${x},${y},${z-1}`)===5)) pushQuadWithAO(x, y, z, type, 'back');
      });
  } else {
      const processedCells = new Set<string>();
      generatedKeys.forEach(key => {
         const type = loadedBlocks.get(key);
         if (!type) return;
         const [x, y, z] = key.split(',').map(Number);
         
         const bx = Math.floor(x / step) * step;
         const by = Math.floor(y / step) * step;
         const bz = Math.floor(z / step) * step;
         const cellKey = `${bx},${by},${bz}`;
         
         if (processedCells.has(cellKey)) return;
         processedCells.add(cellKey);
         
         const px = bx + offset;
         const py = by + offset;
         const pz = bz + offset;
         
         if (isTransparent(loadedBlocks.get(`${x},${y+step},${z}`))) pushQuadWithAO(px, py, pz, type, 'top');
         if (isTransparent(loadedBlocks.get(`${x},${y-step},${z}`))) pushQuadWithAO(px, py, pz, type, 'bottom');
         if (isTransparent(loadedBlocks.get(`${x-step},${y},${z}`))) pushQuadWithAO(px, py, pz, type, 'left');
         if (isTransparent(loadedBlocks.get(`${x+step},${y},${z}`))) pushQuadWithAO(px, py, pz, type, 'right');
         if (isTransparent(loadedBlocks.get(`${x},${y},${z+step}`))) pushQuadWithAO(px, py, pz, type, 'front');
         if (isTransparent(loadedBlocks.get(`${x},${y},${z-step}`))) pushQuadWithAO(px, py, pz, type, 'back');
      });
  }

  // 5. Compact Arrays for Zero-Copy Transfer
  const posArray = new Float32Array(positions);
  const normArray = new Float32Array(normals);
  const uvArray = new Float32Array(uvs);
  const indArray = new Uint32Array(indices);
  const colorArray = new Float32Array(colors);

  const exportedBlocks: [string, number][] = [];
  generatedKeys.forEach(k => {
      exportedBlocks.push([k, loadedBlocks.get(k) as number]);
  });
  
  const response = {
     cx, cz, lodLevel,
     generatedKeys,
     exportedBlocks
  };
  
  self.postMessage({ response, posArray, normArray, uvArray, indArray, colorArray }, { transfer: [posArray.buffer, normArray.buffer, uvArray.buffer, indArray.buffer, colorArray.buffer] });
};
