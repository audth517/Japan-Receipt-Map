// -----------------------------------------------------
// GLOBAL VARIABLES
// -----------------------------------------------------
let receiptsData = [];
let receiptImages = {};

let islands = [];
let activeIsland = null;

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;
let assigned = false;

let imgHokkaido, imgHonshu, imgShikoku, imgKyushu;


// -----------------------------------------------------
// PRELOAD
// -----------------------------------------------------
function preload() {

  // 섬 SVG 파일
  imgHokkaido = loadImage("assets/islands/japan_hokkaido.svg");
  imgHonshu   = loadImage("assets/islands/japan_honshu.svg");
  imgShikoku  = loadImage("assets/islands/japan_shikoku.svg");
  imgKyushu   = loadImage("assets/islands/japan_kyushu.svg");

  // JSON 로딩
  receiptsData = loadJSON("data/receipts.json?v=" + Date.now());
}


// -----------------------------------------------------
// SETUP
// -----------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);

  if (!Array.isArray(receiptsData)) {
    receiptsData = Object.values(receiptsData);
  }

  totalImages = receiptsData.length;

  // 영수증 이미지 로딩
  for (let r of receiptsData) {
    let path = "assets/receipts/" + r.filename;

    receiptImages[r.id] = loadImage(
      path,
      () => {
        imagesLoaded++;
        if (imagesLoaded === totalImages) ready = true;
      },
      () => console.error("Failed:", path)
    );
  }

  setupIslands();
}


// -----------------------------------------------------
// WINDOW RESIZE
// -----------------------------------------------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupIslands();
}


// -----------------------------------------------------
// ISLAND CREATION
// -----------------------------------------------------
function setupIslands() {
  islands = [];

  // 일본 지도 전체 박스 크기
  const mapH = height * 0.85;    // 전체 화면의 85% 높이
  const mapW = mapH * 0.35;      // 일본 전체 비율
  const mapX = (width - mapW) / 2;
  const mapY = height * 0.10;    // Japan 전체를 아래쪽으로 배치

  // 혼슈 높이(Honshu 기준)
  const baseHonshuH = mapH * 0.55;

  // 각 섬의 위치 & 혼슈 대비 크기 비율
  const defs = {
    Honshu:   { dx: 0.63, dy: 0.56, hRatio: 1.00 },
    Hokkaido: { dx: 0.78, dy: 0.18, hRatio: 0.62 },
    Shikoku:  { dx: 0.52, dy: 0.83, hRatio: 0.26 },
    Kyushu:   { dx: 0.40, dy: 0.96, hRatio: 0.36 }
  };

  const order = ["Honshu", "Hokkaido", "Shikoku", "Kyushu"];

  for (let name of order) {
    let img = null;
    if (name === "Hokkaido") img = imgHokkaido;
    if (name === "Honshu")   img = imgHonshu;
    if (name === "Shikoku")  img = imgShikoku;
    if (name === "Kyushu")   img = imgKyushu;
    if (!img) continue;

    const d = defs[name];

    // 섬 높이와 너비 (SVG 비율 유지)
    const islandH = baseHonshuH * d.hRatio;
    const islandW = islandH * (img.width / img.height);

    // 일본 전체 중심 좌표
    const cx = mapX + mapW * d.dx;
    const cy = mapY + mapH * d.dy;

    islands.push({
      name,
      x: cx - islandW / 2,
      y: cy - islandH / 2,
      w: islandW,
      h: islandH,
      receipts: [],
    });
  }
}


// -----------------------------------------------------
// RANDOM ASSIGNMENT
// -----------------------------------------------------
function assignReceiptsToIslands() {
  for (let r of receiptsData) {
    let idx = floor(random(islands.length));
    islands[idx].receipts.push(r);
  }
}


// -----------------------------------------------------
// DRAW LOOP
// -----------------------------------------------------
function draw() {
  background(20);

  if (!ready) {
    push();
    resetMatrix();
    textAlign(CENTER, CENTER);
    fill(245);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, width / 2, height / 2);
    pop();
    return;
  }

  // 한 번만 실행되는 부분
  if (!assigned) {
    assignReceiptsToIslands();

    for (let isl of islands) {
      computeIslandScaling(isl);
      applyPriceScaling(isl);
    }

    assigned = true;
  }

  // 섬 그리기
  for (let island of islands) {
    drawIslandImage(island);
  }

  // 영수증 배치
  for (let isl of islands) {
    drawReceiptsInIsland(isl);
  }
}


// -----------------------------------------------------
// DRAW ISLAND SVG
// -----------------------------------------------------
function drawIslandImage(island) {
  let img;

  if (island.name === "Hokkaido") img = imgHokkaido;
  if (island.name === "Honshu")   img = imgHonshu;
  if (island.name === "Shikoku")  img = imgShikoku;
  if (island.name === "Kyushu")   img = imgKyushu;

  if (!img) return;

  push();
  imageMode(CORNER);

  let aspect = img.width / img.height;
  let boxAspect = island.w / island.h;

  let drawW, drawH;

  // contain 방식
  if (aspect > boxAspect) {
    drawW = island.w;
    drawH = island.w / aspect;
  } else {
    drawH = island.h;
    drawW = island.h * aspect;
  }

  let x = island.x + (island.w - drawW) * 0.5;
  let y = island.y + (island.h - drawH) * 0.5;

  image(img, x, y, drawW, drawH);

  pop();
}


// -----------------------------------------------------
// RECEIPT LAYOUT
// -----------------------------------------------------
function drawReceiptsInIsland(island) {
  let list = island.receipts;
  if (list.length === 0) return;

  const padding = 10;
  const maxWidth = island.w - padding * 2;

  let rows = [];
  let currentRow = [];
  let currentWidth = 0;

  for (let r of list) {
    let w = r.scaledW;
    let nextWidth = currentWidth + w + (currentRow.length ? padding : 0);

    if (nextWidth > maxWidth) {
      rows.push(currentRow);
      currentRow = [r];
      currentWidth = w;
    } else {
      currentRow.push(r);
      currentWidth = nextWidth;
    }
  }
  if (currentRow.length) rows.push(currentRow);

  let rowHeights = rows.map(row => row.reduce((m, r) => max(m, r.scaledH), 0));
  let totalHeight = rowHeights.reduce((a, b) => a + b, 0) + padding * (rowHeights.length - 1);

  let y = island.y + (island.h - totalHeight) / 2;

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let maxH = rowHeights[i];

    let rowWidth = row.reduce((acc, r, idx) => acc + r.scaledW + (idx ? padding : 0), 0);
    let x = island.x + (island.w - rowWidth) / 2;

    for (let r of row) {
      let img = receiptImages[r.id];
      if (img) image(img, x + r.scaledW / 2, y + maxH / 2, r.scaledW, r.scaledH);
      x += r.scaledW + padding;
    }

    y += maxH + padding;
  }
}


// -----------------------------------------------------
// PRICE SCALING
// -----------------------------------------------------
function computeIslandScaling(island) {
  let sum = 0;
  for (let r of island.receipts) sum += r.price;

  island.scaleK = (island.w * island.h * 0.05) / sum;   // 크기 감소
}

function applyPriceScaling(island) {
  for (let r of island.receipts) {
    let aspect = r.width / r.height;
    let area = r.price * island.scaleK;

    let scaledH = sqrt(area / aspect);
    let scaledW = scaledH * aspect;

    r.scaledW = scaledW;
    r.scaledH = scaledH;
  }
}
