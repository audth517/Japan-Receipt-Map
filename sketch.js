// GLOBAL VARIABLES ---------------------------------------- 
let receiptsData = [];
let receiptImages = {};

let islands = [];
let activeIsland = null;

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;
let assigned = false;

let imgHokkaido, imgHonshu, imgShikoku, imgKyushu;

// PRELOAD ---------------------------------------- 
function preload() {

  // 섬 SVG 파일 ---------------------------------------- 
  imgHokkaido = loadImage("assets/islands/japan_hokkaido.png");
  imgHonshu   = loadImage("assets/islands/japan_honshu.png");
  imgShikoku  = loadImage("assets/islands/japan_shikoku.png");
  imgKyushu   = loadImage("assets/islands/japan_kyushu.png");

  // JSON 로딩
  receiptsData = loadJSON("data/receipts.json?v=" + Date.now());
}

// SETUP ---------------------------------------- 
function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);

  // JSON이 배열이 아닐 때 ---------------------------------------- 
  if (!Array.isArray(receiptsData)) {
    receiptsData = Object.values(receiptsData);
  }

  totalImages = receiptsData.length;

  // 영수증 이미지 로딩 ---------------------------------------- 
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
  assignReceiptsByCity();

  console.log("Honshu:", imgHonshu.width, imgHonshu.height);
  console.log("Hokkaido:", imgHokkaido.width, imgHokkaido.height);
  console.log("Shikoku:", imgShikoku.width, imgShikoku.height);
  console.log("Kyushu:", imgKyushu.width, imgKyushu.height);
}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupIslands();
  assignReceiptsByCity();

  for (let isl of islands) {
    computeCityLayouts(isl);
  }
}

// 섬 레이아웃 설정 ---------------------------------------- 
function setupIslands() {
  islands = [];

  const mapH = height * 1.10;
  const mapW = mapH * 0.43;
  const mapX = (width - mapW) / 2;
  const mapY = height * (-0.05);

  const baseHonshuH = mapH * 0.55;

  const defs = {
    Honshu:   { dx: 0.47, dy: 0.54, hRatio: 0.7 },
    Hokkaido: { dx: 0.90, dy: 0.25, hRatio: 0.364 },
    Shikoku:  { dx: 0.26, dy: 0.74, hRatio: 0.161 },
    Kyushu:   { dx: 0.01, dy: 0.79, hRatio: 0.259 }
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

    const islandH = baseHonshuH * d.hRatio;
    const islandW = islandH * (img.width / img.height); // width/height 0 문제는 별도 처리 필요

    const cx = mapX + mapW * d.dx;
    const cy = mapY + mapH * d.dy;

    islands.push({
      name,
      x: cx - islandW / 2,
      y: cy - islandH / 2,
      w: islandW,
      h: islandH,
      receipts: [],
      cities: {}
    });
  }
}

// 영수증을 섬과 도시별로 분류 ---------------------------------------- 
function assignReceiptsByCity() {

  for (let isl of islands) {
    isl.receipts = [];
    isl.cities = {};
  }

  for (let r of receiptsData) {
    let island = islands.find(i => i.name === r.region);
    if (!island) continue;

    island.receipts.push(r);

    if (!island.cities[r.city]) island.cities[r.city] = [];
    island.cities[r.city].push(r);
  }
}

// DRAW ---------------------------------------- 
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

  if (!assigned) {
    for (let isl of islands) {
      computeIslandScaling(isl);
      applyPriceScaling(isl);
      computeCityLayouts(isl);
    }
    assigned = true;
  }

  for (let island of islands) {
    drawIslandImage(island);
    drawCityAreas(island);
  }

  for (let isl of islands) {
    if (!isl.cityAreas) continue;

    for (let city in isl.cityAreas) {
      let area = isl.cityAreas[city];
      let receipts = isl.cities[city];
      drawReceiptsInCity(area, receipts);
    }
  }
}

// 섬 이미지 그리기 ---------------------------------------- 
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

// 도시 영역 그리기 ---------------------------------------- 
function drawCityAreas(island) {
  if (!island.cityAreas) return;

  for (let city in island.cityAreas) {
    const area = island.cityAreas[city];

    push();
    noFill();
    stroke(255, 80);
    rect(area.x, area.y, area.w, area.h);
    pop();

    push();
    noStroke();
    fill(200);
    textSize(12);
    textAlign(LEFT, TOP);
    text(city, area.x + 4, area.y + 4);
    pop();
  }
}

// 도시별 영수증 배치하기 ---------------------------------------- 
function drawReceiptsInCity(area, receipts) {
  if (receipts.length === 0) return;

  const padding = 10;
  const maxWidth = area.w - padding * 2;
  let maxReceiptW = 0;
  let maxReceiptH = 0;
  for (let r of receipts) {
    maxReceiptW = max(maxReceiptW, r.scaledW);
    maxReceiptH = max(maxReceiptH, r.scaledH);
  }

  let targetW = area.w * 0.90;  
  let targetH = area.h * 0.80;  

  let scaleFactor = min(targetW / maxReceiptW, targetH / maxReceiptH, 1);

  if (scaleFactor < 1) {
    for (let r of receipts) {
      r.scaledW *= scaleFactor;
      r.scaledH *= scaleFactor;
    }
  }
  
  let rows = [];
  let currentRow = [];
  let currentWidth = 0;

  for (let r of receipts) {
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
  let totalHeight =
    rowHeights.reduce((a, b) => a + b, 0) + padding * (rowHeights.length - 1);

  let y = area.y + (area.h - totalHeight) / 2;

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let maxH = rowHeights[i];
    let rowWidth = row.reduce(
      (acc, r, idx) => acc + r.scaledW + (idx ? padding : 0),
      0
    );

    let x = area.x + (area.w - rowWidth) / 2;

    for (let r of row) {
      let img = receiptImages[r.id];
      if (img) image(img, x + r.scaledW / 2, y + maxH / 2, r.scaledW, r.scaledH);
      x += r.scaledW + padding;
    }
    y += maxH + padding;
  }
}

// 가격 기반 스케일 계산 ---------------------------------------- 
function computeIslandScaling(island) {
  let sum = 0;
  for (let r of island.receipts) sum += r.price;

  island.scaleK = (island.w * island.h * 0.05) / sum;
}

// 영수증 스케일 적용 ---------------------------------------- 
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

// 도시 레이아웃 ---------------------------------------- 
function computeCityLayouts(island) {
  const cities = Object.keys(island.cities);
  const n = cities.length;
  if (n === 0) return;

  const ux = island.x + island.w * 0.15;
  const uy = island.y + island.h * 0.10;
  const uw = island.w * 0.70;
  const uh = island.h * 0.80;

  const cityH = uh / n;

  island.cityAreas = {};

  for (let i = 0; i < n; i++) {
    let city = cities[i];
    island.cityAreas[city] = {
      x: ux,
      y: uy + cityH * i,
      w: uw,
      h: cityH
    };
  }
}
