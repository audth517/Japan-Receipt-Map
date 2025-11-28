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
  imgHokkaido = loadImage("assets/islands/japan_hokkaido.svg?v=" + Date.now());
  imgHonshu   = loadImage("assets/islands/japan_honshu.svg?v=" + Date.now());
  imgShikoku  = loadImage("assets/islands/japan_shikoku.svg?v=" + Date.now());
  imgKyushu   = loadImage("assets/islands/japan_kyushu.svg?v=" + Date.now());

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
  assignReceiptsByCity();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupIslands();
}

function setupIslands() {
  islands = [];

  // 일본 지도 전체 박스 크기
  const mapH = height * 1.10;   // 화면보다 더 크게 (약간 넘나도 괜찮음)
  const mapW = mapH * 0.43;     // 실제 일본 비율에 가까움
  const mapX = (width - mapW) / 2;
  const mapY = height * (-0.05);  // 살짝 위로 올림

  // 혼슈 높이(Honshu 기준)
  const baseHonshuH = mapH * 0.55;

  // 각 섬의 위치 & 혼슈 대비 크기 비율
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
      cities: {}
    });
  }
}

function assignReceiptsByCity() {
  for (let r of receiptsData) {
    // 해당 영수증의 region에 맞는 섬 찾기
    let island = islands.find(i => i.name === r.region);
    if (!island) continue;

    // 도시가 처음 등장한 경우 초기화
    if (!island.cities[r.city]) {
      island.cities[r.city] = [];
    }

    island.cities[r.city].push(r);  // 도시 배열에 push
  }
}

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
  // price scaling은 섬 기준 그대로
    for (let isl of islands) {
      computeIslandScaling(isl);
      applyPriceScaling(isl);
  
      computeCityLayouts(isl);  // 🔥 도시 레이아웃 생성
    }
  
    assigned = true;
  }

  // 섬 그리기
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

function drawCityAreas(island) {
  if (!island.cityAreas) return;

  for (let city in island.cityAreas) {
    const area = island.cityAreas[city];

    push();
    noFill();
    stroke(255, 80);
    rect(area.x, area.y, area.w, area.h);
    pop();

    // 도시 이름 표시
    push();
    noStroke();
    fill(200);
    textSize(12);
    textAlign(LEFT, TOP);
    text(city, area.x + 4, area.y + 4);
    pop();
  }
}

function drawReceiptsInCity(area, receipts) {
  if (receipts.length === 0) return;

  // 기존 row layout 코드 그대로
  // 다만 island.x, island.w 대신 area.x, area.w 사용

  const padding = 10;
  const maxWidth = area.w - padding * 2;

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
  let totalHeight = rowHeights.reduce((a, b) => a + b, 0) + padding * (rowHeights.length - 1);

  let y = area.y + (area.h - totalHeight) / 2;

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let maxH = rowHeights[i];
    let rowWidth = row.reduce((acc, r, idx) => acc + r.scaledW + (idx ? padding : 0), 0);

    let x = area.x + (area.w - rowWidth) / 2;

    for (let r of row) {
      let img = receiptImages[r.id];
      if (img) image(img, x + r.scaledW / 2, y + maxH / 2, r.scaledW, r.scaledH);
      x += r.scaledW + padding;
    }
    y += maxH + padding;
  }
}

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

function computeCityLayouts(island) {
  const cities = Object.keys(island.cities);
  const n = cities.length;
  if (n === 0) return;

  // usable box (섬 안에서 영수증 넣는 영역)
  const ux = island.x + island.w * 0.15;
  const uy = island.y + island.h * 0.10;
  const uw = island.w * 0.70;
  const uh = island.h * 0.80;

  // 각 도시를 수평으로 나눔
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
