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
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
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

export const createCloudMaterial = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64; 
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
     const imgData = ctx.createImageData(64, 64);
     const d = imgData.data;
     // Generate noise grids for seamless wrapping fractal value noise
     const grid16 = Array.from({length: 4 * 4}, () => Math.random());
     const grid8 =  Array.from({length: 8 * 8}, () => Math.random());
     const grid4 =  Array.from({length: 16 * 16}, () => Math.random());

     for (let x = 0; x < 64; x++) {
         for (let y = 0; y < 64; y++) {
             // Sample the noise layers (Nearest neighbor for blockiness)
             const v16 = grid16[Math.floor(x / 16) + Math.floor(y / 16) * 4];
             const v8  = grid8[Math.floor(x / 8) + Math.floor(y / 8) * 8];
             const v4  = grid4[Math.floor(x / 4) + Math.floor(y / 4) * 16];
             
             // Blend layers
             const noise = (v16 * 1.0 + v8 * 0.5 + v4 * 0.25) / 1.75;
             
             const i = (x + y * 64) * 4;
             // Cutoff threshold to create isolated islands and fluffy clusters
             if (noise > 0.55) {
                 d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 230; // Solid white
             } else {
                 d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 0;   // Transparent sky
             }
         }
     }
     ctx.putImageData(imgData, 0, 0);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  // The sky plane is 2048x2048. The texture is 64x64.
  // Repeating 32 times makes 1 texture pixel = 1 world unit (block)
  texture.repeat.set(32, 32);
  texture.generateMipmaps = false;
  
  const material = new THREE.MeshBasicMaterial({
     map: texture,
     transparent: true,
     alphaTest: 0.1,
     depthWrite: false, // Clouds shouldn't interfere with chunk Z-buffer deeply
     fog: true, // Clouds should fade in fog!
     side: THREE.DoubleSide
  });
  return material;
};
