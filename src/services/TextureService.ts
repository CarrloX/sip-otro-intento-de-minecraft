import * as THREE from 'three';

export const generateTexture = (width: number, height: number, type: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const imageData = context.createImageData(width, height);
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
    
    if (type === 'wood_side' && (i / 4) % width % 4 === 0) {
      modR -= 15; modG -= 15; modB -= 15;
    }
    if (type === 'leaves' && Math.random() < 0.2) {
      modR *= 0.5; modG *= 0.5; modB *= 0.5;
    }

    data[i] = Math.min(255, Math.max(0, modR));
    data[i + 1] = Math.min(255, Math.max(0, modG));
    data[i + 2] = Math.min(255, Math.max(0, modB));
    data[i + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const createMaterials = () => {
  const texGrassTop = generateTexture(16, 16, 'grass_top');
  const texDirt = generateTexture(16, 16, 'dirt');
  const texStone = generateTexture(16, 16, 'stone');
  const texWoodSide = generateTexture(16, 16, 'wood_side');
  const texWoodTop = generateTexture(16, 16, 'wood_top');
  const texLeaves = generateTexture(16, 16, 'leaves');

  const materials: Record<number, THREE.Material | THREE.Material[]> = {};

  materials[1] = [
    new THREE.MeshLambertMaterial({ map: texDirt }),
    new THREE.MeshLambertMaterial({ map: texDirt }),
    new THREE.MeshLambertMaterial({ map: texGrassTop }),
    new THREE.MeshLambertMaterial({ map: texDirt }),
    new THREE.MeshLambertMaterial({ map: texDirt }),
    new THREE.MeshLambertMaterial({ map: texDirt })
  ];
  materials[2] = new THREE.MeshLambertMaterial({ map: texDirt });
  materials[3] = new THREE.MeshLambertMaterial({ map: texStone });
  materials[4] = [
    new THREE.MeshLambertMaterial({ map: texWoodSide }),
    new THREE.MeshLambertMaterial({ map: texWoodSide }),
    new THREE.MeshLambertMaterial({ map: texWoodTop }),
    new THREE.MeshLambertMaterial({ map: texWoodTop }),
    new THREE.MeshLambertMaterial({ map: texWoodSide }),
    new THREE.MeshLambertMaterial({ map: texWoodSide })
  ];
  materials[5] = new THREE.MeshLambertMaterial({ map: texLeaves });

  return materials;
};
