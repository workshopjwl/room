import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("roomCanvas");
const labelLayer = document.getElementById("labelLayer");
const miniMapCanvas = document.getElementById("miniMap");

const btnView3d = document.getElementById("btnView3d");
const btnViewIso = document.getElementById("btnViewIso");
const btnViewTop = document.getElementById("btnViewTop");
const btnFront = document.getElementById("btnFront");
const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");
const btnToggleDims = document.getElementById("btnToggleDims");
const orientationText = document.getElementById("orientationText");

const ROOM_WIDTH = 8;
const ROOM_LENGTH = 10;
const ROOM_HEIGHT = 3;

const rooms = [
  { id: "living",  name: "Living",  x: -2.0, z: -2.0, width: 4.0, length: 5.0, color: 0xe8f0ff },
  { id: "kitchen", name: "Kitchen", x:  2.0, z: -2.0, width: 4.0, length: 5.0, color: 0xfff0db },
  { id: "bedroom", name: "Bedroom", x: -2.0, z:  2.5, width: 4.0, length: 5.0, color: 0xf3e8ff },
  { id: "bath",    name: "Bath",    x:  2.0, z:  2.5, width: 4.0, length: 5.0, color: 0xe6fffb },
];

const dimensionLabels = [];
const focusMarkers = [];
const roomMeshes = [];
const roomFloorMeshes = [];

let dimensionsVisible = true;
let activeView = "3d";
let activeFocusedRoomId = "";
let currentAnimation = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const perspectiveCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const aspect = window.innerWidth / window.innerHeight;
const orthoFrustum = 8;
const orthographicCamera = new THREE.OrthographicCamera(
  -orthoFrustum * aspect,
  orthoFrustum * aspect,
  orthoFrustum,
  -orthoFrustum,
  0.1,
  1000
);

let activeCamera = perspectiveCamera;

perspectiveCamera.position.set(11, 7, 11);
orthographicCamera.position.set(10, 10, 10);

const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.target.set(0, 1.2, 0);
controls.minDistance = 3;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI / 2.02;

const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(8, 12, 6);
scene.add(dirLight);

const grid = new THREE.GridHelper(ROOM_WIDTH + 4, ROOM_WIDTH + 4, 0x444444, 0x2f2f2f);
grid.position.y = 0.001;
scene.add(grid);

buildRoomShell();
buildRooms();
buildSampleFurniture();
createDimensionLabels();
syncDimensionVisibility();
drawMiniMap();

setMainView("3d");
render();

window.addEventListener("resize", onResize);
miniMapCanvas.addEventListener("click", onMiniMapClick);

btnView3d.addEventListener("click", () => setMainView("3d"));
btnViewIso.addEventListener("click", () => setMainView("iso"));
btnViewTop.addEventListener("click", () => setMainView("top"));
btnFront.addEventListener("click", () => snapSideView("front"));
btnLeft.addEventListener("click", () => snapSideView("left"));
btnRight.addEventListener("click", () => snapSideView("right"));
btnToggleDims.addEventListener("click", toggleDimensions);

function buildRoomShell() {
  const floorGeo = new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_LENGTH);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.95,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    side: THREE.DoubleSide,
  });

  const wallThickness = 0.08;

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, wallThickness),
    wallMaterial
  );
  backWall.position.set(0, ROOM_HEIGHT / 2, -ROOM_LENGTH / 2);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, ROOM_HEIGHT, ROOM_LENGTH),
    wallMaterial
  );
  leftWall.position.set(-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, ROOM_HEIGHT, ROOM_LENGTH),
    wallMaterial
  );
  rightWall.position.set(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0);
  scene.add(rightWall);

  const frontWallGroup = new THREE.Group();

  const frontWallLeft = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, ROOM_HEIGHT, wallThickness),
    wallMaterial
  );
  frontWallLeft.position.set(-2.85, ROOM_HEIGHT / 2, ROOM_LENGTH / 2);
  frontWallGroup.add(frontWallLeft);

  const frontWallRight = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, ROOM_HEIGHT, wallThickness),
    wallMaterial
  );
  frontWallRight.position.set(2.65, ROOM_HEIGHT / 2, ROOM_LENGTH / 2);
  frontWallGroup.add(frontWallRight);

  const doorHeader = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, wallThickness),
    wallMaterial
  );
  doorHeader.position.set(0, ROOM_HEIGHT - 0.3, ROOM_LENGTH / 2);
  frontWallGroup.add(doorHeader);

  scene.add(frontWallGroup);

  const doorFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, 2.4, 0.02)),
    new THREE.LineBasicMaterial({ color: 0x333333 })
  );
  doorFrame.position.set(0, 1.2, ROOM_LENGTH / 2 - 0.03);
  scene.add(doorFrame);
}

