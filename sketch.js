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

    for (let isl of islands) {
      computeScalingForIsland(isl);
    }
    
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

  let padding = 10;

  let x = island.x + padding;
  let y = island.y + padding;

  let maxX = island.x + island.w - padding;

  for (let r of list) {
    let img = receiptImages[r.id];
    if (!img) continue;

    let w = r.scaledW;
    let h = r.scaledH;

    // 줄바꿈
    if (x + w > maxX) {
      x = island.x + padding;
      y += h + padding;
    }

    // 그림
    image(img, x + w/2, y + h/2, w, h);

    // 다음 위치로 이동
    x += w + padding;
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
// 가격 기반 스케일링 적용: island 내부에 들어갈 영수증 크기 계산
// ------------------------------------------------------
function computeIslandScaling(island) {
  let list = island.receipts;
  if (list.length === 0) return;

  // 1) price 합
  let sumPrice = 0;
  for (let r of list) sumPrice += r.price;

  // 2) island 사용 가능 면적 (60% 정도만 사용)
  let usableArea = island.w * island.h * 0.6;

  // 3) 스케일링 패러미터 K
  let K = usableArea / sumPrice;

  island.scaleK = K; // 기록 (디버깅용)
}

// ------------------------------------------------------
// island.receipts 안에 scaledW, scaledH 계산하여 저장
// ------------------------------------------------------
function applyPriceScaling(island) {

  if (!island.scaleK) return;

  for (let r of island.receipts) {
    let aspect = r.width / r.height;

    // 목표 면적 = price * K
    let area = r.price * island.scaleK;

    // 실제 w, h 계산
    let scaledH = Math.sqrt(area / aspect);
    let scaledW = scaledH * aspect;

    r.scaledW = scaledW;
    r.scaledH = scaledH;
  }
}

// ------------------------------------------------------
// island 하나에 대해 scaling 계산 전체 실행
// (1) scaling factor 계산 → (2) 각 receipt 크기 적용
// ------------------------------------------------------
function computeScalingForIsland(island) {
  computeIslandScaling(island);
  applyPriceScaling(island);
}
