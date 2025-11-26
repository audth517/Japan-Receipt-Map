let receiptsData = [];
let receiptImages = {};

let imagesLoaded = 0;
let totalImages = 0;
let ready = false;

let islands = [];
let activeIsland = null;

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
// 4개 섬 placeholder 설정 (웹 페이지 크기 변화 대응)
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
    h: hSmall
  });

  islands.push({
    name: "Honshu",
    x: width - w - margin,
    y: margin,
    w: w,
    h: hBig
  });

  islands.push({
    name: "Shikoku",
    x: margin,
    y: height - hSmall - margin,
    w: w * 0.5,
    h: hSmall
  });

  islands.push({
    name: "Kyushu",
    x: width - w * 0.55 - margin,
    y: height - hSmall - margin,
    w: w * 0.55,
    h: hSmall
  });
}

function draw() {
  background(20);

  if (!ready) {
    fill(255);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, width/2, height/2);
    return;
  }

  drawIslands();

  if (activeIsland !== null) {
    drawActiveIslandHighlight();
  }
}

// ------------------------------------------------------
// 섬들 그리기
// ------------------------------------------------------
function drawIslands() {
  textSize(22);
  for (let island of islands) {
    // 박스
    fill(40);
    stroke(120);
    strokeWeight(2);
    rect(island.x, island.y, island.w, island.h, 15);

    // 텍스트
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
  text("Selected → " + isl.name, width/2, 40);
}

// ------------------------------------------------------
// 클릭 이벤트: 어떤 섬 눌렀는지 검사
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