function buildRooms() {
  rooms.forEach((room) => {
    const floorGeo = new THREE.PlaneGeometry(room.width, room.length);
    const floorMat = new THREE.MeshBasicMaterial({
      color: room.color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });

    const roomFloor = new THREE.Mesh(floorGeo, floorMat);
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.set(room.x, 0.01, room.z);
    roomFloor.userData.roomId = room.id;
    roomFloor.userData.roomName = room.name;
    scene.add(roomFloor);
    roomFloorMeshes.push(roomFloor);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width, 0.04, room.length)),
      new THREE.LineBasicMaterial({ color: 0x555555 })
    );
    edges.position.set(room.x, 0.03, room.z);
    scene.add(edges);
    roomMeshes.push(edges);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7a00 })
    );
    marker.position.set(room.x, 0.08, room.z);
    marker.visible = false;
    scene.add(marker);
    focusMarkers.push({ id: room.id, mesh: marker });
  });
}

function buildSampleFurniture() {
  const sofa = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.75, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x4f6fd8 })
  );
  sofa.position.set(-2.0, 0.375, -2.5);
  scene.add(sofa);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.7, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x9c6b3f })
  );
  table.position.set(-1.3, 0.35, -0.8);
  scene.add(table);

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.55, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xb48cd6 })
  );
  bed.position.set(-2.0, 0.275, 2.5);
  scene.add(bed);

  const kitchenBlock = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.9, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xc7b59b })
  );
  kitchenBlock.position.set(2.1, 0.45, -2.6);
  scene.add(kitchenBlock);
}

function createDimensionLabels() {
  addDimensionLabel("8.0m", new THREE.Vector3(0, 1.2, -ROOM_LENGTH / 2 - 0.15));
  addDimensionLabel("10.0m", new THREE.Vector3(-ROOM_WIDTH / 2 - 0.15, 1.2, 0));
  addDimensionLabel("3.0m H", new THREE.Vector3(ROOM_WIDTH / 2 + 0.15, ROOM_HEIGHT / 2, 0));
  addDimensionLabel("Door 1.8m", new THREE.Vector3(0, 2.55, ROOM_LENGTH / 2 - 0.05));
}

function addDimensionLabel(text, worldPosition) {
  const el = document.createElement("div");
  el.className = "dim-label";
  el.textContent = text;
  labelLayer.appendChild(el);

  dimensionLabels.push({
    element: el,
    position: worldPosition.clone(),
  });
}

function syncDimensionVisibility() {
  dimensionLabels.forEach((item) => {
    item.element.style.display = dimensionsVisible ? "block" : "none";
  });

  btnToggleDims.textContent = dimensionsVisible ? "Dims ON" : "Dims OFF";
  btnToggleDims.classList.toggle("active", dimensionsVisible);
}

function toggleDimensions() {
  dimensionsVisible = !dimensionsVisible;
  syncDimensionVisibility();
}

function setMainView(view) {
  activeView = view;

  btnView3d.classList.toggle("active", view === "3d");
  btnViewIso.classList.toggle("active", view === "iso");
  btnViewTop.classList.toggle("active", view === "top");

  if (view === "3d") {
    switchToPerspective();
    animateCameraTo(
      new THREE.Vector3(11, 7, 11),
      new THREE.Vector3(0, 1.2, 0),
      "3D"
    );
    return;
  }

  switchToOrtho();

  if (view === "iso") {
    animateCameraTo(
      new THREE.Vector3(10, 10, 10),
      new THREE.Vector3(0, 0, 0),
      "ISO"
    );
    return;
  }

  if (view === "top") {
    animateCameraTo(
      new THREE.Vector3(0, 14, 0.001),
      new THREE.Vector3(0, 0, 0),
      "TOP"
    );
  }
}

