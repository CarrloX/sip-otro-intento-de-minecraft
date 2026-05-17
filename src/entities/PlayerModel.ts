import * as THREE from 'three';

export class PlayerModel {
    public group: THREE.Group;
    public head: THREE.Mesh;
    public body: THREE.Mesh;
    public rightArm: THREE.Mesh;
    public leftArm: THREE.Mesh;
    public rightLeg: THREE.Mesh;
    public leftLeg: THREE.Mesh;

    // Helper to animate the model
    public walkTime: number = 0;
    public isSlim: boolean = false;

    // Save helper variables
    private baseMaterial: THREE.MeshLambertMaterial;
    private layerMaterial: THREE.MeshLambertMaterial;

    constructor(skinTexture: THREE.Texture) {
        this.group = new THREE.Group();

        skinTexture.magFilter = THREE.NearestFilter;
        skinTexture.minFilter = THREE.NearestMipmapLinearFilter;

        // Base material MUST be opaque so that transparent holes in the base skin render as solid (usually black), avoiding gaps.
        this.baseMaterial = new THREE.MeshLambertMaterial({
            map: skinTexture,
            transparent: false,
            side: THREE.FrontSide
        });

        // Layer material supports transparency for the 3D outer layers (hat, jacket, sleeves, etc.)
        this.layerMaterial = new THREE.MeshLambertMaterial({
            map: skinTexture,
            alphaTest: 0.5,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: true
        });

        // Initial setup as classic (Steve) model
        this.buildModel();
    }

    private getRegions(X: number, Y: number, w: number, h: number, d: number) {
        return {
            top: [X + d, Y, w, d] as [number, number, number, number],
            bottom: [X + d + w, Y, w, d] as [number, number, number, number],
            right: [X, Y + d, d, h] as [number, number, number, number],
            front: [X + d, Y + d, w, h] as [number, number, number, number],
            left: [X + d + w, Y + d, d, h] as [number, number, number, number],
            back: [X + d + w + d, Y + d, w, h] as [number, number, number, number]
        };
    }

    private createPart(
        w: number, h: number, d: number, 
        baseX: number, baseY: number, 
        layerX: number, layerY: number
    ) {
        // Base Mesh
        const baseGeo = new THREE.BoxGeometry(w, h, d);
        this.setBoxUVs(baseGeo, this.getRegions(baseX, baseY, w, h, d));
        const baseMesh = new THREE.Mesh(baseGeo, this.baseMaterial);

        // Outer Layer Mesh (slightly larger)
        const expand = 0.5;
        const layerGeo = new THREE.BoxGeometry(w + expand, h + expand, d + expand);
        this.setBoxUVs(layerGeo, this.getRegions(layerX, layerY, w, h, d));
        const layerMesh = new THREE.Mesh(layerGeo, this.layerMaterial);
        
        baseMesh.add(layerMesh);
        return { baseGeo, layerGeo, baseMesh };
    }

    private buildModel() {
        const armWidth = this.isSlim ? 3 : 4;

        // -------------------------
        // HEAD (8x8x8)
        // -------------------------
        const headData = this.createPart(8, 8, 8, 0, 0, 32, 0);
        this.head = headData.baseMesh;
        headData.baseGeo.translate(0, 4, 0);
        headData.layerGeo.translate(0, 4, 0);
        this.head.position.y = 24; 
        this.group.add(this.head);

        // -------------------------
        // BODY (8x12x4)
        // -------------------------
        const bodyData = this.createPart(8, 12, 4, 16, 16, 16, 32);
        this.body = bodyData.baseMesh;
        this.body.position.y = 18; 
        this.group.add(this.body);

        // -------------------------
        // RIGHT ARM
        // -------------------------
        const rightArmData = this.createPart(armWidth, 12, 4, 40, 16, 40, 32);
        this.rightArm = rightArmData.baseMesh;
        rightArmData.baseGeo.translate(0, -4, 0); 
        rightArmData.layerGeo.translate(0, -4, 0); 
        this.rightArm.position.set(this.isSlim ? -5.5 : -6, 22, 0); 
        this.group.add(this.rightArm);

        // -------------------------
        // LEFT ARM
        // -------------------------
        const leftArmData = this.createPart(armWidth, 12, 4, 32, 48, 48, 48);
        this.leftArm = leftArmData.baseMesh;
        leftArmData.baseGeo.translate(0, -4, 0);
        leftArmData.layerGeo.translate(0, -4, 0);
        this.leftArm.position.set(this.isSlim ? 5.5 : 6, 22, 0);
        this.group.add(this.leftArm);

        // -------------------------
        // RIGHT LEG (4x12x4)
        // -------------------------
        const rightLegData = this.createPart(4, 12, 4, 0, 16, 0, 32);
        this.rightLeg = rightLegData.baseMesh;
        rightLegData.baseGeo.translate(0, -6, 0);
        rightLegData.layerGeo.translate(0, -6, 0);
        this.rightLeg.position.set(-2, 12, 0);
        this.group.add(this.rightLeg);

        // -------------------------
        // LEFT LEG (4x12x4)
        // -------------------------
        const leftLegData = this.createPart(4, 12, 4, 16, 48, 0, 48);
        this.leftLeg = leftLegData.baseMesh;
        leftLegData.baseGeo.translate(0, -6, 0);
        leftLegData.layerGeo.translate(0, -6, 0);
        this.leftLeg.position.set(2, 12, 0);
        this.group.add(this.leftLeg);

        // -------------------------
        // SCALE
        // -------------------------
        const scale = 1.8 / 32;
        this.group.scale.set(scale, scale, scale);
    }

