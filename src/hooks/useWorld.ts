import React, { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../services/WorldService';
import ChunkWorker from '../workers/ChunkWorker?worker';
import { initDB, saveBlock, loadAllBlocks } from '../services/StorageService';

export const useWorld = (
  sceneRef: React.RefObject<THREE.Scene | null>,
  materialsRef: React.RefObject<Record<number, THREE.Material | THREE.Material[]>>,
  blockGeometryRef: React.RefObject<THREE.BoxGeometry>, // Legacy, mantenido por firma
  renderDistanceRef: React.RefObject<number>
) => {
  const objectsRef = useRef<THREE.Object3D[]>([]); 
  
  const loadedBlocksRef = useRef<Map<string, number>>(new Map()); 
  const chunkBlocksRef = useRef<Map<string, Set<string>>>(new Map()); 
  const worldDataRef = useRef<Map<string, Map<string, number>>>(new Map()); 
  
  const getChunkId = (x: number, z: number) => {
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
  };
  const loadedChunksRef = useRef<Map<string, number>>(new Map()); 
  const chunkMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const playerChunkRef = useRef({ x: Infinity, z: Infinity });
  const targetChunksRef = useRef<Map<string, number>>(new Map());
  const chunkCacheRef = useRef<Map<string, { group: THREE.Group, lodLevel: number, blockKeys: Set<string>, blocks: Map<string, number> }>>(new Map());
  const MAX_CACHE_SIZE = 100;
  const loadQueue = useRef<{ccx: number, ccz: number, targetLod: number}[]>([]);
  const MAX_LOADS_PER_FRAME = 2; 

  const workersRef = useRef<Worker[]>([]);
  const workerCallbacksRef = useRef<Map<number, (data: any) => void>>(new Map());
  const nextTaskIdRef = useRef<number>(0);
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        const db = await initDB();
        dbRef.current = db;
        const savedData = await loadAllBlocks(db);
        savedData.forEach((type, key) => {
           const [x, , z] = key.split(',').map(Number);
           const cid = getChunkId(x, z);
           let modMap = worldDataRef.current.get(cid);
           if (!modMap) {
               modMap = new Map();
               worldDataRef.current.set(cid, modMap);
           }
           modMap.set(key, type);
        });
        console.log(`Loaded ${savedData.size} blocks from storage.`);
        // Initial chunk management will happen after loading
        if (sceneRef.current) {
            // Force first check
            playerChunkRef.current = { x: Infinity, z: Infinity };
        }
      } catch (err) {
        console.error("Failed to load world from storage:", err);
      }
    };
    setup();

    if (workersRef.current.length === 0) {
      for (let i = 0; i < 4; i++) {
        const worker = new ChunkWorker();
        worker.onmessage = (e) => {
           const { response, posArray, normArray, uvArray, indArray, colorArray } = e.data;
           const taskId = response.taskId;
           const callback = workerCallbacksRef.current.get(taskId);
           if (callback) {
               callback({ response, posArray, normArray, uvArray, indArray, colorArray });
               workerCallbacksRef.current.delete(taskId);
           }
        };
        workersRef.current.push(worker);
      }
    }
  }, []);

  const getAvailableWorker = () => {
    if (workersRef.current.length === 0) return null;
    const worker = workersRef.current.shift()!;
    workersRef.current.push(worker);
    return worker;
  };

  const updateRaycastObjects = useCallback(() => {
    const meshes: THREE.Object3D[] = [];
    chunkMeshesRef.current.forEach((group, chunkId) => {
      if (loadedChunksRef.current.get(chunkId) === 0) {
        meshes.push(...group.children);
      }
    });
    objectsRef.current = meshes;
  }, []);

  const lastRenderDistanceRef = useRef(renderDistanceRef.current);

  const requestChunkMesh = useCallback((cx: number, cz: number, lodLevel: number = 0) => {
     const chunkId = `${cx},${cz}`;
     
     // 1. Check Cache first
     const cached = chunkCacheRef.current.get(chunkId);
     if (cached && cached.lodLevel === lodLevel) {
         const oldGroup = chunkMeshesRef.current.get(chunkId);
         if (oldGroup) {
            sceneRef.current?.remove(oldGroup);
            oldGroup.children.forEach(child => {
               if (child instanceof THREE.Mesh) child.geometry.dispose();
            });
         }

         sceneRef.current?.add(cached.group);
         chunkMeshesRef.current.set(chunkId, cached.group);
         
         // Restore Blocks for Collisions
         chunkBlocksRef.current.set(chunkId, cached.blockKeys);
         cached.blocks.forEach((type, key) => {
             loadedBlocksRef.current.set(key, type);
         });

         chunkCacheRef.current.delete(chunkId);
         updateRaycastObjects();
         return;
     }

     // 2. Fetch only modifications for this chunk (and neighbors for trees/light)
     const userModsArray: [string, number][] = [];
     const neighbors = [[0,0], [1,0], [-1,0], [0,1], [0,-1], [1,1], [1,-1], [-1,1], [-1,-1]];
     
     neighbors.forEach(([dx, dz]) => {
         const nid = `${cx + dx},${cz + dz}`;
         const nModMap = worldDataRef.current.get(nid);
         if (nModMap) {
             nModMap.forEach((type, key) => {
                 userModsArray.push([key, type]);
             });
         }
     });

     const taskId = nextTaskIdRef.current++;

     workerCallbacksRef.current.set(taskId, ({ response, posArray, normArray, uvArray, indArray, colorArray }) => {
         // Protección crítica: Si el jugador se movió o rotó rápidamente mientras el chunk se procesaba en el worker
         // y este chunk resultante ya no se necesita, descartamos la geometría para evitar un Memory Leak inborrable
         if (targetChunksRef.current.get(chunkId) !== response.lodLevel) return;

         if (!chunkBlocksRef.current.has(chunkId)) {
             chunkBlocksRef.current.set(chunkId, new Set(response.generatedKeys));
         }
         response.exportedBlocks.forEach(([key, type]: [string, number]) => {
             if (!worldDataRef.current.has(key)) {
                loadedBlocksRef.current.set(key, type);
             }
         });

         const unifiedMaterial = materialsRef.current?.[1];
         // Si la cantidad de caras es 0 o no hay material, el chunk es invisible/aire, pero igual persiste lógicamente
         if (!unifiedMaterial || posArray.length === 0) return;

         const chunkGroup = new THREE.Group();
         chunkGroup.userData = { chunkId };

         // Custom BufferGeometry Topology
         const geometry = new THREE.BufferGeometry();
         geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
         geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
         geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
         geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
         geometry.setIndex(new THREE.BufferAttribute(indArray, 1));
         
         const chunkCenterX = response.cx * CHUNK_SIZE + (CHUNK_SIZE / 2);
         const chunkCenterZ = response.cz * CHUNK_SIZE + (CHUNK_SIZE / 2);
         geometry.computeBoundingSphere();

         const mesh = new THREE.Mesh(geometry, unifiedMaterial);

         if (response.lodLevel === 0) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
         } else {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
         }

         chunkGroup.add(mesh);

         const oldGroup = chunkMeshesRef.current.get(chunkId);
         if (oldGroup) {
            sceneRef.current?.remove(oldGroup);
            oldGroup.children.forEach(child => {
               if (child instanceof THREE.Mesh) child.geometry.dispose();
            });
         }

         chunkMeshesRef.current.set(chunkId, chunkGroup);
         sceneRef.current?.add(chunkGroup);
         updateRaycastObjects();
     });

     const worker = getAvailableWorker();
     if (worker) {
         worker.postMessage({ cx, cz, lodLevel, userModsArray, taskId });
     }
  }, [materialsRef, sceneRef, updateRaycastObjects]);


  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = getChunkId(rx, rz);

    let modMap = worldDataRef.current.get(chunkId);
    if (!modMap) {
        modMap = new Map();
        worldDataRef.current.set(chunkId, modMap);
    }
    modMap.set(key, type);

    loadedBlocksRef.current.set(key, type); 
    let chunkSet = chunkBlocksRef.current.get(chunkId);
    if (!chunkSet) {
        chunkSet = new Set();
        chunkBlocksRef.current.set(chunkId, chunkSet);
    }
    chunkSet.add(key);

    if (dbRef.current) {
        saveBlock(dbRef.current, key, type).catch(console.error);
    }

    // --- CLIENT-SIDE PREDICTION (INSTANT VISUAL FEEDBACK) ---
    // Agregamos un bloque falso temporal para que sientas que el servidor responde el 100% de las veces al instante
    const chunkMesh = chunkMeshesRef.current.get(chunkId);
    if (chunkMesh && blockGeometryRef.current && materialsRef.current?.[1]) {
        const tempMesh = new THREE.Mesh(blockGeometryRef.current, materialsRef.current[1]);
        tempMesh.position.set(rx, ry, rz);
        // Este bloque se eliminará automáticamente cuando el trabajador sobrescriba todo el chunk
        chunkMesh.add(tempMesh); 
    }

    requestChunkMesh(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE), loadedChunksRef.current.get(chunkId) || 0);
  }, [requestChunkMesh, blockGeometryRef, materialsRef]);

  const removeBlock = useCallback((x: number, y: number, z: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = getChunkId(rx, rz);

    let modMap = worldDataRef.current.get(chunkId);
    if (!modMap) {
        modMap = new Map();
        worldDataRef.current.set(chunkId, modMap);
    }
    modMap.set(key, 0);

    loadedBlocksRef.current.delete(key);
    chunkBlocksRef.current.get(chunkId)?.delete(key);

    if (dbRef.current) {
        saveBlock(dbRef.current, key, 0).catch(console.error);
    }

    // --- CLIENT-SIDE PREDICTION (INSTANT VISUAL REMOVAL) ---
    // Encontramos matemáticamente las caras exactas del bloque basándonos en su normal y las colapsamos
    const chunkMesh = chunkMeshesRef.current.get(chunkId);
    if (chunkMesh && chunkMesh.children[0] instanceof THREE.Mesh) {
       const geom = chunkMesh.children[0].geometry as THREE.BufferGeometry;
       const pos = geom.attributes.position;
       const norm = geom.attributes.normal;
       if (pos && norm) {
           const arr = pos.array as Float32Array;
           const nArr = norm.array as Float32Array;
           let modified = false;
           // Iterar por grupos de 4 vértices (1 cara = 12 floats)
           for (let i = 0; i < arr.length; i += 12) {
               // Calcular centro geométrico de la cara plana
               const cx = (arr[i] + arr[i+3] + arr[i+6] + arr[i+9]) / 4;
               const cy = (arr[i+1] + arr[i+4] + arr[i+7] + arr[i+10]) / 4;
               const cz = (arr[i+2] + arr[i+5] + arr[i+8] + arr[i+11]) / 4;
               
               // La normal de toda la cara
               const nx = nArr[i], ny = nArr[i+1], nz = nArr[i+2];
               
               // Retroceder hacia adentro de donde apunta la normal para hallar nuestro cubo
               const bx = Math.round(cx - nx * 0.5);
               const by = Math.round(cy - ny * 0.5);
               const bz = Math.round(cz - nz * 0.5);
               
               if (bx === rx && by === ry && bz === rz) {
                   for (let v = 0; v < 12; v++) arr[i+v] = 0; // Colapsar cara neta
                   modified = true;
               }
           }
           if (modified) pos.needsUpdate = true;
       }

       // --- TRUCO MATEMÁTICO: TAPAR EL HOYO AL VACÍO ---
       // Al borrar el bloque, sus vecinos aún no tienen dibujadas sus caras internas (por el Culling que ahorra Memoria).
       // Para envitar ver el Cielo por esos 100ms, instanciamos una "Caja Invertida" (BackSide). 
       // Nos permite ver el "interior" oscuro de ese espacio vacío funcionando de Parche visual perfecto.
       const fakeHoleMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
       const fakeHoleMesh = new THREE.Mesh(blockGeometryRef.current, fakeHoleMat);
       fakeHoleMesh.position.set(rx, ry, rz);
       chunkMesh.add(fakeHoleMesh);
    }

    requestChunkMesh(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE), loadedChunksRef.current.get(chunkId) || 0);
  }, [requestChunkMesh, blockGeometryRef]);

  const unloadChunk = useCallback((cx: number, cz: number) => {
    const chunkId = `${cx},${cz}`;
    if (!loadedChunksRef.current.has(chunkId)) return;

    const group = chunkMeshesRef.current.get(chunkId);
    if (group) {
      sceneRef.current?.remove(group);
      chunkMeshesRef.current.delete(chunkId);
      
      const lodLevel = loadedChunksRef.current.get(chunkId) ?? 0;
      
      // Capture blocks before they are deleted from main refs
      const blockKeys = chunkBlocksRef.current.get(chunkId);
      const blocks = new Map<string, number>();
      if (blockKeys) {
          blockKeys.forEach(k => {
              const t = loadedBlocksRef.current.get(k);
              if (t !== undefined) blocks.set(k, t);
          });
      }

      // Move to cache instead of disposing
      chunkCacheRef.current.set(chunkId, { 
          group, 
          lodLevel, 
          blockKeys: blockKeys ? new Set(blockKeys) : new Set(), 
          blocks 
      });
      
      // Limit cache size
      if (chunkCacheRef.current.size > MAX_CACHE_SIZE) {
          const firstKey = chunkCacheRef.current.keys().next().value;
          if (firstKey) {
              const old = chunkCacheRef.current.get(firstKey);
              if (old) {
                  old.group.children.forEach(child => {
                      if (child instanceof THREE.Mesh) child.geometry.dispose();
                  });
              }
              chunkCacheRef.current.delete(firstKey);
          }
      }
    }

    const keys = chunkBlocksRef.current.get(chunkId);
    if (keys) {
      keys.forEach(key => loadedBlocksRef.current.delete(key));
      chunkBlocksRef.current.delete(chunkId);
    }

    loadedChunksRef.current.delete(chunkId);
    updateRaycastObjects();
  }, [sceneRef, updateRaycastObjects]);

  const manageChunks = useCallback((cameraPosition: THREE.Vector3) => {
    const RENDER_DISTANCE = renderDistanceRef.current; 
    const px = Math.floor(cameraPosition.x / CHUNK_SIZE);
    const pz = Math.floor(cameraPosition.z / CHUNK_SIZE);

    const updateTargetChunks = () => {
      const newTargetChunks = new Map<string, number>();
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++){
        for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++){
          const cx = px + dx;
          const cz = pz + dz;
          const distance = Math.max(Math.abs(dx), Math.abs(dz));
          
          let lodLevel = distance > 10 ? 2 : (distance > 4 ? 1 : 0);
          
          // HYSTERESIS: If already loaded, keep current LOD unless distance is significant
          const currentLod = loadedChunksRef.current.get(`${cx},${cz}`);
          if (currentLod !== undefined) {
              if (currentLod === 0 && distance === 5) lodLevel = 0; // Expand LOD 0 by 1 block buffer
              if (currentLod === 1 && distance === 11) lodLevel = 1; // Expand LOD 1 by 1 block buffer
          }

          newTargetChunks.set(`${cx},${cz}`, lodLevel);
        }
      }
      targetChunksRef.current = newTargetChunks;
    };
 
    const processLoads = (isLodZeroPhase: boolean) => {
      // Pass 1: Add to queue
      for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
         if (isLodZeroPhase ? targetLod !== 0 : targetLod === 0) continue; 
         
         const currentLod = loadedChunksRef.current.get(chunkId);
         if (currentLod === undefined || currentLod !== targetLod) {
             // Avoid duplicate queuing
             if (loadQueue.current.some(q => `${q.ccx},${q.ccz}` === chunkId)) continue;

             loadQueue.current.push({
                 ccx: Number(chunkId.split(',')[0]),
                 ccz: Number(chunkId.split(',')[1]),
                 targetLod
             });
             // Mark as "loading" via currentLod check in next pass? 
             // Actually, set to targetLod now to prevent double-processing until mesh arrives
             loadedChunksRef.current.set(chunkId, targetLod); 
         }
      }
    };

    const flushQueue = () => {
        let loads = 0;
        // Sort queue by distance to player for priority? (Optional improvement)
        while (loadQueue.current.length > 0 && loads < MAX_LOADS_PER_FRAME) {
            const { ccx, ccz, targetLod } = loadQueue.current.shift()!;
            requestChunkMesh(ccx, ccz, targetLod);
            loads++;
        }
    };


    if (px !== playerChunkRef.current.x || pz !== playerChunkRef.current.z || loadedChunksRef.current.size === 0 || lastRenderDistanceRef.current !== RENDER_DISTANCE) {
      playerChunkRef.current = { x: px, z: pz };
      lastRenderDistanceRef.current = RENDER_DISTANCE;
      updateTargetChunks();
    }

    for (const chunkId of loadedChunksRef.current.keys()) {
       if (!targetChunksRef.current.has(chunkId)) {
           const [ccx, ccz] = chunkId.split(',').map(Number);
           unloadChunk(ccx, ccz);
       }
    }

    processLoads(true);
    processLoads(false);
    flushQueue();
 
  }, [requestChunkMesh, unloadChunk]);

  return React.useMemo(() => ({
    objectsRef,
    loadedBlocksRef,
    addBlock,
    removeBlock,
    manageChunks
  }), [addBlock, removeBlock, manageChunks]);
};
