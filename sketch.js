let receiptsData = [];
let receiptImages = {};

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;

let assigned = false;

let imgHokkaido, imgHonshu, imgShikoku, imgKyushu;

function preload() {

  imgHokkaido = loadImage("assets/islands/japan_hokkaido.svg");
  imgHonshu   = loadImage("assets/islands/japan_honshu.svg");
  imgShikoku  = loadImage("assets/islands/japan_shikoku.svg");
  imgKyushu   = loadImage("assets/islands/japan_kyushu.svg");

  receiptsData = loadJSON("data/receipts.json?v=" + Date.now());
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);

  if (!Array.isArray(receiptsData)) {
    receiptsData = Object.values(receiptsData);
  }

  totalImages = receiptsData.length;

  for (let r of receiptsData) {
    let path = "assets/receipts/" + r.filename;

    receiptImages[r.id] = loadImage(
      path,
      () => {
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
          ready = true;
        }
      },
      () => console.error("Failed:", path)
    );
  }

  setupIslands();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupIslands();
}

// -----------------------------
// Make Islands + Polygon attach
// -----------------------------

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

// -----------------------------
// Random assignment (test)
// -----------------------------

function assignReceiptsToIslands() {
  for (let r of receiptsData) {
    let idx = floor(random(islands.length));
    islands[idx].receipts.push(r);
  }
}

// -----------------------------
// DRAW
// -----------------------------

function draw() {
  background(20);

  if (!ready) {
    fill(240);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, width / 2, height / 2);
    return;
  }

  // First frame after ready
  if (!assigned) {
    assignReceiptsToIslands();

    for (let isl of islands) {
      computeScalingForIsland(isl);
      applyPriceScaling(isl);
    }

    assigned = true;
  }

  for (let island of islands) {
    drawIslandImage(island);
  }
  
  for (let isl of islands) {
    drawReceiptsInIsland(isl); // 원래의 영수증 배치
  }
}

function drawIslandImage(island) {
  let img;

  if (island.name === "Hokkaido") img = imgHokkaido;
  if (island.name === "Honshu")   img = imgHonshu;
  if (island.name === "Shikoku")  img = imgShikoku;
  if (island.name === "Kyushu")   img = imgKyushu;

  if (!img) return;

  push();
  imageMode(CORNER);
  image(img, island.x, island.y, island.w, island.h);
  pop();
}
  
// -----------------------------
// Receipt Placement (Flow Layout)
// -----------------------------

function drawReceiptsInIsland(island) {
  let list = island.receipts;
  if (list.length === 0) return;

  const padding = 10;
  const maxWidth = island.w - padding * 2;

  // ------ 1. rows split ------
  let rows = [];
  let currentRow = [];
  let currentRowWidth = 0;

  for (let r of list) {
    let w = r.scaledW;
    let nextWidth = currentRowWidth + w + (currentRow.length > 0 ? padding : 0);

    if (nextWidth > maxWidth) {
      rows.push(currentRow);
      currentRow = [r];
      currentRowWidth = w;
    } else {
      currentRow.push(r);
      currentRowWidth = nextWidth;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // ------ 2. row heights ------
  let rowHeights = rows.map(row => {
    let maxH = 0;
    for (let r of row) maxH = max(maxH, r.scaledH);
    return maxH;
  });

  // total height
  let totalHeight = rowHeights.reduce((a, b) => a + b, 0) + padding * (rowHeights.length - 1);

  // vertical centering
  let y = island.y + (island.h - totalHeight) / 2;

  // ------ 3. render rows ------
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let row = rows[rowIndex];
    let maxH = rowHeights[rowIndex];

    // compute row width
    let rowWidth = row.reduce((acc, r, idx) => {
      return acc + r.scaledW + (idx > 0 ? padding : 0);
    }, 0);

    let x = island.x + (island.w - rowWidth) / 2;

    for (let r of row) {
      let img = receiptImages[r.id];
      if (img) image(img, x + r.scaledW/2, y + maxH/2, r.scaledW, r.scaledH);
      x += r.scaledW + padding;
    }

    y += maxH + padding;
  }
}

// -----------------------------
// Click to select island
// -----------------------------

function mousePressed() {
  activeIsland = null;

  for (let isl of islands) {
    if (
      mouseX > isl.x &&
      mouseX < isl.x + isl.w &&
      mouseY > isl.y &&
      mouseY < isl.y + isl.h
    ) {
      activeIsland = isl;
      break;
    }
  }
}

// -----------------------------
// Price-based scaling
// -----------------------------

function computeIslandScaling(island) {
  let list = island.receipts;
  if (!list.length) return;

  let sumPrice = 0;
  for (let r of list) sumPrice += r.price;

  let usableArea = island.w * island.h * 0.6;
  let K = usableArea / sumPrice;

  island.scaleK = K;
}

function applyPriceScaling(island) {
  if (!island.scaleK) return;

  for (let r of island.receipts) {
    let aspect = r.width / r.height;
    let area = r.price * island.scaleK;

    let scaledH = Math.sqrt(area / aspect);
    let scaledW = scaledH * aspect;

    r.scaledW = scaledW;
    r.scaledH = scaledH;
  }
}

function computeScalingForIsland(island) {
  computeIslandScaling(island);
  applyPriceScaling(island);
}
