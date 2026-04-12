import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createMaterials } from '../services/TextureService';
import { setupLighting, updateFog, updateLighting } from '../services/LightingService';
import { createHighlighter, updateSelection } from '../services/SelectionService';
import type { SelectionResult } from '../services/SelectionService';
import { usePlayer } from './usePlayer';
import { useInteraction } from './useInteraction';
import { useWorld } from './useWorld';

export const useMinecraft = (currentBlockType: number, targetFps: number = 144, renderDistance: number = 2, autoJump: boolean = true) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef<number>(0);
  
  const currentBlockTypeRef = useRef(currentBlockType);
  const targetFpsRef = useRef(targetFps);

  useEffect(() => {
    currentBlockTypeRef.current = currentBlockType;
  }, [currentBlockType]);

  useEffect(() => {
    targetFpsRef.current = targetFps;
  }, [targetFps]);
  
  const renderDistanceRef = useRef(renderDistance);
  useEffect(() => {
    renderDistanceRef.current = renderDistance;
    if (sceneRef.current) {
      updateFog(sceneRef.current, renderDistance);
    }
    if (cameraRef.current) {
      const CHUNK_SIZE = 16;
      cameraRef.current.far = Math.max(100, renderDistance * CHUNK_SIZE * 2);
      cameraRef.current.updateProjectionMatrix();
    }
  }, [renderDistance]);
  
  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const hoveredBlockRef = useRef<SelectionResult | null>(null);
  
  // Shared Configuration
  const materialsRef = useRef<Record<number, THREE.Material | THREE.Material[]>>({});
  const blockGeometryRef = useRef(new THREE.BoxGeometry(1, 1, 1));
  const prevTime = useRef<number>(0);
  const lastRenderTime = useRef<number>(0);

  // Initialize World Hook (Manages Chunks and Blocks)
  const world = useWorld(sceneRef, materialsRef, blockGeometryRef, renderDistanceRef);

  const autoJumpRef = useRef(autoJump);
  useEffect(() => {
    autoJumpRef.current = autoJump;
  }, [autoJump]);

  // Initialize Custom Hooks with World Data
  const player = usePlayer(world.loadedBlocksRef, autoJumpRef);
  
  const interaction = useInteraction(
    world.objectsRef,
    cameraRef,
    controlsRef,
    world.addBlock,
    world.removeBlock,
    currentBlockTypeRef,
    hoveredBlockRef
  );

  const lockControls = () => {
    controlsRef.current?.lock();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/immutability
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // 1. Init Scene & Lighting
    const scene = new THREE.Scene();
    const lightingSystem = setupLighting(scene, renderDistanceRef.current);
    sceneRef.current = scene;
    let worldTime = Math.PI / 4; // Start at Morning (+0.78 rad)
    const TIME_SPEED = 0.005; // Velocidad del ciclo de día (aprox. 20 min por ciclo)

    // 2. Init Camera
    const initialFar = Math.max(100, renderDistanceRef.current * 16 * 2);
    const camera = new THREE.PerspectiveCamera(75, globalThis.innerWidth / globalThis.innerHeight, 0.1, initialFar);
    camera.position.y = 30;
    cameraRef.current = camera;

    // 3. Init Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(globalThis.devicePixelRatio);
    renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    renderer.shadowMap.enabled = true;
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Init Controls
    const controls = new PointerLockControls(camera, document.body);
    scene.add(controls.object);
    controlsRef.current = controls;

    const onLock = () => setIsLocked(true);
    const onUnlock = () => setIsLocked(false);
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);

    // 5. Shared Resources
    materialsRef.current = createMaterials();

    // 6. Highlighter & Interactions
    const highlighter = createHighlighter();
    scene.add(highlighter);

    const handleMouseDown = (e: MouseEvent) => interaction.handleMouseDown(e);
    document.addEventListener('mousedown', handleMouseDown);

    // Initialize timing references once on mount
    lastFpsUpdate.current = performance.now();
    prevTime.current = performance.now();
    lastRenderTime.current = performance.now();

    // 7. Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = performance.now();
      
      // FPS Capping Logic
      const interval = 1000 / targetFpsRef.current;
      const elapsed = time - lastRenderTime.current;
      
      if (elapsed < interval) return;
      
      // Update lastRenderTime to the start of this frame (with drift compensation)
      lastRenderTime.current = time - (elapsed % interval);

      const delta = Math.min((time - prevTime.current) / 1000, 0.1);

      // FPS Tracking (For UI display)
      frameCount.current++;
      if (time - lastFpsUpdate.current > 1000) {
        setFps(Math.round((frameCount.current * 1000) / (time - lastFpsUpdate.current)));
        frameCount.current = 0;
        lastFpsUpdate.current = time;
      }

      if (controls.isLocked) {
        // Delegate updates to specialized hooks
        player.update(delta, camera, controls);
        world.manageChunks(camera.position);
        
        worldTime += delta * TIME_SPEED;
        updateLighting(scene, lightingSystem, worldTime, camera.position, renderDistanceRef.current);

        hoveredBlockRef.current = updateSelection(
          camera,
          world.loadedBlocksRef.current,
          highlighter
        );

        // Standard FOV = 75, Sprinting FOV = 85
        const targetFov = player.isSprinting.current ? 85 : 75;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov += (targetFov - camera.fov) * delta * 8;
          camera.updateProjectionMatrix();
        }
      } else {
        highlighter.visible = false;
        hoveredBlockRef.current = null;
      }
      
      prevTime.current = time;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = globalThis.innerWidth / globalThis.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    };
    globalThis.addEventListener('resize', onResize);

    // 8. Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      globalThis.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', handleMouseDown);
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      renderer.dispose();
      renderer.domElement.remove();
      world.loadedBlocksRef.current.clear();
      world.objectsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mountRef, isLocked, lockControls, fps };
};
