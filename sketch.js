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

  const margin = 50;
  const w = width * 0.35;
  const hBig = height * 0.55;
  const hSmall = height * 0.28;

  islands.push({
    name: "Hokkaido",
    x: margin,
    y: margin,
    w: w,
    h: hSmall,
    receipts: [],
  });

  islands.push({
    name: "Honshu",
    x: width - w - margin,
    y: margin,
    w: w,
    h: hBig,
    receipts: [],
  });

  islands.push({
    name: "Shikoku",
    x: margin,
    y: height - hSmall - margin,
    w: w * 0.5,
    h: hSmall,
    receipts: [],
  });

  islands.push({
    name: "Kyushu",
    x: width - w * 0.55 - margin,
    y: height - hSmall - margin,
    w: w * 0.55,
    h: hSmall,
    receipts: [],
  });
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

  let svgAspect = img.width / img.height;
  let boxAspect = island.w / island.h;

  let drawW, drawH;

  if (svgAspect > boxAspect) {
    // 가로가 더 넓음 → 가로에 맞추기
    drawW = island.w;
    drawH = island.w / svgAspect;
  } else {
    // 세로가 더 큼 → 세로에 맞추기
    drawH = island.h;
    drawW = island.h * svgAspect;
  }

  // 중앙 정렬
  let offsetX = island.x + (island.w - drawW) / 2;
  let offsetY = island.y + (island.h - drawH) / 2;

  image(img, offsetX, offsetY, drawW, drawH);

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

  island.scaleK = (island.w * island.h * 0.6) / sum;
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
