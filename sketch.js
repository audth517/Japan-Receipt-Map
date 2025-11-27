let receiptsData = [];
let receiptImages = {};

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;

let islands = [];
let activeIsland = null;
let assigned = false;

let shapeHokkaido, shapeHonshu, shapeShikoku, shapeKyushu;

// -----------------------------
// JSON + Image preload
// -----------------------------

async function preloadJSON() {
  const response = await fetch("data/receipts.json?v=" + Date.now());
  const jsonData = await response.json();
  receiptsData = Array.isArray(jsonData) ? jsonData : Object.values(jsonData);
}

async function preload() {
  shapeKyushu   = loadShape("japan_kyushu.svg");
  shapeHokkaido = loadShape("japan_hokkaido.svg");
  shapeShikoku  = loadShape("japan_shikoku.svg");
  shapeHonshu   = loadShape("japan_honshu.svg");
  
  await preloadJSON();

  totalImages = receiptsData.length;

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
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);
  textAlign(CENTER, CENTER);

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
    svg: shapeHokkaido 
  });

  islands.push({
    name: "Honshu",
    x: width - w - margin,
    y: margin,
    w: w,
    h: hBig,
    receipts: [],
    svg: shapeHonshu
  });

  islands.push({
    name: "Shikoku",
    x: margin,
    y: height - hSmall - margin,
    w: w * 0.5,
    h: hSmall,
    receipts: [],
    svg: shapeShikoku
  });

  islands.push({
    name: "Kyushu",
    x: width - w * 0.55 - margin,
    y: height - hSmall - margin,
    w: w * 0.55,
    h: hSmall,
    receipts: [],
    svg: shapeKyushu
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
    fill(255);
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

  drawIslands();

  for (let isl of islands) {
    drawIslandSVG(isl);
  }

  for (let isl of islands) {
    drawReceiptsInIsland(isl);
  }

  if (activeIsland !== null) {
    drawActiveIslandHighlight();
  }
}

function drawIslandSVG(island) {
  if (!island.svg) return;  // 안전

  push();
  translate(island.x, island.y);
  shape(island.svg, 0, 0, island.w, island.h);
  pop();
}

// -----------------------------
// Draw island background
// -----------------------------

function drawIslands() {
  textSize(22);
  for (let island of islands) {
    fill(40);
    stroke(120);
    strokeWeight(2);
    rect(island.x, island.y, island.w, island.h, 15);

    fill(255);
    noStroke();
    text(island.name, island.x + island.w / 2, island.y + island.h / 2);
  }
}

// -----------------------------
// Draw polygon outline (debug)
// -----------------------------

function drawPolygons() {
  for (let island of islands) {
    push();
    translate(island.x, island.y);
    noFill();
    stroke(255, 70);
    strokeWeight(2);
    beginShape();
    for (let p of island.polygon) {
      vertex(p.x * island.w, p.y * island.h);
    }
    endShape(CLOSE);
    pop();
  }
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
