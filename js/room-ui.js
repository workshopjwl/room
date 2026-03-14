import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

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

/* =========================
   SCALE / CONSTANTS
========================= */
const CM_TO_UNIT = 0.01; // 1 unit = 1 meter
const WALL_HEIGHT_CM = 250;
const WALL_HEIGHT = WALL_HEIGHT_CM * CM_TO_UNIT;
const FLOOR_THICKNESS = 0.04;
const DEFAULT_WALL_THICKNESS_CM = 12;
const DOOR_HEIGHT_CM = 210;

const dimensionLabels = [];
const focusMarkers = [];
const roomFloorMeshes = [];
const hideableWallObjects = [];

let dimensionsVisible = true;
let activeView = "3d";
let activeFocusedRoomId = "";
let currentAnimation = null;

/* =========================
   REAL FLOOR PLAN DATA
   origin = living room SW corner
   x -> east
   y -> north
========================= */
const rooms = [
  {
    id: "living_room",
    name: "Living",
    x: 0,
    y: 0,
    width: 664,
    depth: 430,
    color: 0xe8f0ff,
    walls: { north: 14, south: 14, east: 20, west: 15 },
    doors: [
      { id: "main_entrance", wall: "south", offset: 143, width: 90 },
      { id: "kitchen_door", wall: "west", offset: 65, width: 81.5 },
      { id: "balcony_door", wall: "east", offset: 60, width: 60 },
    ],
  },
  {
    id: "balcony",
    name: "Balcony",
    x: 664,
    y: 0,
    width: 131,
    depth: 237,
    color: 0xe6fff2,
    walls: {},
    doors: [],
  },
  {
    id: "storage",
    name: "Storage",
    x: -132,
    y: 430,
    width: 232,
    depth: 320,
    color: 0xfff0db,
    walls: { south: 14 },
    doors: [{ id: "storage_door", wall: "south", align: "right", width: 75 }],
  },
  {
    id: "guest_room",
    name: "Guest",
    x: 100,
    y: 430,
    width: 244,
    depth: 320,
    color: 0xf3e8ff,
    walls: { south: 14 },
    doors: [{ id: "guest_door", wall: "south", align: "right", width: 84 }],
  },
  {
    id: "master_bedroom",
    name: "Master Bed",
    x: 344,
    y: 104,
    width: 320,
    depth: 320,
    color: 0xefe2ff,
    walls: { west: 11, south: 11 },
    doors: [{ id: "master_bed_door", wall: "west", align: "bottom", width: 97 }],
  },
  {
    id: "master_bathroom",
    name: "Master Bath",
    x: 344,
    y: 424,
    width: 320,
    depth: 120,
    color: 0xe0f2fe,
    walls: {},
    doors: [{ id: "master_bath_door", wall: "south", align: "left", width: 75 }],
  },
  {
    id: "living_bathroom",
    name: "Bath",
    x: -128,
    y: 167,
    width: 128,
    depth: 263,
    color: 0xe6fffb,
    walls: {},
    doors: [{ id: "living_bath_door", wall: "east", align: "top", width: 81.5 }],
  },
  {
    id: "laundry",
    name: "Laundry",
    x: -268,
    y: 189,
    width: 140,
    depth: 241,
    color: 0xffedd5,
    walls: { east: 18 },
    doors: [{ id: "laundry_door", wall: "south", fromRight: 70, width: 70 }],
  },
  {
    id: "kitchen",
    name: "Kitchen",
    x: -302,
    y: 32, // corrected from 430 so it sits below laundry instead of overlapping storage
    width: 302,
    depth: 157,
    color: 0xf3f4f6,
    walls: {},
    doors: [],
  },
];

/* =========================
   BOUNDS
========================= */
const bounds = getLayoutBounds();
const LAYOUT_WIDTH = bounds.maxX - bounds.minX;
const LAYOUT_DEPTH = bounds.maxY - bounds.minY;
const LAYOUT_CENTER_X = (bounds.minX + bounds.maxX) / 2;
const LAYOUT_CENTER_Z = (bounds.minY + bounds.maxY) / 2;

