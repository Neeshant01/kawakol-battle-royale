import * as THREE from 'three';
import { LIGHTING_CONFIG } from './config/mapConfig';

export class Engine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public clock: THREE.Clock;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(LIGHTING_CONFIG.fogColor);
    this.scene.fog = new THREE.Fog(LIGHTING_CONFIG.fogColor, LIGHTING_CONFIG.fogStart, LIGHTING_CONFIG.fogEnd);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 6000);
    this.camera.position.set(0, 8, 12);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    const hemisphere = new THREE.HemisphereLight(LIGHTING_CONFIG.ambient, LIGHTING_CONFIG.bounce, 1.15);
    this.scene.add(hemisphere);

    const sunLight = new THREE.DirectionalLight(LIGHTING_CONFIG.sun, 1.8);
    sunLight.position.set(-850, 1400, -480);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -700;
    sunLight.shadow.camera.right = 700;
    sunLight.shadow.camera.top = 700;
    sunLight.shadow.camera.bottom = -700;
    sunLight.shadow.camera.far = 2400;
    sunLight.shadow.bias = -0.00018;
    this.scene.add(sunLight);

    window.addEventListener('resize', this.onResize.bind(this));
  }

  public getDelta() {
    return Math.min(this.clock.getDelta(), 0.05);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  }

  public render() {
    this.renderer.render(this.scene, this.camera);
  }
}
