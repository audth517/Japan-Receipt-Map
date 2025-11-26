let receiptsData = [];
let receiptImages = {};

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;

let islands = [];
let activeIsland = null;

// receipt thumbnail size (grid)
let thumbW = 120;
let thumbH = 160;

async function preloadJSON() {
  const response = await fetch("data/receipts.json?v=" + Date.now());
  const jsonData = await response.json();
  receiptsData = Array.isArray(jsonData) ? jsonData : Object.values(jsonData);
}

async function preload() {
  await preloadJSON();

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

// ------------------------------------------------------
// 4개 섬 placeholder 설정
// ------------------------------------------------------
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
    receipts: []
  });

  islands.push({
    name: "Honshu",
    x: width - w - margin,
    y: margin,
    w: w,
    h: hBig,
    receipts: []
  });

  islands.push({
    name: "Shikoku",
    x: margin,
    y: height - hSmall - margin,
    w: w * 0.5,
    h: hSmall,
    receipts: []
  });

  islands.push({
    name: "Kyushu",
    x: width - w * 0.55 - margin,
    y: height - hSmall - margin,
    w: w * 0.55,
    h: hSmall,
    receipts: []
  });
}

// ------------------------------------------------------
// 테스트용: receipts를 랜덤 island에 분배
// 나중에 실제 지역별로 매칭 가능
// ------------------------------------------------------
function assignReceiptsToIslands() {
  for (let r of receiptsData) {
    let idx = floor(random(islands.length));
    islands[idx].receipts.push(r);
  }
}

// ------------------------------------------------------
// DRAW
// ------------------------------------------------------
let assigned = false;

function draw() {
  background(20);

  if (!ready) {
    fill(255);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, width / 2, height / 2);
    return;
  }

  // 처음 ready 되는 순간 receipts 분배
  if (!assigned) {
    assignReceiptsToIslands();
    assigned = true;
  }

  drawIslands();

  // 🔥 클릭 여부 상관없이 모든 섬에 영수증 표시
  for (let isl of islands) {
    drawReceiptsInIsland(isl);
  }

  // 선택된 섬 강조는 남겨도 되고 지워도 됨
  if (activeIsland !== null) {
    drawActiveIslandHighlight();
  }
}

// ------------------------------------------------------
// 섬 그리기
// ------------------------------------------------------
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

// ------------------------------------------------------
// 선택된 섬 강조
// ------------------------------------------------------
function drawActiveIslandHighlight() {
  let isl = activeIsland;

  stroke(0, 255, 0);
  strokeWeight(4);
  noFill();
  rect(isl.x, isl.y, isl.w, isl.h, 15);

  fill(255);
  noStroke();
  textSize(18);
  text("Selected → " + isl.name, width / 2, 40);
}

// ------------------------------------------------------
// Grid layout로 receipt 배치
// ------------------------------------------------------
function drawReceiptsInIsland(island) {
  let list = island.receipts;
  if (list.length === 0) return;

  let cols = floor(island.w / (thumbW + 10));
  cols = max(cols, 1);

  let rows = ceil(list.length / cols);

  let totalW = cols * (thumbW + 10);
  let totalH = rows * (thumbH + 10);

  let startX = island.x + (island.w - totalW) / 2 + thumbW / 2;
  let startY = island.y + (island.h - totalH) / 2 + thumbH / 2;

  let i = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (i >= list.length) return;

      let receipt = list[i];
      let img = receiptImages[receipt.id];

      let cx = startX + c * (thumbW + 10);
      let cy = startY + r * (thumbH + 10);

      if (img) image(img, cx, cy, thumbW, thumbH);

      i++;
    }
  }
}

// ------------------------------------------------------
// 클릭 이벤트
// ------------------------------------------------------
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