function snapSideView(side) {
  switchToOrtho();

  if (side === "front") {
    animateCameraTo(
      new THREE.Vector3(0, 1.6, 14),
      new THREE.Vector3(0, 1.4, 0),
      "Front"
    );
    return;
  }

  if (side === "left") {
    animateCameraTo(
      new THREE.Vector3(-14, 1.6, 0),
      new THREE.Vector3(0, 1.4, 0),
      "Left"
    );
    return;
  }

  if (side === "right") {
    animateCameraTo(
      new THREE.Vector3(14, 1.6, 0),
      new THREE.Vector3(0, 1.4, 0),
      "Right"
    );
    return;
  }
}

function switchToPerspective() {
  if (activeCamera === perspectiveCamera) return;

  const oldPos = activeCamera.position.clone();
  const oldTarget = controls.target.clone();

  activeCamera = perspectiveCamera;
  perspectiveCamera.position.copy(oldPos);

  controls.object = activeCamera;
  controls.target.copy(oldTarget);
  controls.update();

  onResize();
}

function switchToOrtho() {
  if (activeCamera === orthographicCamera) return;

  const oldPos = activeCamera.position.clone();
  const oldTarget = controls.target.clone();

  activeCamera = orthographicCamera;
  orthographicCamera.position.copy(oldPos);

  controls.object = activeCamera;
  controls.target.copy(oldTarget);
  controls.update();

  onResize();
}

function animateCameraTo(position, target, label) {
  currentAnimation = {
    startTime: performance.now(),
    duration: 700,
    fromPos: activeCamera.position.clone(),
    toPos: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    label,
  };
}

function focusRoom(roomId) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return;

  activeFocusedRoomId = roomId;

  focusMarkers.forEach((item) => {
    item.mesh.visible = item.id === roomId;
  });

  roomFloorMeshes.forEach((mesh) => {
    const isActive = mesh.userData.roomId === roomId;
    mesh.material.opacity = isActive ? 0.9 : 0.45;
  });

  let pos;
  let target;

  if (activeView === "top") {
    switchToOrtho();
    pos = new THREE.Vector3(room.x, 9, room.z + 0.001);
    target = new THREE.Vector3(room.x, 0, room.z);
    animateCameraTo(pos, target, room.name);
    return;
  }

  if (activeView === "iso") {
    switchToOrtho();
    pos = new THREE.Vector3(room.x + 6, 7, room.z + 6);
    target = new THREE.Vector3(room.x, 0.2, room.z);
    animateCameraTo(pos, target, room.name);
    return;
  }

  switchToPerspective();
  pos = new THREE.Vector3(room.x + 5, 4.2, room.z + 5);
  target = new THREE.Vector3(room.x, 0.8, room.z);
  animateCameraTo(pos, target, room.name);
}

function drawMiniMap() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = miniMapCanvas.getBoundingClientRect();
  const width = rect.width || 120;
  const height = rect.height || 120;

  miniMapCanvas.width = Math.round(width * dpr);
  miniMapCanvas.height = Math.round(height * dpr);

  const ctx = miniMapCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const padding = 10;
  const scaleX = (width - padding * 2) / ROOM_WIDTH;
  const scaleY = (height - padding * 2) / ROOM_LENGTH;
  const scale = Math.min(scaleX, scaleY);

  const roomPixelWidth = ROOM_WIDTH * scale;
  const roomPixelLength = ROOM_LENGTH * scale;
  const offsetX = (width - roomPixelWidth) / 2;
  const offsetY = (height - roomPixelLength) / 2;

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, roomPixelWidth, roomPixelLength);

  rooms.forEach((room) => {
    const x = offsetX + ((room.x - room.width / 2) + ROOM_WIDTH / 2) * scale;
    const y = offsetY + ((room.z - room.length / 2) + ROOM_LENGTH / 2) * scale;
    const w = room.width * scale;
    const l = room.length * scale;

    ctx.fillStyle = room.id === activeFocusedRoomId ? "#f59e0b" : "#dbeafe";
    if (room.id === "kitchen") ctx.fillStyle = room.id === activeFocusedRoomId ? "#f59e0b" : "#fde7c7";
    if (room.id === "bedroom") ctx.fillStyle = room.id === activeFocusedRoomId ? "#f59e0b" : "#eddcff";
    if (room.id === "bath") ctx.fillStyle = room.id === activeFocusedRoomId ? "#f59e0b" : "#d7faf4";

    ctx.fillRect(x, y, w, l);

    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, l);

    ctx.fillStyle = "#222";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.name, x + w / 2, y + l / 2);
  });

  const doorWidth = 1.8 * scale;
  const doorX = offsetX + roomPixelWidth / 2 - doorWidth / 2;
  const doorY = offsetY + roomPixelLength - 2;
  ctx.clearRect(doorX, doorY - 2, doorWidth, 6);
}