/* =========================
   SCENE
========================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const perspectiveCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const aspect = window.innerWidth / window.innerHeight;
const orthoFrustum = Math.max(LAYOUT_WIDTH, LAYOUT_DEPTH) * 0.68;
const orthographicCamera = new THREE.OrthographicCamera(
  -orthoFrustum * aspect,
  orthoFrustum * aspect,
  orthoFrustum,
  -orthoFrustum,
  0.1,
  1000
);

let activeCamera = perspectiveCamera;

perspectiveCamera.position.set(
  LAYOUT_CENTER_X + 10,
  8,
  LAYOUT_CENTER_Z + 10
);
orthographicCamera.position.set(
  LAYOUT_CENTER_X + 8,
  9,
  LAYOUT_CENTER_Z + 8
);

const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.target.set(LAYOUT_CENTER_X, 1.1, LAYOUT_CENTER_Z);
controls.minDistance = 3;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI / 2.02;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(
  LAYOUT_CENTER_X + 8,
  12,
  LAYOUT_CENTER_Z + 6
);
scene.add(dirLight);

const gridSize = Math.ceil(Math.max(LAYOUT_WIDTH, LAYOUT_DEPTH) + 6);
const gridDivisions = Math.max(10, Math.round(gridSize));
const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x2f2f2f);
grid.position.set(LAYOUT_CENTER_X, 0.001, LAYOUT_CENTER_Z);
scene.add(grid);

/* =========================
   BUILD
========================= */
buildRoomFloors();
buildWalls();
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

/* =========================
   HELPERS
========================= */
function cm(v) {
  return v * CM_TO_UNIT;
}

function getLayoutBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  rooms.forEach((room) => {
    minX = Math.min(minX, cm(room.x));
    minY = Math.min(minY, cm(room.y));
    maxX = Math.max(maxX, cm(room.x + room.width));
    maxY = Math.max(maxY, cm(room.y + room.depth));
  });

  return { minX, minY, maxX, maxY };
}

function getRoomWorldRect(room) {
  return {
    minX: cm(room.x),
    maxX: cm(room.x + room.width),
    minZ: cm(room.y),
    maxZ: cm(room.y + room.depth),
    width: cm(room.width),
    depth: cm(room.depth),
    centerX: cm(room.x + room.width / 2),
    centerZ: cm(room.y + room.depth / 2),
  };
}

function getWallThicknessCm(room, wall) {
  return room.walls?.[wall] ?? DEFAULT_WALL_THICKNESS_CM;
}

function getWallColor(roomId) {
  if (roomId === "balcony") return 0xd9fbe8;
  return 0xf5f5f5;
}

function getDoorStart(room, door) {
  if (typeof door.offset === "number") return door.offset;
  if (door.align === "right") return room.width - door.width;
  if (door.align === "left") return 0;
  if (door.align === "bottom") return 0;
  if (door.align === "top") return room.depth - door.width;
  if (typeof door.fromRight === "number") return room.width - door.fromRight - door.width;
  return 0;
}

function buildSegments(room, totalLengthCm, doorList) {
  if (!doorList.length) {
    return [{ start: 0, length: totalLengthCm }];
  }

  const openings = doorList
    .map((door) => {
      const start = Math.max(0, getDoorStart(room, door));
      const end = Math.min(totalLengthCm, start + door.width);
      return { start, end };
    })
    .sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;

  openings.forEach((opening) => {
    if (opening.start > cursor) {
      segments.push({ start: cursor, length: opening.start - cursor });
    }
    cursor = Math.max(cursor, opening.end);
  });

  if (cursor < totalLengthCm) {
    segments.push({ start: cursor, length: totalLengthCm - cursor });
  }

  return segments.filter((seg) => seg.length > 0.1);
}

function trackHideableWallObject(obj, wall, roomId) {
  obj.userData.wallSide = wall;
  obj.userData.roomId = roomId;
  hideableWallObjects.push(obj);
}

/* =========================
   FLOORS
========================= */
function buildRoomFloors() {
  rooms.forEach((room) => {
    const rect = getRoomWorldRect(room);

    const floorGeo = new THREE.PlaneGeometry(rect.width, rect.depth);
    const floorMat = new THREE.MeshBasicMaterial({
      color: room.color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });

    const roomFloor = new THREE.Mesh(floorGeo, floorMat);
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.set(rect.centerX, 0.01, rect.centerZ);
    roomFloor.userData.roomId = room.id;
    roomFloor.userData.roomName = room.name;
    scene.add(roomFloor);
    roomFloorMeshes.push(roomFloor);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(rect.width, FLOOR_THICKNESS, rect.depth)),
      new THREE.LineBasicMaterial({ color: 0x555555 })
    );
    edges.position.set(rect.centerX, FLOOR_THICKNESS / 2, rect.centerZ);
    scene.add(edges);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7a00 })
    );
    marker.position.set(rect.centerX, 0.08, rect.centerZ);
    marker.visible = false;
    scene.add(marker);
    focusMarkers.push({ id: room.id, mesh: marker });
  });
}

