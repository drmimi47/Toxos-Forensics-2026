/**
 * gltfLoader.js – Loads a .glb/.gltf model and applies an origin offset
 * so the large metre-scale coordinates sit near (0, 0, 0).
 *
 * Rhino's glTF exporter already handles Z-up → Y-up and feet → metres,
 * so we do NOT apply any rotation here.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import CONFIG from '../config/config.js';

/**
 * Load the GLB model into the scene.
 * @param {THREE.Scene} scene
 * @param {function} [onProgress] – called with percentage (0-100)
 * @returns {Promise<THREE.Group>} the loaded model group
 */
export async function loadModel(scene, onProgress) {
  const loader = new GLTFLoader();

  // Optional Draco decoder for compressed meshes (CDN fallback)
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);

  return new Promise((resolve, reject) => {
    loader.load(
      CONFIG.modelPath,
      (gltf) => {
        const model = gltf.scene;

        // Optionally rotate if exporter did NOT handle Z-up → Y-up
        if (CONFIG.rotateZUp) {
          model.rotation.x = -Math.PI / 2;
        }

        // Wrap in a group and shift by -offset so model centres near origin
        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.position.set(
          -CONFIG.originOffset.x,
          -CONFIG.originOffset.y,
          -CONFIG.originOffset.z
        );

        scene.add(wrapper);

        console.log('[gltfLoader] Model loaded and offset applied.');
        resolve(wrapper);
      },
      (progress) => {
        if (progress.total && onProgress) {
          onProgress((progress.loaded / progress.total) * 100);
        }
      },
      (err) => {
        console.error('[gltfLoader] Error loading model:', err);
        reject(err);
      }
    );
  });
}
