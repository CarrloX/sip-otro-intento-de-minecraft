import React, { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../services/WorldService';
import ChunkWorker from '../workers/ChunkWorker?worker';

export const useWorld = (
  sceneRef: React.RefObject<THREE.Scene | null>,
  materialsRef: React.RefObject<Record<number, THREE.Material | THREE.Material[]>>,
  blockGeometryRef: React.RefObject<THREE.BoxGeometry>,
  renderDistanceRef: React.RefObject<number>
) => {
  const objectsRef = useRef<THREE.Object3D[]>([]); 
  
  const loadedBlocksRef = useRef<Map<string, number>>(new Map()); 
  const chunkBlocksRef = useRef<Map<string, Set<string>>>(new Map()); 
  const worldDataRef = useRef<Map<string, number>>(new Map()); 
  
  const loadedChunksRef = useRef<Map<string, number>>(new Map()); 
  const chunkMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const playerChunkRef = useRef({ x: Infinity, z: Infinity });
  const targetChunksRef = useRef<Map<string, number>>(new Map());

  // Web Workers Pool (Multithreading Setup)
  const workersRef = useRef<Worker[]>([]);
  const workerCallbacksRef = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    if (workersRef.current.length === 0) {
      for (let i = 0; i < 4; i++) { // Spawn 4 concurrent math slaves
        const worker = new ChunkWorker();
        worker.onmessage = (e) => {
           const { response, matrixArray, typeArray } = e.data;
           const chunkId = `${response.cx},${response.cz}`;
           const callback = workerCallbacksRef.current.get(chunkId);
           if (callback) {
               callback({ response, matrixArray, typeArray });
               workerCallbacksRef.current.delete(chunkId);
           }
        };
        workersRef.current.push(worker);
      }
    }
  }, []);

  const getAvailableWorker = () => {
    // Round-robin distribution
    if (workersRef.current.length === 0) return null; // Fallback
    const worker = workersRef.current.shift()!;
    workersRef.current.push(worker);
    return worker;
  };

  const updateRaycastObjects = useCallback(() => {
    const meshes: THREE.Object3D[] = [];
    chunkMeshesRef.current.forEach((group, chunkId) => {
      // Raycast only inside highest resolution 
      if (loadedChunksRef.current.get(chunkId) === 0) {
        meshes.push(...group.children);
      }
    });
    objectsRef.current = meshes;
  }, []);

  const lastRenderDistanceRef = useRef(renderDistanceRef.current);

  const requestChunkMesh = useCallback((cx: number, cz: number, lodLevel: number = 0) => {
     const chunkId = `${cx},${cz}`;
     
     // Recolectar modificaciones de usuario en este chunk y vecinos para inyeccion asincrona
     const userModsArray: [string, number][] = [];
     worldDataRef.current.forEach((val, key) => {
         const [kx, , kz] = key.split(',').map(Number);
         const mcx = Math.floor(kx / CHUNK_SIZE);
         const mcz = Math.floor(kz / CHUNK_SIZE);
         if (mcx >= cx - 1 && mcx <= cx + 1 && mcz >= cz - 1 && mcz <= cz + 1) {
            userModsArray.push([key, val]);
         }
     });

     // Conectar Callback al trabajador 
     workerCallbacksRef.current.set(chunkId, ({ response, matrixArray, typeArray }) => {
         // 1. Sincronizar matemáticas (Grid del jugador local)
         if (!chunkBlocksRef.current.has(chunkId)) {
             chunkBlocksRef.current.set(chunkId, new Set(response.generatedKeys));
         }
         response.exportedBlocks.forEach(([key, type]: [string, number]) => {
             if (!worldDataRef.current.has(key)) {
                loadedBlocksRef.current.set(key, type);
             }
         });

         // 2. Construir la gráfica de WebGL directamente enviando los Float Arrays
         const unifiedMaterial = materialsRef.current?.[1];
         if (!unifiedMaterial || response.instancesCount === 0) return; // Skip vacios

         const chunkGroup = new THREE.Group();
         chunkGroup.userData = { chunkId };

         const chunkCenterX = response.cx * CHUNK_SIZE + (CHUNK_SIZE / 2);
         const chunkCenterZ = response.cz * CHUNK_SIZE + (CHUNK_SIZE / 2);
         const chunkBoundingSphere = new THREE.Sphere(new THREE.Vector3(chunkCenterX, 128, chunkCenterZ), 140);

         const instancedMesh = new THREE.InstancedMesh(
             blockGeometryRef.current.clone(),
             unifiedMaterial,
             response.instancesCount
         );

         // Zero-copy set. Instantáneo en Main Thread.
         instancedMesh.instanceMatrix.array.set(matrixArray);
         instancedMesh.instanceMatrix.needsUpdate = true;
         
         const blockTypeAttribute = new THREE.InstancedBufferAttribute(typeArray, 1);
         instancedMesh.geometry.setAttribute('aBlockType', blockTypeAttribute);
         instancedMesh.boundingSphere = chunkBoundingSphere;

         if (response.lodLevel === 0) {
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
         } else {
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;
         }

         chunkGroup.add(instancedMesh);

         const oldGroup = chunkMeshesRef.current.get(chunkId);
         if (oldGroup) {
            sceneRef.current?.remove(oldGroup);
            oldGroup.children.forEach(child => {
               if (child instanceof THREE.InstancedMesh) child.geometry.dispose();
            });
         }

         chunkMeshesRef.current.set(chunkId, chunkGroup);
         sceneRef.current?.add(chunkGroup);
         updateRaycastObjects();
     });

     const worker = getAvailableWorker();
     if (worker) {
         worker.postMessage({ cx, cz, lodLevel, userModsArray });
     }
  }, [materialsRef, blockGeometryRef, sceneRef, updateRaycastObjects]);


  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, type); // For Worker memory persistence
    loadedBlocksRef.current.set(key, type); // Instant physics collision

    let chunkSet = chunkBlocksRef.current.get(chunkId);
    if (!chunkSet) {
        chunkSet = new Set();
        chunkBlocksRef.current.set(chunkId, chunkSet);
    }
    chunkSet.add(key);

    // Call off-thread rebuilt
    requestChunkMesh(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE), loadedChunksRef.current.get(chunkId) || 0);
  }, [requestChunkMesh]);

  const removeBlock = useCallback((x: number, y: number, z: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, 0); 
    loadedBlocksRef.current.delete(key);
    chunkBlocksRef.current.get(chunkId)?.delete(key);

    requestChunkMesh(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE), loadedChunksRef.current.get(chunkId) || 0);
  }, [requestChunkMesh]);

  const unloadChunk = useCallback((cx: number, cz: number) => {
    const chunkId = `${cx},${cz}`;
    if (!loadedChunksRef.current.has(chunkId)) return;

    // 1. Remove Graphics
    const group = chunkMeshesRef.current.get(chunkId);
    if (group) {
      sceneRef.current?.remove(group);
      chunkMeshesRef.current.delete(chunkId);
      
      // Strict memory management
      group.children.forEach(child => {
        if (child instanceof THREE.InstancedMesh) child.geometry.dispose();
      });
    }

    // 2. Clear from Mathematical Grid
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

    if (px !== playerChunkRef.current.x || pz !== playerChunkRef.current.z || loadedChunksRef.current.size === 0 || lastRenderDistanceRef.current !== RENDER_DISTANCE) {
      playerChunkRef.current = { x: px, z: pz };
      lastRenderDistanceRef.current = RENDER_DISTANCE;
      const newTargetChunks = new Map<string, number>();

      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++){
        for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++){
          const cx = px + dx;
          const cz = pz + dz;
          
          const distance = Math.max(Math.abs(dx), Math.abs(dz));
          let lodLevel = 0;
          if (distance > 10) lodLevel = 2; // 11+
          else if (distance > 4) lodLevel = 1; // 5-10
          
          newTargetChunks.set(`${cx},${cz}`, lodLevel);
        }
      }
      targetChunksRef.current = newTargetChunks;
    }

    let operationsRemaining = 2; // Con workers asíncronos podemos meter más órdenes por frame

    for (const chunkId of loadedChunksRef.current.keys()) {
       if (!targetChunksRef.current.has(chunkId)) {
           const [ccx, ccz] = chunkId.split(',').map(Number);
           unloadChunk(ccx, ccz);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       }
    }

    for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
       if (targetLod !== 0) continue; 
       
       const currentLod = loadedChunksRef.current.get(chunkId);
       if (currentLod === undefined || currentLod !== targetLod) {
           loadedChunksRef.current.set(chunkId, targetLod); // Indicate loading intention
           const [ccx, ccz] = chunkId.split(',').map(Number);
           requestChunkMesh(ccx, ccz, targetLod);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       }
    }

    for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
       if (targetLod === 0) continue; 
       
       const currentLod = loadedChunksRef.current.get(chunkId);
       if (currentLod === undefined || currentLod !== targetLod) {
           loadedChunksRef.current.set(chunkId, targetLod);
           const [ccx, ccz] = chunkId.split(',').map(Number);
           requestChunkMesh(ccx, ccz, targetLod);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       }
    }

  }, [requestChunkMesh, unloadChunk]);

  return React.useMemo(() => ({
    objectsRef,
    loadedBlocksRef,
    addBlock,
    removeBlock,
    manageChunks
  }), [addBlock, removeBlock, manageChunks]);
};