/* =========================
   WALLS
========================= */
function buildWalls() {
  rooms.forEach((room) => buildRoomWalls(room));
}

function buildRoomWalls(room) {
  const rect = getRoomWorldRect(room);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: getWallColor(room.id),
    side: THREE.DoubleSide,
  });

  const doorHeight = cm(DOOR_HEIGHT_CM);
  const walls = room.walls || {};

  ["north", "south", "east", "west"].forEach((wall) => {
    if (!(wall in walls)) return;

    const thicknessCm = getWallThicknessCm(room, wall);
    const thickness = cm(thicknessCm);
    const wallDoors = (room.doors || []).filter((d) => d.wall === wall);

    if (wall === "north" || wall === "south") {
      const totalLengthCm = room.width;
      const segments = buildSegments(room, totalLengthCm, wallDoors);

      segments.forEach((seg) => {
        const segWidth = cm(seg.length);

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(segWidth, WALL_HEIGHT, thickness),
          wallMaterial.clone()
        );

        mesh.position.set(
          rect.minX + cm(seg.start) + segWidth / 2,
          WALL_HEIGHT / 2,
          wall === "south" ? rect.minZ : rect.maxZ
        );

        scene.add(mesh);
        trackHideableWallObject(mesh, wall, room.id);
      });

      wallDoors.forEach((door) => {
        const start = getDoorStart(room, door);
        const width = cm(door.width);
        const headerHeight = Math.max(0.2, WALL_HEIGHT - doorHeight);

        if (headerHeight > 0.01) {
          const header = new THREE.Mesh(
            new THREE.BoxGeometry(width, headerHeight, thickness),
            wallMaterial.clone()
          );

          header.position.set(
            rect.minX + cm(start) + width / 2,
            doorHeight + headerHeight / 2,
            wall === "south" ? rect.minZ : rect.maxZ
          );

          scene.add(header);
          trackHideableWallObject(header, wall, room.id);
        }

        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(width, doorHeight, 0.02)),
          new THREE.LineBasicMaterial({ color: 0x333333 })
        );
        frame.position.set(
          rect.minX + cm(start) + width / 2,
          doorHeight / 2,
          wall === "south" ? rect.minZ + 0.01 : rect.maxZ - 0.01
        );
        scene.add(frame);
        trackHideableWallObject(frame, wall, room.id);
      });
    } else {
      const totalLengthCm = room.depth;
      const segments = buildSegments(room, totalLengthCm, wallDoors);

      segments.forEach((seg) => {
        const segDepth = cm(seg.length);

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(thickness, WALL_HEIGHT, segDepth),
          wallMaterial.clone()
        );

        mesh.position.set(
          wall === "west" ? rect.minX : rect.maxX,
          WALL_HEIGHT / 2,
          rect.minZ + cm(seg.start) + segDepth / 2
        );

        scene.add(mesh);
        trackHideableWallObject(mesh, wall, room.id);
      });

      wallDoors.forEach((door) => {
        const start = getDoorStart(room, door);
        const width = cm(door.width);
        const headerHeight = Math.max(0.2, WALL_HEIGHT - doorHeight);

        if (headerHeight > 0.01) {
          const header = new THREE.Mesh(
            new THREE.BoxGeometry(thickness, headerHeight, width),
            wallMaterial.clone()
          );

          header.position.set(
            wall === "west" ? rect.minX : rect.maxX,
            doorHeight + headerHeight / 2,
            rect.minZ + cm(start) + width / 2
          );

          scene.add(header);
          trackHideableWallObject(header, wall, room.id);
        }

        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(0.02, doorHeight, width)),
          new THREE.LineBasicMaterial({ color: 0x333333 })
        );
        frame.position.set(
          wall === "west" ? rect.minX + 0.01 : rect.maxX - 0.01,
          doorHeight / 2,
          rect.minZ + cm(start) + width / 2
        );
        scene.add(frame);
        trackHideableWallObject(frame, wall, room.id);
      });
    }
  });
}

