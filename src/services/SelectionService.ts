import * as THREE from 'three';

export interface SelectionResult {
  object: THREE.Mesh;
  face: { normal: THREE.Vector3 } | null;
  point: THREE.Vector3;
}

export const createHighlighter = () => {
  const geometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
  );
  line.visible = false;
  return line;
};

export const updateSelection = (
  raycaster: THREE.Raycaster,
  camera: THREE.PerspectiveCamera,
  objects: THREE.Mesh[],
  highlighter: THREE.LineSegments
): SelectionResult | null => {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(objects, false);

  if (intersects.length > 0 && intersects[0].distance < 5) {
    const intersect = intersects[0];
    const mesh = intersect.object as THREE.Mesh;
    
    highlighter.position.copy(mesh.position);
    highlighter.visible = true;
    
    return {
      object: mesh,
      face: intersect.face ?? null,
      point: intersect.point
    };
  } else {
    highlighter.visible = false;
    return null;
  }
};
