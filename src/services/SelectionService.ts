import * as THREE from 'three';

export interface SelectionResult {
  object: THREE.Object3D;
  instanceId?: number;
  blockPosition: THREE.Vector3;
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
  objects: THREE.Object3D[],
  highlighter: THREE.LineSegments
): SelectionResult | null => {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(objects, true); // true for recursive (check inside Groups)

  if (intersects.length > 0 && intersects[0].distance < 5) {
    const intersect = intersects[0];
    
    // Extract position whether it's a physical Mesh or an InstancedMesh
    const blockPos = new THREE.Vector3();
    if (intersect.object instanceof THREE.InstancedMesh && intersect.instanceId !== undefined) {
      const matrix = new THREE.Matrix4();
      intersect.object.getMatrixAt(intersect.instanceId, matrix);
      blockPos.setFromMatrixPosition(matrix);
    } else {
      blockPos.copy(intersect.object.position);
    }
    
    highlighter.position.copy(blockPos);
    highlighter.visible = true;
    
    return {
      object: intersect.object,
      instanceId: intersect.instanceId,
      blockPosition: blockPos,
      face: intersect.face ?? null,
      point: intersect.point
    };
  } else {
    highlighter.visible = false;
    return null;
  }
};