/* =========================
   SAMPLE FURNITURE
========================= */
function buildSampleFurniture() {
  const living = rooms.find((r) => r.id === "living_room");
  const guest = rooms.find((r) => r.id === "guest_room");
  const kitchen = rooms.find((r) => r.id === "kitchen");

  if (living) {
    const sofa = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.75, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x4f6fd8 })
    );
    sofa.position.set(cm(220), 0.375, cm(120));
    scene.add(sofa);

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.7, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x9c6b3f })
    );
    table.position.set(cm(320), 0.35, cm(200));
    scene.add(table);
  }

  if (guest) {
    const rect = getRoomWorldRect(guest);
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.55, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xb48cd6 })
    );
    bed.position.set(rect.centerX, 0.275, rect.centerZ);
    scene.add(bed);
  }

  if (kitchen) {
    const rect = getRoomWorldRect(kitchen);
    const kitchenBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xc7b59b })
    );
    kitchenBlock.position.set(rect.centerX, 0.45, rect.centerZ);
    scene.add(kitchenBlock);
  }
}

/* =========================
   DIMENSIONS
========================= */
function createDimensionLabels() {
  rooms.forEach((room) => {
    const rect = getRoomWorldRect(room);
    addDimensionLabel(
      `${room.name} ${room.width}×${room.depth} cm`,
      new THREE.Vector3(rect.centerX, 1.05, rect.centerZ)
    );
  });

  const living = rooms.find((r) => r.id === "living_room");
  if (living) {
    const rect = getRoomWorldRect(living);

    addDimensionLabel(
      `Living width ${living.width} cm`,
      new THREE.Vector3(rect.centerX, 1.45, rect.minZ - 0.2)
    );

    addDimensionLabel(
      `Living depth ${living.depth} cm`,
      new THREE.Vector3(rect.minX - 0.2, 1.45, rect.centerZ)
    );
  }

  addDimensionLabel(
    `Wall height ${WALL_HEIGHT_CM} cm`,
    new THREE.Vector3(bounds.maxX + 0.7, WALL_HEIGHT / 2, LAYOUT_CENTER_Z)
  );
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

/* =========================
   VIEW MODES
========================= */
function setMainView(view) {
  activeView = view;

  btnView3d.classList.toggle("active", view === "3d");
  btnViewIso.classList.toggle("active", view === "iso");
  btnViewTop.classList.toggle("active", view === "top");

  updateWallVisibilityForView(view);

  if (view === "3d") {
    switchToPerspective();
    animateCameraTo(
      new THREE.Vector3(LAYOUT_CENTER_X + 10, 8, LAYOUT_CENTER_Z + 10),
      new THREE.Vector3(LAYOUT_CENTER_X, 1.2, LAYOUT_CENTER_Z),
      "3D"
    );
    return;
  }

  switchToOrtho();

  if (view === "iso") {
    animateCameraTo(
      new THREE.Vector3(LAYOUT_CENTER_X + 8, 8, LAYOUT_CENTER_Z + 8),
      new THREE.Vector3(LAYOUT_CENTER_X, 0.8, LAYOUT_CENTER_Z),
      "ISO"
    );
    return;
  }

  if (view === "top") {
    animateCameraTo(
      new THREE.Vector3(LAYOUT_CENTER_X, 18, LAYOUT_CENTER_Z + 0.001),
      new THREE.Vector3(LAYOUT_CENTER_X, 0, LAYOUT_CENTER_Z),
      "TOP"
    );
  }
}

function updateWallVisibilityForView(view) {
  hideableWallObjects.forEach((obj) => {
    if (view === "iso") {
      const side = obj.userData.wallSide;
      obj.visible = side !== "south" && side !== "west";
    } else {
      obj.visible = true;
    }
  });
}

function snapSideView(side) {
  switchToOrtho();
  updateWallVisibilityForView(activeView);

  const distance = Math.max(LAYOUT_WIDTH, LAYOUT_DEPTH) * 1.2;

  if (side === "front") {
    animateCameraTo(
      new THREE.Vector3(LAYOUT_CENTER_X, 1.8, LAYOUT_CENTER_Z + distance),
      new THREE.Vector3(LAYOUT_CENTER_X, 1.4, LAYOUT_CENTER_Z),
      "Front"
    );
    return;
  }

  if (side === "left") {
    animateCameraTo(
      new THREE.Vector3(LAYOUT_CENTER_X - distance, 1.8, LAYOUT_CENTER_Z),
      new THREE.Vector3(LAYOUT_CENTER_X, 1.4, LAYOUT_CENTER_Z),
      "Left"
    );
    return;
  }

  if (side === "right") {
    animateCameraTo(
      new THREE.Vector3(LAYOUT_CENTER_X + distance, 1.8, LAYOUT_CENTER_Z),
      new THREE.Vector3(LAYOUT_CENTER_X, 1.4, LAYOUT_CENTER_Z),
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

/* =========================
   FOCUS ROOM
========================= */
function focusRoom(roomId) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return;

  const rect = getRoomWorldRect(room);
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
    pos = new THREE.Vector3(rect.centerX, 9, rect.centerZ + 0.001);
    target = new THREE.Vector3(rect.centerX, 0, rect.centerZ);
    animateCameraTo(pos, target, room.name);
    return;
  }

  if (activeView === "iso") {
    switchToOrtho();
    pos = new THREE.Vector3(rect.centerX + 4.5, 5.5, rect.centerZ + 4.5);
    target = new THREE.Vector3(rect.centerX, 0.4, rect.centerZ);
    animateCameraTo(pos, target, room.name);
    return;
  }

  switchToPerspective();
  pos = new THREE.Vector3(rect.centerX + 4.5, 3.8, rect.centerZ + 4.5);
  target = new THREE.Vector3(rect.centerX, 0.8, rect.centerZ);
  animateCameraTo(pos, target, room.name);
}

/* =========================
   MINIMAP
========================= */
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
  const scaleX = (width - padding * 2) / LAYOUT_WIDTH;
  const scaleY = (height - padding * 2) / LAYOUT_DEPTH;
  const scale = Math.min(scaleX, scaleY);

  const planPixelWidth = LAYOUT_WIDTH * scale;
  const planPixelDepth = LAYOUT_DEPTH * scale;
  const offsetX = (width - planPixelWidth) / 2;
  const offsetY = (height - planPixelDepth) / 2;

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, planPixelWidth, planPixelDepth);

  rooms.forEach((room) => {
    const rx = offsetX + (cm(room.x) - bounds.minX) * scale;
    const ry = offsetY + (cm(room.y) - bounds.minY) * scale;
    const rw = cm(room.width) * scale;
    const rd = cm(room.depth) * scale;

    let fill = "#dbeafe";
    if (room.id === "kitchen") fill = "#fde7c7";
    if (room.id === "guest_room" || room.id === "master_bedroom") fill = "#eddcff";
    if (room.id === "master_bathroom" || room.id === "living_bathroom") fill = "#d7faf4";
    if (room.id === "balcony") fill = "#dbfce7";
    if (room.id === "laundry") fill = "#ffe8d4";
    if (room.id === activeFocusedRoomId) fill = "#f59e0b";

    ctx.fillStyle = fill;
    ctx.fillRect(rx, ry, rw, rd);

    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(rx, ry, rw, rd);

    ctx.fillStyle = "#222";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.name, rx + rw / 2, ry + rd / 2);
  });
}

