let receiptsData = [];
let receiptImages = {};

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;

let islands = [];
let activeIsland = null;

let assigned = false;

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
function draw() {
  background(20);

  if (!ready) {
    fill(255);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, width / 2, height / 2);
    return;
  }

  // 처음 ready 되는 순간 receipts 분배 + 가격 기반 scaling
  if (!assigned) {
    assignReceiptsToIslands();

    for (let isl of islands) {
      computeScalingForIsland(isl);     // K 계산
      applyPriceScaling(isl);           // scaledW, scaledH 저장
    }

    assigned = true;
  }

  drawIslands();

  // 모든 섬에 자동으로 영수증 표시
  for (let isl of islands) {
    drawReceiptsInIsland(isl);
  }

  // 클릭된 섬 강조 (옵션)
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
// Flow layout로 receipt 배치 (가격 기반 크기 사용)
// ------------------------------------------------------
function drawReceiptsInIsland(island) {
  let list = island.receipts;
  if (list.length === 0) return;

  const padding = 10;

  const maxWidth = island.w - padding * 2;

  // -----------------------------
  // 1) 줄 단위로 receipts를 묶기
  // -----------------------------
  let rows = [];
  let currentRow = [];
  let currentRowWidth = 0;

  for (let r of list) {
    let w = r.scaledW;
    let nextWidth = currentRowWidth + w + (currentRow.length > 0 ? padding : 0);

    // 줄이 넘치면 새 줄 생성
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

  // -----------------------------
  // 2) 각 줄의 max height 계산
  // -----------------------------
  let rowHeights = rows.map(row => {
    let maxH = 0;
    for (let r of row) {
      if (r.scaledH > maxH) maxH = r.scaledH;
    }
    return maxH;
  });

  // 전체 높이
  let totalHeight =
    rowHeights.reduce((a, b) => a + b, 0) +
    padding * (rowHeights.length - 1);

  // island 내부 세로 중앙 정렬
  let startY = island.y + (island.h - totalHeight) / 2;

  // -----------------------------
  // 3) 줄 단위로 중앙 정렬 + 그리기
  // -----------------------------

  let y = startY;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let row = rows[rowIndex];
    let maxH = rowHeights[rowIndex];

    // 줄 폭 계산
    let rowWidth = row.reduce((acc, r, idx) => {
      return acc + r.scaledW + (idx > 0 ? padding : 0);
    }, 0);

    // 가로 가운데 정렬
    let startX = island.x + (island.w - rowWidth) / 2;

    // 그리기
    let x = startX;

    for (let r of row) {
      let img = receiptImages[r.id];

      if (img) image(img, x + r.scaledW / 2, y + maxH / 2, r.scaledW, r.scaledH);

      x += r.scaledW + padding;
    }

    y += maxH + padding;
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

// ------------------------------------------------------
// 가격 기반 스케일링 K 계산
// ------------------------------------------------------
function computeIslandScaling(island) {
  let list = island.receipts;
  if (list.length === 0) return;

  let sumPrice = 0;
  for (let r of list) sumPrice += r.price;

  let usableArea = island.w * island.h * 0.6;  // 60% 사용

  let K = usableArea / sumPrice;

  island.scaleK = K;
}

// ------------------------------------------------------
// scaledW, scaledH 적용
// ------------------------------------------------------
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

// ------------------------------------------------------
// island scaling 전체 실행
// ------------------------------------------------------
function computeScalingForIsland(island) {
  computeIslandScaling(island);
  applyPriceScaling(island);
}
