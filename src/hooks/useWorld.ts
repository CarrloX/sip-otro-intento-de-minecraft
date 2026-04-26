import React, { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE, Y_MIN, Y_MAX, getBlockIndex } from '../services/WorldService';
import ChunkWorker from '../workers/ChunkWorker?worker';
import { initDB, saveBlock, loadAllBlocks } from '../services/StorageService';

export const useWorld = (
  sceneRef: React.RefObject<THREE.Scene | null>,
  materialsRef: React.RefObject<Record<number, THREE.Material | THREE.Material[]>>,
  blockGeometryRef: React.RefObject<THREE.BoxGeometry>,
  renderDistanceRef: React.RefObject<number>,
  fancyLeavesRef: React.RefObject<boolean>,
  seedRef: React.RefObject<number>,
  onWorldReady?: (chunksData: Map<string, Uint8Array>) => void
) => {
  const objectsRef = useRef<THREE.Object3D[]>([]);
  const isReadyRef = useRef(false);
  const onWorldReadyRef = useRef(onWorldReady);
  
  useEffect(() => {
    onWorldReadyRef.current = onWorldReady;
  }, [onWorldReady]); 
  
  const chunksDataRef = useRef<Map<string, Uint8Array>>(new Map()); 
  const worldDataRef = useRef<Map<string, Map<string, number>>>(new Map()); 
  
  const getChunkId = (x: number, z: number) => {
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
  };
  const loadedChunksRef = useRef<Map<string, number>>(new Map()); 
  const chunkMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const playerChunkRef = useRef({ x: Infinity, z: Infinity });
  const targetChunksRef = useRef<Map<string, number>>(new Map());
  const chunkCacheRef = useRef<Map<string, { group: THREE.Group, lodLevel: number, chunkData: Uint8Array }>>(new Map());
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
        if (sceneRef.current) {
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
           const { response, chunkData, posArray, normArray, uvArray, indArray, colorArray } = e.data;
           const taskId = response.taskId;
           const callback = workerCallbacksRef.current.get(taskId);
           if (callback) {
               callback({ response, chunkData, posArray, normArray, uvArray, indArray, colorArray });
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
  const lastFancyLeavesRef = useRef(fancyLeavesRef.current);

  const requestChunkMesh = useCallback((cx: number, cz: number, lodLevel: number = 0) => {
     const chunkId = `${cx},${cz}`;
     
     const cached = chunkCacheRef.current.get(chunkId);
     if (cached?.lodLevel === lodLevel) {
         const oldGroup = chunkMeshesRef.current.get(chunkId);
         if (oldGroup) {
            sceneRef.current?.remove(oldGroup);
            oldGroup.children.forEach(child => {
               if (child instanceof THREE.Mesh) child.geometry.dispose();
            });
         }

         sceneRef.current?.add(cached.group);
         chunkMeshesRef.current.set(chunkId, cached.group);
         chunksDataRef.current.set(chunkId, cached.chunkData);

         chunkCacheRef.current.delete(chunkId);
         updateRaycastObjects();
         return;
     }

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

     workerCallbacksRef.current.set(taskId, ({ response, chunkData, posArray, normArray, uvArray, indArray, colorArray }) => {
         if (targetChunksRef.current.get(chunkId) !== response.lodLevel) return;

         chunksDataRef.current.set(chunkId, chunkData);

         if (chunksDataRef.current.size >= 9 && !isReadyRef.current) {
             isReadyRef.current = true;
             onWorldReadyRef.current?.(chunksDataRef.current);
         }

         const unifiedMaterial = materialsRef.current?.[1];
         if (!unifiedMaterial || posArray.length === 0) return;

         const chunkGroup = new THREE.Group();
         chunkGroup.userData = { chunkId };

         const geometry = new THREE.BufferGeometry();
         geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
         geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
         geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
         geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
         geometry.setIndex(new THREE.BufferAttribute(indArray, 1));
         
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
         const lodLeft = targetChunksRef.current.get(`${cx-1},${cz}`) ?? 2;
         const lodRight = targetChunksRef.current.get(`${cx+1},${cz}`) ?? 2;
         const lodTop = targetChunksRef.current.get(`${cx},${cz-1}`) ?? 2;
         const lodBottom = targetChunksRef.current.get(`${cx},${cz+1}`) ?? 2;

         worker.postMessage({ 
            cx, cz, lodLevel, userModsArray, taskId, fancyLeaves: fancyLeavesRef.current,
            neighborLODs: { lodLeft, lodRight, lodTop, lodBottom },
            seed: seedRef.current
         });
     }
  }, [materialsRef, sceneRef, updateRaycastObjects]);

  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    
    // Bounds check
    if (ry < Y_MIN || ry > Y_MAX) return;

    const key = `${rx},${ry},${rz}`;
    const chunkId = getChunkId(rx, rz);

    let modMap = worldDataRef.current.get(chunkId);
    if (!modMap) {
        modMap = new Map();
        worldDataRef.current.set(chunkId, modMap);
    }
    modMap.set(key, type);

    const chunkData = chunksDataRef.current.get(chunkId);
    if (chunkData) {
        const lx = ((rx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((rz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const idx = getBlockIndex(lx, ry, lz);
        if (idx !== -1) chunkData[idx] = type;
    }

    if (dbRef.current) {
        saveBlock(dbRef.current, key, type).catch(console.error);
    }

    const chunkMesh = chunkMeshesRef.current.get(chunkId);
    if (chunkMesh && blockGeometryRef.current && materialsRef.current?.[1]) {
        const tempMesh = new THREE.Mesh(blockGeometryRef.current, materialsRef.current[1]);
        tempMesh.position.set(rx, ry, rz);
        chunkMesh.add(tempMesh); 
    }

    requestChunkMesh(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE), loadedChunksRef.current.get(chunkId) || 0);
  }, [requestChunkMesh, blockGeometryRef, materialsRef]);

  const removeBlockFaces = useCallback((arr: Float32Array, nArr: Float32Array, rx: number, ry: number, rz: number): boolean => {
      let modified = false;
      for (let i = 0; i < arr.length; i += 12) {
          const cx = (arr[i] + arr[i+3] + arr[i+6] + arr[i+9]) / 4;
          const cy = (arr[i+1] + arr[i+4] + arr[i+7] + arr[i+10]) / 4;
          const cz = (arr[i+2] + arr[i+5] + arr[i+8] + arr[i+11]) / 4;
          const nx = nArr[i], ny = nArr[i+1], nz = nArr[i+2];
          const bx = Math.round(cx - nx * 0.5);
          const by = Math.round(cy - ny * 0.5);
          const bz = Math.round(cz - nz * 0.5);
          if (bx === rx && by === ry && bz === rz) {
              for (let v = 0; v < 12; v++) arr[i+v] = 0; 
              modified = true;
          }
      }
      return modified;
  }, []);

  const hideBlockInMesh = useCallback((
      chunkMesh: THREE.Object3D | undefined,
      rx: number, ry: number, rz: number,
      blockGeometry: THREE.BufferGeometry | null
  ) => {
      if (!chunkMesh || !(chunkMesh.children[0] instanceof THREE.Mesh) || !blockGeometry) return;
      
      const geom = chunkMesh.children[0].geometry as THREE.BufferGeometry;
      const pos = geom.attributes.position;
      const norm = geom.attributes.normal;
      
      if (pos && norm) {
          const arr = pos.array as Float32Array;
          const nArr = norm.array as Float32Array;
          const modified = removeBlockFaces(arr, nArr, rx, ry, rz);
          if (modified) pos.needsUpdate = true;
      }
      const fakeHoleMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
      const fakeHoleMesh = new THREE.Mesh(blockGeometry, fakeHoleMat);
      fakeHoleMesh.position.set(rx, ry, rz);
      chunkMesh.add(fakeHoleMesh);
  }, [removeBlockFaces]);

  const removeBlock = useCallback((x: number, y: number, z: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    
    if (ry < Y_MIN || ry > Y_MAX) return;

    const key = `${rx},${ry},${rz}`;
    const chunkId = getChunkId(rx, rz);

    let modMap = worldDataRef.current.get(chunkId);
    if (!modMap) {
        modMap = new Map();
        worldDataRef.current.set(chunkId, modMap);
    }
    modMap.set(key, 0);

    const chunkData = chunksDataRef.current.get(chunkId);
    if (chunkData) {
        const lx = ((rx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((rz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const idx = getBlockIndex(lx, ry, lz);
        if (idx !== -1) chunkData[idx] = 0;
    }

    if (dbRef.current) {
        saveBlock(dbRef.current, key, 0).catch(console.error);
    }

    const chunkMesh = chunkMeshesRef.current.get(chunkId);
    hideBlockInMesh(chunkMesh, rx, ry, rz, blockGeometryRef.current);

    requestChunkMesh(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE), loadedChunksRef.current.get(chunkId) || 0);
  }, [requestChunkMesh, blockGeometryRef, hideBlockInMesh]);

  const unloadChunk = useCallback((cx: number, cz: number) => {
    const chunkId = `${cx},${cz}`;
    if (!loadedChunksRef.current.has(chunkId)) return;

    const group = chunkMeshesRef.current.get(chunkId);
    const chunkData = chunksDataRef.current.get(chunkId);
    
    if (group && chunkData) {
      sceneRef.current?.remove(group);
      chunkMeshesRef.current.delete(chunkId);
      const lodLevel = loadedChunksRef.current.get(chunkId) ?? 0;
      
      chunkCacheRef.current.set(chunkId, { 
          group, 
          lodLevel, 
          chunkData
      });
      
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

    chunksDataRef.current.delete(chunkId);
    loadedChunksRef.current.delete(chunkId);
    updateRaycastObjects();
  }, [sceneRef, updateRaycastObjects]);

  const getChunkLodLevel = useCallback((distance: number, cx: number, cz: number) => {
      let lodLevel: number;
      if (distance > 16) {
          lodLevel = 2;
      } else if (distance > 8) {
          lodLevel = 1;
      } else {
          lodLevel = 0;
      }
      
      const currentLod = loadedChunksRef.current.get(`${cx},${cz}`);
      if (currentLod !== undefined) {
          if (currentLod === 0 && distance === 9) lodLevel = 0;
          if (currentLod === 1 && distance === 17) lodLevel = 1;
      }
      
      return lodLevel;
  }, []);

  const updateTargetChunks = useCallback((px: number, pz: number, renderDistance: number) => {
    const newTargetChunks = new Map<string, number>();
    
    // Generate chunks in concentric rings starting from the player's center
    for (let distance = 0; distance <= renderDistance; distance++) {
      for (let dx = -distance; dx <= distance; dx++) {
        for (let dz = -distance; dz <= distance; dz++) {
          // Only add chunks that are exactly on the current ring
          if (Math.max(Math.abs(dx), Math.abs(dz)) === distance) {
            const cx = px + dx;
            const cz = pz + dz;
            const lodLevel = getChunkLodLevel(distance, cx, cz);
            newTargetChunks.set(`${cx},${cz}`, lodLevel);
          }
        }
      }
    }
    
    targetChunksRef.current = newTargetChunks;
  }, [getChunkLodLevel]);

  const processLoads = useCallback((isLodZeroPhase: boolean) => {
    for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
       if (isLodZeroPhase ? targetLod !== 0 : targetLod === 0) continue; 
       
       const currentLod = loadedChunksRef.current.get(chunkId);
       if (currentLod === undefined || currentLod !== targetLod) {
           if (loadQueue.current.some(q => `${q.ccx},${q.ccz}` === chunkId)) continue;

           loadQueue.current.push({
               ccx: Number(chunkId.split(',')[0]),
               ccz: Number(chunkId.split(',')[1]),
               targetLod
           });
           loadedChunksRef.current.set(chunkId, targetLod); 
       }
    }
  }, []);

  const flushQueue = useCallback(() => {
      let loads = 0;
      while (loadQueue.current.length > 0 && loads < MAX_LOADS_PER_FRAME) {
          const { ccx, ccz, targetLod } = loadQueue.current.shift()!;
          requestChunkMesh(ccx, ccz, targetLod);
          loads++;
      }
  }, [requestChunkMesh]);

  const manageChunks = useCallback((cameraPosition: THREE.Vector3) => {
    const RENDER_DISTANCE = renderDistanceRef.current; 
    const px = Math.floor(cameraPosition.x / CHUNK_SIZE);
    const pz = Math.floor(cameraPosition.z / CHUNK_SIZE);

    if (px !== playerChunkRef.current.x || pz !== playerChunkRef.current.z || loadedChunksRef.current.size === 0 || lastRenderDistanceRef.current !== RENDER_DISTANCE || lastFancyLeavesRef.current !== fancyLeavesRef.current) {
      if (lastFancyLeavesRef.current !== fancyLeavesRef.current) {
         chunkCacheRef.current.clear();
         for (const key of loadedChunksRef.current.keys()) {
             loadedChunksRef.current.set(key, -1);
         }
      }
      
      playerChunkRef.current = { x: px, z: pz };
      lastRenderDistanceRef.current = RENDER_DISTANCE;
      lastFancyLeavesRef.current = fancyLeavesRef.current;
      
      // Reset ready state if we completely cleared chunks
      if (loadedChunksRef.current.size === 0) {
        isReadyRef.current = false;
      }
      
      updateTargetChunks(px, pz, RENDER_DISTANCE);
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
 
  }, [requestChunkMesh, unloadChunk, updateTargetChunks, processLoads, flushQueue]);

  return React.useMemo(() => ({
    objectsRef,
    chunksDataRef,
    addBlock,
    removeBlock,
    manageChunks
  }), [addBlock, removeBlock, manageChunks]);
};
