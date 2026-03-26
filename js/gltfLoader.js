import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import CONFIG from '../config/config.js';

export async function loadModel(scene, onProgress) {
  const loader = new GLTFLoader();

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);

  function loadTex(path) {
    return new Promise((res, rej) => {
      new THREE.TextureLoader().load(path, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.rotation = Math.PI;
        tex.center.set(0.5, 0.5);
        tex.repeat.x = -1;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        res(tex);
      }, undefined, rej);
    });
  }

  const [lightTex, darkTex] = await Promise.all([
    loadTex('./assets/textures/gltf_embedded_0.png'),
    loadTex('./assets/textures/gltf_embedded_0.jpeg'),
  ]);

  // MeshBasicMaterial with onBeforeCompile to crossfade two textures via mixT (0=light, 1=dark).
  // toneMapped:false bypasses ACES so terrain shows at exact PNG brightness.
  function makeCrossfadeMat() {
    const mat = new THREE.MeshBasicMaterial({
      map: lightTex,
      side: THREE.FrontSide,
      toneMapped: false,
    });

    const uniforms = { mapDark: { value: darkTex }, mixT: { value: 0.0 } };
    mat.userData.crossfadeUniforms = uniforms;

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = [
        'uniform sampler2D mapDark;',
        'uniform float mixT;',
        shader.fragmentShader,
      ].join('\n').replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 texelLight = texture2D( map, vMapUv );
          vec4 texelDark  = texture2D( mapDark, vMapUv );
          diffuseColor *= mix(texelLight, texelDark, mixT);
        #endif`
      );
    };

    return mat;
  }

  return new Promise((resolve, reject) => {
    loader.load(
      CONFIG.modelPath,
      (gltf) => {
        const model = gltf.scene;
        const topoTopMats = [];
        const topoSideMats = [];
        const buildingMats = [];

        if (CONFIG.rotateZUp) {
          model.rotation.x = -Math.PI / 2;
        }

        let topoNode = null;
        let minVerts = Infinity;
        model.traverse((child) => {
          if (child.isMesh) {
            const count = child.geometry.attributes.position.count;
            if (count > 10000 && count < minVerts) { // Ensure it's not some tiny stray node
              minVerts = count;
              topoNode = child;
            }
          }
        });

        function isTopoMesh(mesh) {
          let node = mesh;
          while (node) {
            if (node === topoNode) return true;
            node = node.parent;
          }
          return false;
        }

        model.traverse((child) => {
          if (child.isMesh && child.material && isTopoMesh(child)) {
            const geom = child.geometry;
            const index = geom.index;
            const posAttr = geom.attributes.position;
            const normalAttr = geom.attributes.normal;

            // Prevent premature pop-out when camera/frustum shifts during scroll.
            child.frustumCulled = false;

            if (!index || !normalAttr) {
              const mat = makeCrossfadeMat();
              child.material = mat;
              topoTopMats.push(mat);
              return;
            }

            const topIndices = [];
            const sideIndices = [];
            const triCount = index.count / 3;
            const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();

            for (let t = 0; t < triCount; t++) {
              const i0 = index.getX(t * 3);
              const i1 = index.getX(t * 3 + 1);
              const i2 = index.getX(t * 3 + 2);

              vA.set(normalAttr.getX(i0), normalAttr.getY(i0), normalAttr.getZ(i0));
              vB.set(normalAttr.getX(i1), normalAttr.getY(i1), normalAttr.getZ(i1));
              vC.set(normalAttr.getX(i2), normalAttr.getY(i2), normalAttr.getZ(i2));
              const avgY = (vA.y + vB.y + vC.y) / 3;

              if (avgY > 0.3) {
                topIndices.push(i0, i1, i2);
              } else {
                sideIndices.push(i0, i1, i2);
              }
            }

            const newIndexArray = new Uint32Array(topIndices.length + sideIndices.length);
            newIndexArray.set(topIndices, 0);
            newIndexArray.set(sideIndices, topIndices.length);
            geom.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
            geom.computeBoundingBox();
            geom.computeBoundingSphere();

            geom.clearGroups();
            geom.addGroup(0, topIndices.length, 0);
            geom.addGroup(topIndices.length, sideIndices.length, 1);

            const topMat = makeCrossfadeMat();

            const sideMat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(0x111111),
              metalness: 0,
              roughness: 1,
              side: THREE.DoubleSide,
              emissive: new THREE.Color(0x111111),
            });

            child.material = [topMat, sideMat];
            topoTopMats.push(topMat);
            topoSideMats.push(sideMat);
            console.log(`[gltfLoader] Topo split: ${topIndices.length / 3} top faces, ${sideIndices.length / 3} side faces`);
          }

          if (child.isMesh && child.material && !isTopoMesh(child)) {
            child.frustumCulled = false;
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            for (const mat of materials) {
              mat.color.set(0x4a4a4a);
              mat.side = THREE.DoubleSide;
              mat.needsUpdate = true;
              buildingMats.push(mat);
            }
          }
        });

        const topoMeshes = [];
        model.traverse((child) => {
          if (child.isMesh && isTopoMesh(child)) topoMeshes.push(child);
        });
        for (const mesh of topoMeshes) {
          const geom = mesh.geometry;
          const pos = geom.attributes.position;
          if (!pos) continue;
          geom.computeBoundingBox();
          const bb = geom.boundingBox;
          const rangeX = (bb.max.x - bb.min.x) || 1;
          const rangeZ = (bb.max.z - bb.min.z) || 1;
          const uvArray = new Float32Array(pos.count * 2);
          for (let i = 0; i < pos.count; i++) {
            uvArray[i * 2] = (pos.array[i * 3] - bb.min.x) / rangeX;
            uvArray[i * 2 + 1] = (pos.array[i * 3 + 2] - bb.min.z) / rangeZ;
          }
          geom.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
          geom.attributes.uv.needsUpdate = true;
        }
        console.log('[gltfLoader] UV projection: top(XZ), rot 180°, mirror X applied.');

        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.position.set(
          -CONFIG.originOffset.x,
          -CONFIG.originOffset.y,
          -CONFIG.originOffset.z
        );

        scene.add(wrapper);

        const B_LIGHT = new THREE.Color(0x555555);
        const B_DARK = new THREE.Color(0xcccccc);
        const S_LIGHT = new THREE.Color(0x444444);
        const S_DARK = new THREE.Color(0xeeeeee);

        const setModeProgress = (t) => {
          for (const mat of topoTopMats) {
            mat.userData.crossfadeUniforms.mixT.value = t;
          }
          for (const mat of buildingMats) {
            mat.color.lerpColors(B_LIGHT, B_DARK, t);
            mat.needsUpdate = true;
          }
          for (const mat of topoSideMats) {
            mat.color.lerpColors(S_LIGHT, S_DARK, t);
            mat.needsUpdate = true;
          }
        };

        console.log('[gltfLoader] Model loaded and offset applied.');
        resolve({ model: wrapper, setModeProgress, topoMeshes });
      },
      (progress) => {
        if (progress.total && onProgress) {
          onProgress(Math.min((progress.loaded / progress.total) * 100, 100));
        }
      },
      (err) => {
        console.error('[gltfLoader] Error loading model:', err);
        reject(err);
      }
    );
  });
}
