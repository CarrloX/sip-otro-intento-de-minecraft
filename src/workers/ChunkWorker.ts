import { generateChunk } from '../services/WorldService';

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

const pushQuad = (
  positions: number[], normals: number[], uvs: number[], indices: number[],
  cx: number, cy: number, cz: number, h: number,
  face: string, blockType: number
) => {
  const texIndex = getTexIndex(blockType, face);
  const u0 = texIndex / ATLAS_COLS;
  const u1 = (texIndex + 1) / ATLAS_COLS;
  const v0 = 0;
  const v1 = 1;

  const baseIndex = positions.length / 3;

  switch(face) {
    case 'front':  // +Z
      positions.push(
        cx-h, cy-h, cz+h,  cx+h, cy-h, cz+h,  cx+h, cy+h, cz+h,  cx-h, cy+h, cz+h
      );
      normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);
      break;
    case 'back':   // -Z
      positions.push(
        cx+h, cy-h, cz-h,  cx-h, cy-h, cz-h,  cx-h, cy+h, cz-h,  cx+h, cy+h, cz-h
      );
      normals.push(0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1);
      break;
    case 'top':    // +Y
      positions.push(
        cx-h, cy+h, cz+h,  cx+h, cy+h, cz+h,  cx+h, cy+h, cz-h,  cx-h, cy+h, cz-h
      );
      normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
      break;
    case 'bottom': // -Y
      positions.push(
        cx-h, cy-h, cz-h,  cx+h, cy-h, cz-h,  cx+h, cy-h, cz+h,  cx-h, cy-h, cz+h
      );
      normals.push(0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0);
      break;
    case 'right':  // +X
      positions.push(
        cx+h, cy-h, cz+h,  cx+h, cy-h, cz-h,  cx+h, cy+h, cz-h,  cx+h, cy+h, cz+h
      );
      normals.push(1,0,0, 1,0,0, 1,0,0, 1,0,0);
      break;
    case 'left':   // -X
      positions.push(
        cx-h, cy-h, cz-h,  cx-h, cy-h, cz+h,  cx-h, cy+h, cz+h,  cx-h, cy+h, cz-h
      );
      normals.push(-1,0,0, -1,0,0, -1,0,0, -1,0,0);
      break;
  }

  uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
  indices.push(
    baseIndex + 0, baseIndex + 1, baseIndex + 2,
    baseIndex + 0, baseIndex + 2, baseIndex + 3
  );
};

self.onmessage = (e) => {
  const { cx, cz, lodLevel, userModsArray } = e.data;
  
  const worldData = new Map<string, number>(userModsArray);
  const loadedBlocks = new Map<string, number>();

  // 1. Generate local grid
  const generatedKeys = generateChunk(cx, cz, loadedBlocks, worldData);

  // 2. Topology Mesher (Advanced Face Culling)
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const step = lodLevel === 0 ? 1 : lodLevel === 1 ? 2 : 4;
  const offset = lodLevel === 0 ? 0 : lodLevel === 1 ? 0.5 : 1.5;
  const h = step * 0.5;

  // Simple neighbor check
  // Si da a aire o a Hojas (ID 5), dibujar la cara!
  const isTransparent = (type: number | undefined, meType: number) => {
      if (!type) return true; // Aire
      if (type === 5 && meType !== 5) return true; // Si veo hojas y no soy hojas, dibujar mi cara
      return false; // Bloque solido
  };

  if (lodLevel === 0) {
      generatedKeys.forEach(key => {
         const type = loadedBlocks.get(key);
         if (!type) return;
         const [x, y, z] = key.split(',').map(Number);
         
         if (isTransparent(loadedBlocks.get(`${x},${y+1},${z}`), type)) pushQuad(positions, normals, uvs, indices, x, y, z, h, 'top', type);
         if (isTransparent(loadedBlocks.get(`${x},${y-1},${z}`), type)) pushQuad(positions, normals, uvs, indices, x, y, z, h, 'bottom', type);
         if (isTransparent(loadedBlocks.get(`${x-1},${y},${z}`), type)) pushQuad(positions, normals, uvs, indices, x, y, z, h, 'left', type);
         if (isTransparent(loadedBlocks.get(`${x+1},${y},${z}`), type)) pushQuad(positions, normals, uvs, indices, x, y, z, h, 'right', type);
         if (isTransparent(loadedBlocks.get(`${x},${y},${z+1}`), type)) pushQuad(positions, normals, uvs, indices, x, y, z, h, 'front', type);
         if (isTransparent(loadedBlocks.get(`${x},${y},${z-1}`), type)) pushQuad(positions, normals, uvs, indices, x, y, z, h, 'back', type);
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

         // Para LOD simplemente chequeamos los bordes amplios del bloque gigante
         if (isTransparent(loadedBlocks.get(`${x},${y+step},${z}`), type)) pushQuad(positions, normals, uvs, indices, px, py, pz, h, 'top', type);
         if (isTransparent(loadedBlocks.get(`${x},${y-step},${z}`), type)) pushQuad(positions, normals, uvs, indices, px, py, pz, h, 'bottom', type);
         if (isTransparent(loadedBlocks.get(`${x-step},${y},${z}`), type)) pushQuad(positions, normals, uvs, indices, px, py, pz, h, 'left', type);
         if (isTransparent(loadedBlocks.get(`${x+step},${y},${z}`), type)) pushQuad(positions, normals, uvs, indices, px, py, pz, h, 'right', type);
         if (isTransparent(loadedBlocks.get(`${x},${y},${z+step}`), type)) pushQuad(positions, normals, uvs, indices, px, py, pz, h, 'front', type);
         if (isTransparent(loadedBlocks.get(`${x},${y},${z-step}`), type)) pushQuad(positions, normals, uvs, indices, px, py, pz, h, 'back', type);
      });
  }

  // 3. Compact Arrays for Zero-Copy Transfer
  const posArray = new Float32Array(positions);
  const normArray = new Float32Array(normals);
  const uvArray = new Float32Array(uvs);
  const indArray = new Uint32Array(indices);

  const exportedBlocks: [string, number][] = [];
  generatedKeys.forEach(k => {
      exportedBlocks.push([k, loadedBlocks.get(k) as number]);
  });
  
  const response = {
     cx, cz, lodLevel,
     generatedKeys,
     exportedBlocks
  };
  
  self.postMessage({ response, posArray, normArray, uvArray, indArray }, { transfer: [posArray.buffer, normArray.buffer, uvArray.buffer, indArray.buffer] });
};
