// -------------------------------------
// GLOBALS
// -------------------------------------
let receiptsData;
let circles = [];       // 화면에 찍힐 영수증 동그라미들
let minPrice = Infinity;
let maxPrice = 0;

// city 영역(일본 지도 위 좌표)
// 캔버스: 1000 x 600 기준으로 대략 배치
const cityLayouts = {
  Hokkaido: {
    Sapporo: { x: 300, y: 150, radius: 80 },
    Chitose: { x: 380, y: 220, radius: 60 },
    Hakodate: { x: 350, y: 320, radius: 60 }
  },
  Honshu: {
    Tokyo: { x: 650, y: 250, radius: 90 },
    Osaka: { x: 580, y: 350, radius: 80 },
    Nagoya: { x: 610, y: 300, radius: 70 }
  },
  Shikoku: {
    Takamatsu: { x: 540, y: 420, radius: 60 }
  },
  Kyushu: {
    Fukuoka: { x: 420, y: 420, radius: 80 },
    Kagoshima: { x: 430, y: 500, radius: 70 }
  }
};

// 카테고리별 색 (V2에서 확대 모드 용)
const categoryColors = {
  Food:   [230, 120, 120],
  Goods:  [120, 160, 230],
  CS:     [140, 200, 160],
  Transport: [240, 190, 120],
  Service:   [190, 140, 220],
  Other:  [180, 180, 180]
};

// 상태
let currentMode = "overview";   // "overview" | "city"
let focusedRegion = null;
let focusedCity = null;

// -------------------------------------
// PRELOAD
// -------------------------------------
function preload() {
  // receipts.json 로딩
  receiptsData = loadJSON("data/receipts.json");
}

// -------------------------------------
// SETUP
// -------------------------------------
function setup() {
  createCanvas(1000, 600);
  processData();
}

// -------------------------------------
// DATA 처리: receipts -> circles
// -------------------------------------
function processData() {
  let arr = receiptsData.receipts || receiptsData;

  // 1) price min/max 계산
  for (let r of arr) {
    let p = Number(r.price);
    if (!isNaN(p)) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
  }
  if (!isFinite(minPrice) || !isFinite(maxPrice)) {
    minPrice = 100;
    maxPrice = 10000;
  }

  // 2) 각각의 receipt를 city 영역 안에 랜덤 위치로 배치
  for (let r of arr) {
    let region = r.region;
    let city = r.city;

    if (!cityLayouts[region] || !cityLayouts[region][city]) {
      // 정의 안 된 도시면 일단 스킵 (필요하면 console로 찍어서 보정)
      console.warn("No layout defined for:", region, city);
      continue;
    }

    let layout = cityLayouts[region][city];
    let pos = randomPointInCircle(layout.x, layout.y, layout.radius);
    let radius = priceToRadius(r.price);

    circles.push({
      id: r.id,
      region: region,
      city: city,
      category: r.category || "Other",
      price: Number(r.price),
      x: pos.x,
      y: pos.y,
      radius: radius,
      raw: r  // 나중에 상세 정보 쓸 때 사용
    });
  }
}

// 가격 → 원 크기
function priceToRadius(price) {
  let p = Number(price);
  if (isNaN(p)) p = minPrice;
  if (maxPrice === minPrice) return 12;
  return map(p, minPrice, maxPrice, 6, 28);
}

// 원 안 랜덤 좌표
function randomPointInCircle(cx, cy, r) {
  let angle = random(TWO_PI);
  // 균등 분포를 위해 sqrt 사용
  let distRadius = r * sqrt(random());
  let x = cx + cos(angle) * distRadius;
  let y = cy + sin(angle) * distRadius;
  return { x, y };
}

// -------------------------------------
// DRAW
// -------------------------------------
function draw() {
  background(245);

  // 약하게 "일본 실루엣" 역할을 하는 city 영역 뒷배경 (debug 겸)
  drawCityAreasBase();

  if (currentMode === "overview") {
    drawOverview();
  } else if (currentMode === "city") {
    drawCityFocus();
  }

  drawUI();
}

