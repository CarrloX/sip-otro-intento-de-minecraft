import React, { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE, generateChunk } from '../services/WorldService';

export const useWorld = (
  sceneRef: React.RefObject<THREE.Scene | null>,
  materialsRef: React.RefObject<Record<number, THREE.Material | THREE.Material[]>>,
  blockGeometryRef: React.RefObject<THREE.BoxGeometry>,
  renderDistanceRef: React.RefObject<number>
) => {
  // World State (Option 3: Data Grid + InstancedMesh)
  const objectsRef = useRef<THREE.Object3D[]>([]); // For Raycasting
  
  // Mathematical Grid & Persistence
  const loadedBlocksRef = useRef<Map<string, number>>(new Map()); // Global grid: x,y,z -> type
  const chunkBlocksRef = useRef<Map<string, Set<string>>>(new Map()); // chunkId -> Set of x,y,z keys
  const worldDataRef = useRef<Map<string, number>>(new Map()); // 0 = air, 1-5 = blocks
  
  // Visuals
  const loadedChunksRef = useRef<Map<string, number>>(new Map()); // chunkId -> lodLevel
  const chunkMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const playerChunkRef = useRef({ x: Infinity, z: Infinity });
  const targetChunksRef = useRef<Map<string, number>>(new Map()); // chunkId -> desired lodLevel

  // Update the raycaster target array
  const updateRaycastObjects = useCallback(() => {
    const meshes: THREE.Object3D[] = [];
    chunkMeshesRef.current.forEach((group, chunkId) => {
      // Solo raycast en LOD 0 (alta resolución y cercano)
      if (loadedChunksRef.current.get(chunkId) === 0) {
        meshes.push(...group.children);
      }
    });
    objectsRef.current = meshes;
  }, []);

  const lastRenderDistanceRef = useRef(renderDistanceRef.current);

  const buildChunkMesh = useCallback((chunkId: string, lodLevel: number = 0) => {
    const keys = chunkBlocksRef.current.get(chunkId);
    if (!keys) return;

    const instancesPerType: Record<number, THREE.Matrix4[]> = {};
    for (let i = 1; i <= 5; i++) instancesPerType[i] = [];

    const step = lodLevel === 0 ? 1 : lodLevel === 1 ? 2 : 4;
    const offset = lodLevel === 0 ? 0 : lodLevel === 1 ? 0.5 : 1.5;

    if (lodLevel === 0) {
      // LOD 0: Standard 1:1 Rendering with strict face culling
      keys.forEach(key => {
        const type = loadedBlocksRef.current.get(key);
        if (!type) return;

        const [x, y, z] = key.split(',').map(Number);
        
        const up = loadedBlocksRef.current.has(`${x},${y+1},${z}`);
        const down = loadedBlocksRef.current.has(`${x},${y-1},${z}`);
        const left = loadedBlocksRef.current.has(`${x-1},${y},${z}`);
        const right = loadedBlocksRef.current.has(`${x+1},${y},${z}`);
        const front = loadedBlocksRef.current.has(`${x},${y},${z+1}`);
        const back = loadedBlocksRef.current.has(`${x},${y},${z-1}`);

        // If fully surrounded, don't draw it (saves massive performance)
        if (up && down && left && right && front && back) return;

        const matrix = new THREE.Matrix4();
        matrix.setPosition(x, y, z);
        instancesPerType[type].push(matrix);
      });
    } else {
      // LOD > 0: Downsample by clustering into large cubes (e.g. 2x2x2 or 4x4x4)
      const processedCells = new Set<string>();
      
      keys.forEach(key => {
        const type = loadedBlocksRef.current.get(key);
        if (!type) return;

        const [x, y, z] = key.split(',').map(Number);
        
        // Find base coordinates of the larger cube inside the virtual 3D grid
        const bx = Math.floor(x / step) * step;
        const by = Math.floor(y / step) * step;
        const bz = Math.floor(z / step) * step;
        const cellKey = `${bx},${by},${bz}`;
        
        if (processedCells.has(cellKey)) return;
        
        // Minor optimization: rough culling to skip completely buried clusters
        const up = loadedBlocksRef.current.has(`${x},${y+1},${z}`);
        const down = loadedBlocksRef.current.has(`${x},${y-1},${z}`);
        const left = loadedBlocksRef.current.has(`${x-1},${y},${z}`);
        const right = loadedBlocksRef.current.has(`${x+1},${y},${z}`);
        const front = loadedBlocksRef.current.has(`${x},${y},${z+1}`);
        const back = loadedBlocksRef.current.has(`${x},${y},${z-1}`);
        
        if (up && down && left && right && front && back) return;
        
        processedCells.add(cellKey);
        
        const matrix = new THREE.Matrix4();
        matrix.makeScale(step, step, step);
        matrix.setPosition(bx + offset, by + offset, bz + offset);
        instancesPerType[type].push(matrix);
      });
    }

    const chunkGroup = new THREE.Group();
    chunkGroup.userData = { chunkId };

    Object.entries(instancesPerType).forEach(([typeStr, matrices]) => {
        const type = Number(typeStr);
        if (matrices.length === 0) return;

        const material = materialsRef.current[type];
        if (!material) return;

        const instancedMesh = new THREE.InstancedMesh(blockGeometryRef.current, material, matrices.length);
        
        // LOD > 0 saves drawing shadows
        if (lodLevel === 0) {
          instancedMesh.castShadow = true;
          instancedMesh.receiveShadow = true;
        } else {
          instancedMesh.castShadow = false;
          instancedMesh.receiveShadow = false;
        }
        
        for (let i = 0; i < matrices.length; i++) {
          instancedMesh.setMatrixAt(i, matrices[i]);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        if (lodLevel === 0) {
          instancedMesh.computeBoundingSphere(); // Fixes invisibility and unclickable blocks
        }
        
        chunkGroup.add(instancedMesh);
    });

    const oldGroup = chunkMeshesRef.current.get(chunkId);
    if (oldGroup) {
      sceneRef.current?.remove(oldGroup);
      // For strict memory mgmt, we should dispose old meshes, but simplified for MVP.
    }

    chunkMeshesRef.current.set(chunkId, chunkGroup);
    sceneRef.current?.add(chunkGroup);
    updateRaycastObjects();
  }, [materialsRef, blockGeometryRef, sceneRef, updateRaycastObjects]);

  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, type); // Persist
    loadedBlocksRef.current.set(key, type); // Update mathematical grid

    let chunkSet = chunkBlocksRef.current.get(chunkId);
    if (!chunkSet) {
        chunkSet = new Set();
        chunkBlocksRef.current.set(chunkId, chunkSet);
    }
    chunkSet.add(key);

    buildChunkMesh(chunkId, loadedChunksRef.current.get(chunkId) || 0);
  }, [buildChunkMesh]);

  const removeBlock = useCallback((x: number, y: number, z: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, 0); // Persist as air
    loadedBlocksRef.current.delete(key);
    chunkBlocksRef.current.get(chunkId)?.delete(key);

    buildChunkMesh(chunkId, loadedChunksRef.current.get(chunkId) || 0);
  }, [buildChunkMesh]);

  const loadChunk = useCallback((cx: number, cz: number, initialLod: number = 0) => {
    const chunkId = `${cx},${cz}`;
    if (loadedChunksRef.current.has(chunkId)) return;
    
    // Generate data
    const generatedKeys = generateChunk(cx, cz, loadedBlocksRef.current, worldDataRef.current);
    
    // Associate new blocks with this chunk exactly as they were generated, 
    // even if they spill over the mathematical boundary (like tree leaves)
    chunkBlocksRef.current.set(chunkId, new Set(generatedKeys));
    loadedChunksRef.current.set(chunkId, initialLod);

    // Build Graphics
    buildChunkMesh(chunkId, initialLod);
  }, [buildChunkMesh]);

  const unloadChunk = useCallback((cx: number, cz: number) => {
    const chunkId = `${cx},${cz}`;
    if (!loadedChunksRef.current.has(chunkId)) return;

    // 1. Remove Graphics
    const group = chunkMeshesRef.current.get(chunkId);
    if (group) {
      sceneRef.current?.remove(group);
      chunkMeshesRef.current.delete(chunkId);
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

    // 1. Target Phase: If player moved chunk boundary, rebuild target state
    if (px !== playerChunkRef.current.x || pz !== playerChunkRef.current.z || loadedChunksRef.current.size === 0 || lastRenderDistanceRef.current !== RENDER_DISTANCE) {
      playerChunkRef.current = { x: px, z: pz };
      lastRenderDistanceRef.current = RENDER_DISTANCE;
      const newTargetChunks = new Map<string, number>();

      for(let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++){
        for(let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++){
          const cx = px + dx;
          const cz = pz + dz;
          
          // Nivel de LOD basado estrictamente en el grid de la posición del jugador
          const distance = Math.max(Math.abs(dx), Math.abs(dz));
          let lodLevel = 0;
          if (distance > 10) {
             lodLevel = 2; // 11+ chunks away
          } else if (distance > 4) {
             lodLevel = 1; // 5-10 chunks away
          }

          const chunkId = `${cx},${cz}`;
          newTargetChunks.set(chunkId, lodLevel);
        }
      }
      targetChunksRef.current = newTargetChunks;
    }

    // 2. Reconcile Phase: Process max 1 heavy chunk operation per frame to completely eliminate stutters
    let operationsRemaining = 1;

    // First priority: Unload out-of-bounds chunks (fast, frees memory for incoming chunks)
    for (const chunkId of loadedChunksRef.current.keys()) {
       if (!targetChunksRef.current.has(chunkId)) {
           const [ccx, ccz] = chunkId.split(',').map(Number);
           unloadChunk(ccx, ccz);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       }
    }

    // Second priority: Load or Rebuild LOD 0 chunks (immediate surroundings)
    for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
       if (targetLod !== 0) continue; // Skip distant chunks for now
       
       const currentLod = loadedChunksRef.current.get(chunkId);
       if (currentLod === undefined) {
           const [ccx, ccz] = chunkId.split(',').map(Number);
           loadChunk(ccx, ccz, targetLod);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       } else if (currentLod !== targetLod) {
           loadedChunksRef.current.set(chunkId, targetLod);
           buildChunkMesh(chunkId, targetLod);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       }
    }

    // Third priority: Load or Rebuild distant LOD 1 & 2 chunks
    for (const [chunkId, targetLod] of targetChunksRef.current.entries()) {
       if (targetLod === 0) continue; // Already handled
       
       const currentLod = loadedChunksRef.current.get(chunkId);
       if (currentLod === undefined) {
           const [ccx, ccz] = chunkId.split(',').map(Number);
           loadChunk(ccx, ccz, targetLod);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       } else if (currentLod !== targetLod) {
           loadedChunksRef.current.set(chunkId, targetLod);
           buildChunkMesh(chunkId, targetLod);
           operationsRemaining--;
           if (operationsRemaining <= 0) return;
       }
    }

  }, [loadChunk, unloadChunk, buildChunkMesh]);

  return React.useMemo(() => ({
    objectsRef,
    loadedBlocksRef, // Expose mathematical grid to player physics
    addBlock,
    removeBlock,
    manageChunks
  }), [addBlock, removeBlock, manageChunks]);
};
