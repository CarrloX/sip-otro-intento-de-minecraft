import * as THREE from 'three';

export interface LightingSystem {
  ambientLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  sunMesh: THREE.Mesh;
  moonLight: THREE.DirectionalLight;
  moonMesh: THREE.Mesh;
}

const colorKeyframes = [
  { angle: 0, color: new THREE.Color(0xffd59e) }, // Sunrise
  { angle: Math.PI / 4, color: new THREE.Color(0x87ceeb) }, // Morning
  { angle: Math.PI / 2, color: new THREE.Color(0x87ceeb) }, // Noon
  { angle: (3 * Math.PI) / 4, color: new THREE.Color(0x87ceeb) }, // Afternoon
  { angle: Math.PI, color: new THREE.Color(0xfd5e53) }, // Sunset
  { angle: (5 * Math.PI) / 4, color: new THREE.Color(0x050510) }, // Evening
  { angle: (3 * Math.PI) / 2, color: new THREE.Color(0x020205) }, // Midnight
  { angle: (7 * Math.PI) / 4, color: new THREE.Color(0x050510) }, // Late Night
  { angle: 2 * Math.PI, color: new THREE.Color(0xffd59e) } // Wrap Sunrise
];

const getSkyColor = (theta: number) => {
  let normalizedTheta = theta % (2 * Math.PI);
  if (normalizedTheta < 0) normalizedTheta += 2 * Math.PI;

  for (let i = 0; i < colorKeyframes.length - 1; i++) {
    const k1 = colorKeyframes[i];
    const k2 = colorKeyframes[i + 1];
    if (normalizedTheta >= k1.angle && normalizedTheta <= k2.angle) {
      const t = (normalizedTheta - k1.angle) / (k2.angle - k1.angle);
      return k1.color.clone().lerp(k2.color, t);
    }
  }
  return colorKeyframes[0].color.clone();
};

export const updateFog = (scene: THREE.Scene, renderDistance: number) => {
  const CHUNK_SIZE = 16;
  const fogNear = renderDistance * CHUNK_SIZE * 0.4;
  const fogFar = renderDistance * CHUNK_SIZE * 1;
  
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = Math.max(10, fogNear);
    scene.fog.far = Math.max(32, fogFar);
  } else {
    scene.fog = new THREE.Fog(0x87CEEB, Math.max(10, fogNear), Math.max(32, fogFar));
  }
};

export const setupLighting = (scene: THREE.Scene, initialRenderDistance: number = 2): LightingSystem => {
  scene.background = new THREE.Color(0x87ceeb);
  updateFog(scene, initialRenderDistance);

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x555566, 0.6);
  ambientLight.position.set(0, 1, 0);
  scene.add(ambientLight);

  // === Sun ===
  const sunLight = new THREE.DirectionalLight(0xffffee, 1.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048; 
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 400; // Extend shadow render distance
  
  const shadowCamSize = 64; // High span to cover the playing area
  sunLight.shadow.camera.left = -shadowCamSize;
  sunLight.shadow.camera.right = shadowCamSize;
  sunLight.shadow.camera.top = shadowCamSize;
  sunLight.shadow.camera.bottom = -shadowCamSize;
  sunLight.shadow.bias = -0.0005; 
  scene.add(sunLight);
  scene.add(sunLight.target); 

  const sunGeo = new THREE.BoxGeometry(10, 10, 10);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee, fog: false });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);

  // === Moon ===
  const moonLight = new THREE.DirectionalLight(0xaaaaee, 0.2); 
  moonLight.castShadow = false; // Disable moon shadows to save GPU
  scene.add(moonLight);
  scene.add(moonLight.target);

  const moonGeo = new THREE.BoxGeometry(8, 8, 8);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xaaaaee, fog: false });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonMesh);

  return { ambientLight, sunLight, sunMesh, moonLight, moonMesh };
};

export const updateLighting = (
  scene: THREE.Scene,
  system: LightingSystem,
  time: number,
  playerPosition: THREE.Vector3,
  renderDistance: number
) => {
  const CHUNK_SIZE = 16;
  const orbitRadius = renderDistance * CHUNK_SIZE * 0.9; 

  const sunX = Math.cos(time) * orbitRadius;
  const sunY = Math.sin(time) * orbitRadius;
  
  system.sunLight.position.set(playerPosition.x + sunX, playerPosition.y + sunY, playerPosition.z);
  system.sunLight.target.position.copy(playerPosition);
  system.sunMesh.position.copy(system.sunLight.position);
  system.sunMesh.lookAt(playerPosition);

  const moonX = Math.cos(time + Math.PI) * orbitRadius;
  const moonY = Math.sin(time + Math.PI) * orbitRadius;
  
  system.moonLight.position.set(playerPosition.x + moonX, playerPosition.y + moonY, playerPosition.z);
  system.moonLight.target.position.copy(playerPosition);
  system.moonMesh.position.copy(system.moonLight.position);
  system.moonMesh.lookAt(playerPosition);

  const skyColor = getSkyColor(time);
  scene.background = skyColor;
  if (scene.fog) {
      scene.fog.color = skyColor;
  }
  
  const isDay = Math.sin(time) > 0;
  system.sunLight.intensity = isDay ? Math.min(1.2, Math.sin(time) * 1.5) : 0;
  system.moonLight.intensity = !isDay ? Math.min(0.2, Math.abs(Math.sin(time)) * 0.3) : 0;
  
  const minAmbient = 0.05;
  const maxAmbient = 0.6;
  system.ambientLight.intensity = isDay 
      ? minAmbient + (maxAmbient - minAmbient) * Math.sin(time)
      : minAmbient;

  system.sunLight.shadow.camera.updateProjectionMatrix();
};
