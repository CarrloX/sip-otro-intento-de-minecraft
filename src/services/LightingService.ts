import * as THREE from 'three';

export const updateFog = (scene: THREE.Scene, renderDistance: number) => {
  const CHUNK_SIZE = 16;
  // fogNear: Where the fog starts (closer = more aggressive/claustrophobic)
  // fogFar: Where everything becomes solid color (should be within rendered radius)
  const fogNear = renderDistance * CHUNK_SIZE * 0.4;
  const fogFar = renderDistance * CHUNK_SIZE * 1.0;
  
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = Math.max(10, fogNear);
    scene.fog.far = Math.max(32, fogFar);
  } else {
    scene.fog = new THREE.Fog(0x87CEEB, Math.max(10, fogNear), Math.max(32, fogFar));
  }
};

export const setupLighting = (scene: THREE.Scene, initialRenderDistance: number = 2) => {
  // Background and Fog (Atmosphere)
  scene.background = new THREE.Color(0x87CEEB);
  updateFog(scene, initialRenderDistance);

  // Ambient/Hemisphere Light
  const ambientLight = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
  ambientLight.position.set(0.5, 1, 0.75);
  scene.add(ambientLight);

  // Directional Light (Sun)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  
  // Shadow Configuration
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  
  scene.add(directionalLight);

  return { ambientLight, directionalLight };
};
