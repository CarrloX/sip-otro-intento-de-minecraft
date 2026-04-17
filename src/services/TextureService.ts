import * as THREE from 'three';

export const generateAtlas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 96; // 6 textures * 16px
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get 2D context');

  const types = ['dirt', 'grass_top', 'stone', 'wood_side', 'wood_top', 'leaves'];
  
  types.forEach((type, index) => {
    const imageData = context.createImageData(16, 16);
    const data = imageData.data;
    
    let r_base = 0, g_base = 0, b_base = 0, variance = 0;
    if (type === 'grass_top') { r_base = 65; g_base = 152; b_base = 49; variance = 15; }
    else if (type === 'dirt') { r_base = 121; g_base = 85; b_base = 58; variance = 10; }
    else if (type === 'stone') { r_base = 128; g_base = 128; b_base = 128; variance = 20; }
    else if (type === 'wood_side') { r_base = 106; g_base = 75; b_base = 53; variance = 10; }
    else if (type === 'wood_top') { r_base = 160; g_base = 130; b_base = 90; variance = 5; }
    else if (type === 'leaves') { r_base = 59; g_base = 122; b_base = 45; variance = 20; }

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * variance;
      let modR = r_base + noise, modG = g_base + noise, modB = b_base + noise;
      
      let alpha = 255;
      if (type === 'wood_side' && (i / 4) % 16 % 4 === 0) {
        modR -= 15; modG -= 15; modB -= 15;
      }
      if (type === 'leaves') {
          if (Math.random() < 0.3) {
              alpha = 0; // Hole in the leaf
          } else if (Math.random() < 0.2) {
              modR *= 0.5; modG *= 0.5; modB *= 0.5;
          }
      }

      data[i] = Math.min(255, Math.max(0, modR));
      data[i + 1] = Math.min(255, Math.max(0, modG));
      data[i + 2] = Math.min(255, Math.max(0, modB));
      data[i + 3] = alpha;
    }
    
    context.putImageData(imageData, index * 16, 0);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const createUnifiedMaterial = () => {
  const atlasTexture = generateAtlas();
  
  // Al usar Geometria Voxel pura con UVs explícitas, ya no necesitamos hackear shaders de GPU
  const material = new THREE.MeshLambertMaterial({ 
     map: atlasTexture,
     vertexColors: true, // Enable per-vertex tinting for light levels
     alphaTest: 0.5, // Enables cutout transparency for Fancy Leaves without depth-sorting bugs
     transparent: false // Key: keep this false so Z-Buffer depth writes natively!
  });

  return material;
};

// Return Record with all IDs pointing to isolated material for backwards compatibility in GameCanvas
export const createMaterials = () => {
  const unifiedMaterial = createUnifiedMaterial();
  const materials: Record<number, THREE.Material | THREE.Material[]> = {};
  materials[1] = unifiedMaterial;
  materials[2] = unifiedMaterial;
  materials[3] = unifiedMaterial;
  materials[4] = unifiedMaterial;
  materials[5] = unifiedMaterial;
  return materials;
};
