import React, { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../services/WorldService';
import ChunkWorker from '../workers/ChunkWorker?worker';

export const useWorld = (
  sceneRef: React.RefObject<THREE.Scene | null>,
  materialsRef: React.RefObject<Record<number, THREE.Material | THREE.Material[]>>,
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

  const workersRef = useRef<Worker[]>([]);
  const workerCallbacksRef = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    if (workersRef.current.length === 0) {
      for (let i = 0; i < 4; i++) {
        const worker = new ChunkWorker();
        worker.onmessage = (e) => {
           const { response, posArray, normArray, uvArray, indArray } = e.data;
           const chunkId = `${response.cx},${response.cz}`;
           const callback = workerCallbacksRef.current.get(chunkId);
           if (callback) {
               callback({ response, posArray, normArray, uvArray, indArray });
               workerCallbacksRef.current.delete(chunkId);
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
     
     const userModsArray: [string, number][] = [];
     worldDataRef.current.forEach((val, key) => {
         const [kx, , kz] = key.split(',').map(Number);
         const mcx = Math.floor(kx / CHUNK_SIZE);
         const mcz = Math.floor(kz / CHUNK_SIZE);
         if (mcx >= cx - 1 && mcx <= cx + 1 && mcz >= cz - 1 && mcz <= cz + 1) {
            userModsArray.push([key, val]);
         }
     });

     workerCallbacksRef.current.set(chunkId, ({ response, posArray, normArray, uvArray, indArray }) => {
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
         geometry.setIndex(new THREE.BufferAttribute(indArray, 1));
         
         const chunkCenterX = response.cx * CHUNK_SIZE + (CHUNK_SIZE / 2);
         const chunkCenterZ = response.cz * CHUNK_SIZE + (CHUNK_SIZE / 2);
         geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(chunkCenterX, 128, chunkCenterZ), 140);

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
         worker.postMessage({ cx, cz, lodLevel, userModsArray });
     }
  }, [materialsRef, sceneRef, updateRaycastObjects]);


  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, type); 
    loadedBlocksRef.current.set(key, type); 

    let chunkSet = chunkBlocksRef.current.get(chunkId);
    if (!chunkSet) {
        chunkSet = new Set();
        chunkBlocksRef.current.set(chunkId, chunkSet);
    }
    chunkSet.add(key);

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

    const group = chunkMeshesRef.current.get(chunkId);
    if (group) {
      sceneRef.current?.remove(group);
      chunkMeshesRef.current.delete(chunkId);
      
      group.children.forEach(child => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
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
          const lodLevel = distance > 10 ? 2 : (distance > 4 ? 1 : 0);
          newTargetChunks.set(`${cx},${cz}`, lodLevel);
        }
      }
      targetChunksRef.current = newTargetChunks;
    };

    const processLoads = (isLodZeroPhase: boolean) => {
      for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
         if (isLodZeroPhase ? targetLod !== 0 : targetLod === 0) continue; 
         
         const currentLod = loadedChunksRef.current.get(chunkId);
         if (currentLod === undefined || currentLod !== targetLod) {
             loadedChunksRef.current.set(chunkId, targetLod); 
             const [ccx, ccz] = chunkId.split(',').map(Number);
             requestChunkMesh(ccx, ccz, targetLod);
         }
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

  }, [requestChunkMesh, unloadChunk]);

  return React.useMemo(() => ({
    objectsRef,
    loadedBlocksRef,
    addBlock,
    removeBlock,
    manageChunks
  }), [addBlock, removeBlock, manageChunks]);
};
