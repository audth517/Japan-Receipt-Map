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

  // 섬 SVG
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

  // 개별 영수증 이미지 로딩
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

  // 일본 전체 크기 비율
  const mapH = height * 0.7;
  const mapW = mapH * 0.55; // 일본 전체 가로비율 (세로 긴 지도)

  const mapX = (width - mapW) / 2;
  const mapY = height * 0.15;

  // 상대 좌표 기반 anchor positions
  const anchor = {
    Hokkaido: { x: 0.20, y: 0.00, scale: 0.32 },
    Honshu:   { x: 0.55, y: 0.25, scale: 1.00 },
    Shikoku:  { x: 0.35, y: 0.72, scale: 0.28 },
    Kyushu:   { x: 0.10, y: 0.65, scale: 0.40 },
  };

  // 섬 목록
  const islandNames = ["Hokkaido", "Honshu", "Shikoku", "Kyushu"];
  for (let name of islandNames) {
    const a = anchor[name];

    // 섬 SVG
    let img = null;
    if (name === "Hokkaido") img = imgHokkaido;
    if (name === "Honshu")   img = imgHonshu;
    if (name === "Shikoku")  img = imgShikoku;
    if (name === "Kyushu")   img = imgKyushu;

    const aspect = img.width / img.height;

    // 섬 크기 (Honshu가 기준)
    const regionH = mapH * a.scale;
    const regionW = regionH * aspect;

    islands.push({
      name,
      x: mapX + mapW * a.x - regionW * 0.5,
      y: mapY + mapH * a.y - regionH * 0.5,
      w: regionW,
      h: regionH,
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
    fill(240);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, width / 2, height / 2);
    return;
  }

  // 첫 1회만 실행
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

  // 원본 비율
  let aspect = img.width / img.height;

  // 받침 박스 비율
  let boxAspect = island.w / island.h;

  let drawW, drawH;

  // contain 방식
  if (aspect > boxAspect) {
    // 가로가 기준
    drawW = island.w;
    drawH = island.w / aspect;
  } else {
    // 세로가 기준
    drawH = island.h;
    drawW = island.h * aspect;
  }

  // 중앙 정렬
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

  let rowHeights = rows.map(row =>
    row.reduce((m, r) => max(m, r.scaledH), 0)
  );

  let totalHeight =
    rowHeights.reduce((a, b) => a + b, 0) +
    padding * (rowHeights.length - 1);

  let y = island.y + (island.h - totalHeight) / 2;

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let maxH = rowHeights[i];

    let rowWidth = row.reduce(
      (acc, r, idx) => acc + r.scaledW + (idx ? padding : 0),
      0
    );

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

  island.scaleK = (island.w * island.h * 0.2) / sum;
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
