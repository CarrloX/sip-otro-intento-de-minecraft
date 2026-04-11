import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createMaterials } from '../services/TextureService';
import { setupLighting } from '../services/LightingService';
import { createHighlighter, updateSelection } from '../services/SelectionService';
import type { SelectionResult } from '../services/SelectionService';
import { usePlayer } from './usePlayer';
import { useInteraction } from './useInteraction';
import { useWorld } from './useWorld';

export const useMinecraft = (currentBlockType: number, targetFps: number = 144) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(performance.now());
  
  const currentBlockTypeRef = useRef(currentBlockType);
  const targetFpsRef = useRef(targetFps);

  useEffect(() => {
    currentBlockTypeRef.current = currentBlockType;
  }, [currentBlockType]);

  useEffect(() => {
    targetFpsRef.current = targetFps;
  }, [targetFps]);
  
  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const hoveredBlockRef = useRef<SelectionResult | null>(null);
  
  // Shared Configuration
  const materialsRef = useRef<Record<number, THREE.Material | THREE.Material[]>>({});
  const blockGeometryRef = useRef(new THREE.BoxGeometry(1, 1, 1));
  const prevTime = useRef(performance.now());
  const lastRenderTime = useRef(performance.now());

  // Initialize World Hook (Manages Chunks and Blocks)
  const world = useWorld(sceneRef, materialsRef, blockGeometryRef);

  // Initialize Custom Hooks with World Data
  const player = usePlayer(world.loadedBlocksRef);
  
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
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // 1. Init Scene & Lighting
    const scene = new THREE.Scene();
    setupLighting(scene);
    sceneRef.current = scene;

    // 2. Init Camera
    const camera = new THREE.PerspectiveCamera(75, globalThis.innerWidth / globalThis.innerHeight, 0.1, 100);
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
        hoveredBlockRef.current = updateSelection(
          raycasterRef.current,
          camera,
          world.objectsRef.current,
          highlighter
        );
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
  }, [interaction, player, world]);

  return { mountRef, isLocked, lockControls, fps };
};