    public setSlim(isSlim: boolean) {
        if (this.isSlim === isSlim) return;
        this.isSlim = isSlim;

        // Clean up old objects from the group
        while(this.group.children.length > 0) {
            const child = this.group.children[0] as THREE.Mesh;
            child.geometry.dispose();
            child.children.forEach(c => {
                if (c instanceof THREE.Mesh) c.geometry.dispose();
            });
            this.group.remove(child);
        }

        // Rebuild entire model with new isSlim value
        this.buildModel();
    }

    /**
     * Updates the animation of the player skeleton.
     * @param speed The walking speed (0 = idle)
     * @param delta Time delta
     */
    public updateAnimation(speed: number, delta: number) {
        if (speed > 0) {
            this.walkTime += delta * speed * 10;
            const swing = Math.sin(this.walkTime) * 0.5;

            this.rightArm.rotation.x = swing;
            this.leftArm.rotation.x = -swing;
            this.rightLeg.rotation.x = -swing;
            this.leftLeg.rotation.x = swing;

            // Subtle head bob
            this.head.rotation.y = Math.sin(this.walkTime * 0.5) * 0.1;
        } else {
            this.walkTime = 0;
            // Return to idle
            this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.1);
            this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);
            this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
            this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
            this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, 0, 0.1);
        }
    }

    private setBoxUVs(geometry: THREE.BoxGeometry, regions: Record<string, [number, number, number, number]>) {
        const uvs = new Float32Array(48); // 6 faces * 4 vertices * 2 coords

        const setFaceUV = (faceIndex: number, region: [number, number, number, number], flipHorizontal: boolean = false) => {
            const [x, y, w, h] = region;
            const texW = 64, texH = 64;

            // WebGL coordinates are bottom-left origin
            let u0 = x / texW;
            const v1 = 1 - (y / texH);
            let u1 = (x + w) / texW;
            const v0 = 1 - ((y + h) / texH);

            if (flipHorizontal) {
                const temp = u0;
                u0 = u1;
                u1 = temp;
            }

            const offset = faceIndex * 8;
            // Vertices order for BoxGeometry faces: top-left, top-right, bottom-left, bottom-right
            uvs[offset] = u0; uvs[offset + 1] = v1;
            uvs[offset + 2] = u1; uvs[offset + 3] = v1;
            uvs[offset + 4] = u0; uvs[offset + 5] = v0;
            uvs[offset + 6] = u1; uvs[offset + 7] = v0;
        };

        // Three.js BoxGeometry face order:
        // 0: Right (x+)
        // 1: Left (x-)
        // 2: Top (y+)
        // 3: Bottom (y-)
        // 4: Front (z+)
        // 5: Back (z-)

        // Map Minecraft skin regions to Three.js faces
        // Note: left/right are often mirrored in 3D engines depending on camera perspective.
        setFaceUV(0, regions.left);
        setFaceUV(1, regions.right);
        setFaceUV(2, regions.top);
        setFaceUV(3, regions.bottom);
        setFaceUV(4, regions.front);
        setFaceUV(5, regions.back);

        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
}