function onMiniMapClick(event) {
  const rect = miniMapCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const width = rect.width;
  const height = rect.height;

  const padding = 10;
  const scaleX = (width - padding * 2) / LAYOUT_WIDTH;
  const scaleY = (height - padding * 2) / LAYOUT_DEPTH;
  const scale = Math.min(scaleX, scaleY);

  const planPixelWidth = LAYOUT_WIDTH * scale;
  const planPixelDepth = LAYOUT_DEPTH * scale;
  const offsetX = (width - planPixelWidth) / 2;
  const offsetY = (height - planPixelDepth) / 2;

  for (const room of rooms) {
    const rx = offsetX + (cm(room.x) - bounds.minX) * scale;
    const ry = offsetY + (cm(room.y) - bounds.minY) * scale;
    const rw = cm(room.width) * scale;
    const rd = cm(room.depth) * scale;

    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rd) {
      focusRoom(room.id);
      drawMiniMap();
      break;
    }
  }
}

/* =========================
   LABEL POSITIONS
========================= */
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

/* =========================
   ANIMATION
========================= */
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

/* =========================
   RESIZE
========================= */
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

/* =========================
   RENDER LOOP
========================= */
function render(now = performance.now()) {
  requestAnimationFrame(render);

  updateAnimation(now);
  controls.update();
  updateDimensionLabelPositions();

  renderer.render(scene, activeCamera);
}