function onMiniMapClick(event) {
  const rect = miniMapCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const width = rect.width;
  const height = rect.height;

  const padding = 10;
  const scaleX = (width - padding * 2) / ROOM_WIDTH;
  const scaleY = (height - padding * 2) / ROOM_LENGTH;
  const scale = Math.min(scaleX, scaleY);

  const roomPixelWidth = ROOM_WIDTH * scale;
  const roomPixelLength = ROOM_LENGTH * scale;
  const offsetX = (width - roomPixelWidth) / 2;
  const offsetY = (height - roomPixelLength) / 2;

  for (const room of rooms) {
    const rx = offsetX + ((room.x - room.width / 2) + ROOM_WIDTH / 2) * scale;
    const ry = offsetY + ((room.z - room.length / 2) + ROOM_LENGTH / 2) * scale;
    const rw = room.width * scale;
    const rl = room.length * scale;

    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rl) {
      focusRoom(room.id);
      drawMiniMap();
      break;
    }
  }
}

function updateDimensionLabelPositions() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  dimensionLabels.forEach((item) => {
    const screen = worldToScreen(item.position, activeCamera, width, height);
    const visible = screen.visible && dimensionsVisible;

    item.element.style.display = visible ? "block" : "none";
    if (!visible) return;

    item.element.style.left = `${screen.x}px`;
    item.element.style.top = `${screen.y}px`;
  });
}

function worldToScreen(position, camera, width, height) {
  const vector = position.clone().project(camera);

  const visible =
    vector.z >= -1 &&
    vector.z <= 1 &&
    vector.x >= -1.2 &&
    vector.x <= 1.2 &&
    vector.y >= -1.2 &&
    vector.y <= 1.2;

  return {
    x: (vector.x * 0.5 + 0.5) * width,
    y: (-vector.y * 0.5 + 0.5) * height,
    visible,
  };
}

function updateOrientationText() {
  const dir = new THREE.Vector3();
  activeCamera.getWorldDirection(dir);

  const absX = Math.abs(dir.x);
  const absZ = Math.abs(dir.z);
  const absY = Math.abs(dir.y);

  let label = "View";

  if (absY > 0.85 && dir.y < 0) {
    label = "Top";
  } else if (absX > absZ) {
    label = dir.x > 0 ? "Left" : "Right";
  } else if (absZ >= absX) {
    label = dir.z > 0 ? "Front" : "Back";
  }

  orientationText.textContent = label;
}

function updateAnimation(now) {
  if (!currentAnimation) return;

  const t = Math.min((now - currentAnimation.startTime) / currentAnimation.duration, 1);
  const eased = easeInOutCubic(t);

  activeCamera.position.lerpVectors(
    currentAnimation.fromPos,
    currentAnimation.toPos,
    eased
  );

  controls.target.lerpVectors(
    currentAnimation.fromTarget,
    currentAnimation.toTarget,
    eased
  );

  if (t >= 1) {
    currentAnimation = null;
  }
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);

  perspectiveCamera.aspect = window.innerWidth / window.innerHeight;
  perspectiveCamera.updateProjectionMatrix();

  const nextAspect = window.innerWidth / window.innerHeight;
  orthographicCamera.left = -orthoFrustum * nextAspect;
  orthographicCamera.right = orthoFrustum * nextAspect;
  orthographicCamera.top = orthoFrustum;
  orthographicCamera.bottom = -orthoFrustum;
  orthographicCamera.updateProjectionMatrix();

  drawMiniMap();
}

function render(now = performance.now()) {
  requestAnimationFrame(render);

  updateAnimation(now);
  controls.update();
  updateDimensionLabelPositions();
  updateOrientationText();

  renderer.render(scene, activeCamera);
}
