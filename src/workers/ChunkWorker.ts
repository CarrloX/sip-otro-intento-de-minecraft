import { CHUNK_SIZE, generateChunk } from '../services/WorldService';

self.onmessage = (e) => {
  const { cx, cz, lodLevel, userModsArray } = e.data;
  
  const worldData = new Map<string, number>(userModsArray);
  const loadedBlocks = new Map<string, number>();

  // 1. Generate core mathematical data
  const generatedKeys = generateChunk(cx, cz, loadedBlocks, worldData);

  // 2. Perform Decimation & Face Culling
  const instances: { x: number, y: number, z: number, type: number, rx: number, ry: number, rz: number, scale: number }[] = [];
  
  const step = lodLevel === 0 ? 1 : lodLevel === 1 ? 2 : 4;
  const offset = lodLevel === 0 ? 0 : lodLevel === 1 ? 0.5 : 1.5;

  if (lodLevel === 0) {
      generatedKeys.forEach(key => {
         const type = loadedBlocks.get(key);
         if (!type) return;
         const [x, y, z] = key.split(',').map(Number);
         
         const up = loadedBlocks.has(`${x},${y+1},${z}`);
         const down = loadedBlocks.has(`${x},${y-1},${z}`);
         const left = loadedBlocks.has(`${x-1},${y},${z}`);
         const right = loadedBlocks.has(`${x+1},${y},${z}`);
         const front = loadedBlocks.has(`${x},${y},${z+1}`);
         const back = loadedBlocks.has(`${x},${y},${z-1}`);

         if (up && down && left && right && front && back) return;
         
         instances.push({ x: x, y: y, z: z, type, rx: x, ry: y, rz: z, scale: 1 });
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
         
         const up = loadedBlocks.has(`${x},${y+1},${z}`);
         const down = loadedBlocks.has(`${x},${y-1},${z}`);
         const left = loadedBlocks.has(`${x-1},${y},${z}`);
         const right = loadedBlocks.has(`${x+1},${y},${z}`);
         const front = loadedBlocks.has(`${x},${y},${z+1}`);
         const back = loadedBlocks.has(`${x},${y},${z-1}`);
         
         if (up && down && left && right && front && back) return;

         processedCells.add(cellKey);
         instances.push({ x: bx, y: by, z: bz, type, rx: bx + offset, ry: by + offset, rz: bz + offset, scale: step });
      });
  }

  // 3. Build Transferable Float32Arrays for the GPU limits
  const matrixArray = new Float32Array(instances.length * 16);
  const typeArray = new Float32Array(instances.length);

  for (let i = 0; i < instances.length; i++) {
     const inst = instances[i];
     typeArray[i] = inst.type;
     
     const mOffset = i * 16;
     matrixArray[mOffset + 0] = inst.scale;
     matrixArray[mOffset + 1] = 0;
     matrixArray[mOffset + 2] = 0;
     matrixArray[mOffset + 3] = 0;

     matrixArray[mOffset + 4] = 0;
     matrixArray[mOffset + 5] = inst.scale;
     matrixArray[mOffset + 6] = 0;
     matrixArray[mOffset + 7] = 0;

     matrixArray[mOffset + 8] = 0;
     matrixArray[mOffset + 9] = 0;
     matrixArray[mOffset + 10] = inst.scale;
     matrixArray[mOffset + 11] = 0;

     matrixArray[mOffset + 12] = inst.rx;
     matrixArray[mOffset + 13] = inst.ry;
     matrixArray[mOffset + 14] = inst.rz;
     matrixArray[mOffset + 15] = 1;
  }

  const exportedBlocks: [string, number][] = [];
  generatedKeys.forEach(k => {
      exportedBlocks.push([k, loadedBlocks.get(k) as number]);
  });
  
  const response = {
     cx, cz, lodLevel,
     generatedKeys,
     instancesCount: instances.length,
     exportedBlocks
  };
  
  // Zero-copy transfer to main thread
  self.postMessage({ response, matrixArray, typeArray }, { transfer: [matrixArray.buffer, typeArray.buffer] });
};