// city 영역을 살짝 보여주는 (지금은 debug용) 원들
function drawCityAreasBase() {
  noFill();
  stroke(220);
  strokeWeight(1);

  for (let region in cityLayouts) {
    for (let city in cityLayouts[region]) {
      let c = cityLayouts[region][city];
      ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
    }
  }
}

// OVERVIEW 모드: 모든 영수증 원 = 흰색
function drawOverview() {
  noStroke();
  let hoverIndex = getHoverCircleIndex();

  for (let i = 0; i < circles.length; i++) {
    let c = circles[i];

    if (i === hoverIndex) {
      fill(255);
      stroke(0);
      strokeWeight(2);
    } else {
      noStroke();
      fill(255);
    }

    ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
  }

  if (hoverIndex !== -1) {
    let c = circles[hoverIndex];
    fill(0);
    noStroke();
    textAlign(LEFT, BOTTOM);
    textSize(14);
    text(`${c.region} / ${c.city}\n${c.id} (${c.price}¥)`, 20, height - 20);
  }
}

// CITY focus 모드: 해당 city만 컬러, 나머지는 흐리게
function drawCityFocus() {
  let hoverIndex = getHoverCircleIndex();

  // 1) 전체 dim 처리
  noStroke();
  for (let c of circles) {
    let isFocusedCity =
      c.region === focusedRegion && c.city === focusedCity;

    if (isFocusedCity) {
      // city의 원은 category 색
      let col = categoryColors[c.category] || categoryColors.Other;
      fill(col[0], col[1], col[2], 230);
    } else {
      // 나머지는 흐리게
      fill(255, 80);
    }

    ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
  }

  // 2) city 영역 강조
  if (focusedRegion && focusedCity &&
      cityLayouts[focusedRegion] &&
      cityLayouts[focusedRegion][focusedCity]) {
    let layout = cityLayouts[focusedRegion][focusedCity];
    noFill();
    stroke(0, 80);
    strokeWeight(2);
    ellipse(layout.x, layout.y, layout.radius * 2.3, layout.radius * 2.3);
  }

  // 3) hover 정보 (focus 상태에서도)
  if (hoverIndex !== -1) {
    let c = circles[hoverIndex];
    fill(0);
    noStroke();
    textAlign(LEFT, BOTTOM);
    textSize(14);
    text(`${c.region} / ${c.city}\n${c.id} (${c.price}¥)`, 20, height - 20);
  }
}

// 공통 UI (왼쪽 위 제목, city focus 텍스트 등)
function drawUI() {
  fill(0);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(18);
  text("Japan Receipts – Circle Map (V1)", 20, 20);

  textSize(14);
  if (currentMode === "overview") {
    text("Click a circle to focus on that city.", 20, 46);
  } else if (currentMode === "city") {
    text(
      `Focused: ${focusedRegion} / ${focusedCity}  (click background to go back)`,
      20,
      46
    );
  }
}

// -------------------------------------
// INTERACTION
// -------------------------------------

// 마우스가 올라간 circle index
function getHoverCircleIndex() {
  let hoverIndex = -1;
  for (let i = 0; i < circles.length; i++) {
    let c = circles[i];
    let d = dist(mouseX, mouseY, c.x, c.y);
    if (d < c.radius) {
      hoverIndex = i;
      break;
    }
  }
  return hoverIndex;
}

function mousePressed() {
  if (currentMode === "overview") {
    let idx = getHoverCircleIndex();
    if (idx !== -1) {
      // 해당 circle의 region/city로 focus
      let c = circles[idx];
      focusedRegion = c.region;
      focusedCity = c.city;
      currentMode = "city";
    }
  } else if (currentMode === "city") {
    // city 모드에서 아무데나 클릭하면 overview로 복귀
    currentMode = "overview";
    focusedRegion = null;
    focusedCity = null;
  }
}
