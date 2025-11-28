// -------------------------------------
// GLOBALS
// -------------------------------------
let receiptsData = null;
let jsonLoaded = false;

let circles = [];
let minPrice = Infinity;
let maxPrice = 0;

//
// City layout (canvas: 1000x600 기준)
// 원하는 값으로 수정 가능
//
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

// 카테고리 색 (focus 모드에서 사용)
const categoryColors = {
  Food: [230, 120, 120],
  Goods: [120, 160, 230],
  CS: [140, 200, 160],
  Transport: [240, 190, 120],
  Service: [190, 140, 220],
  Other: [180, 180, 180]
};

// 상태
let currentMode = "overview"; // "overview" | "city"
let focusedRegion = null;
let focusedCity = null;


// -------------------------------------
// PRELOAD — Safari에서 비동기일 수 있음
// -------------------------------------
function preload() {
  // Safari 대응: loadJSON 대신 fetch 사용
  let url = "data/receipts.json";

  receiptsData = loadJSON(url, 
    (result) => {
      // loadJSON 성공 (Chrome 등)
      receiptsData = result;
      jsonLoaded = true;
      console.log("JSON loaded via loadJSON:", receiptsData);
    },
    (err) => {
      // loadJSON 실패 → Safari fallback
      console.warn("loadJSON failed, trying fetch() fallback", err);

      fetch(url)
        .then(res => res.json())
        .then(json => {
          receiptsData = json;
          jsonLoaded = true;
          console.log("JSON loaded via fetch fallback:", receiptsData);
        })
        .catch(e => {
          console.error("Both loadJSON and fetch failed:", e);
        });
    }
  );
}


// -------------------------------------
// SETUP — Safari 대비 로딩 체크 포함
// -------------------------------------
function setup() {
  createCanvas(1000, 600);

  if (!jsonLoaded) {
    console.warn("JSON not loaded yet. Safari might delay preload()");

    noLoop();

    let interval = setInterval(() => {
      if (jsonLoaded) {
        console.log("JSON arrived after delay (Safari fix). Continue.");
        clearInterval(interval);
        processData();
        loop();
      }
    }, 30);

    return;
  }

  // Chrome/Firefox는 여기 즉시 실행
  processData();
}


// -------------------------------------
// 데이터 처리
// -------------------------------------
function processData() {

  if (!receiptsData) {
    console.error("receiptsData is undefined! JSON not loaded.");
    return;
  }

  // receipts.json의 최상단이 배열이라고 가정
  let arr = receiptsData;

  if (!arr || !Array.isArray(arr)) {
    console.error("Receipts data is not an array:", arr);
    return;
  }

  // 가격 min/max 계산
  for (let r of arr) {
    let p = Number(r.price);
    if (!isNaN(p)) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
  }

  // 개별 receipt → circle 배치
  for (let r of arr) {
    let region = r.region;
    let city = r.city;

    if (!cityLayouts[region] || !cityLayouts[region][city]) {
      console.warn("No layout defined for:", region, city);
      continue;
    }

    let layout = cityLayouts[region][city];
    let pos = randomPointInCircle(layout.x, layout.y, layout.radius);
    let radius = priceToRadius(r.price);

    circles.push({
      id: r.id,
      filename: r.filename,
      region,
      city,
      category: r.category || "Other",
      price: Number(r.price),
      x: pos.x,
      y: pos.y,
      radius,
      raw: r
    });
  }

  console.log("Finished processData(), total circles:", circles.length);
}


// 가격 → 원 크기
function priceToRadius(price) {
  let p = Number(price);
  if (isNaN(p)) p = minPrice;
  if (maxPrice === minPrice) return 12;
  return map(p, minPrice, maxPrice, 6, 28);
}


// 원 내부 랜덤 위치
function randomPointInCircle(cx, cy, r) {
  let angle = random(TWO_PI);
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

  drawCityAreasBase();

  if (currentMode === "overview") {
    drawOverview();
  } else if (currentMode === "city") {
    drawCityFocus();
  }

  drawUI();
}


// city 영역 표시 (디버그 용)
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


// overview 모드
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
      fill(255);
      noStroke();
    }

    ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
  }

  if (hoverIndex !== -1) {
    let c = circles[hoverIndex];
    fill(0);
    textAlign(LEFT, BOTTOM);
    textSize(14);
    text(`${c.region} / ${c.city}\n${c.id} (${c.price}¥)`, 20, height - 20);
  }
}


// city 모드
function drawCityFocus() {
  let hoverIndex = getHoverCircleIndex();

  noStroke();
  for (let c of circles) {
    let isFocusedCity =
      c.region === focusedRegion && c.city === focusedCity;

    if (isFocusedCity) {
      let col = categoryColors[c.category] || categoryColors.Other;
      fill(col[0], col[1], col[2], 230);
    } else {
      fill(255, 80);
    }

    ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
  }

  if (focusedRegion && focusedCity &&
      cityLayouts[focusedRegion] &&
      cityLayouts[focusedRegion][focusedCity]) {
    let layout = cityLayouts[focusedRegion][focusedCity];
    noFill();
    stroke(0, 80);
    strokeWeight(2);
    ellipse(layout.x, layout.y, layout.radius * 2.3, layout.radius * 2.3);
  }

  if (hoverIndex !== -1) {
    let c = circles[hoverIndex];
    fill(0);
    textAlign(LEFT, BOTTOM);
    textSize(14);
    text(`${c.region} / ${c.city}\n${c.id} (${c.price}¥)`, 20, height - 20);
  }
}


// UI 표시
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
      `Focused: ${focusedRegion} / ${focusedCity}  (click background to return)`,
      20,
      46
    );
  }
}


// 마우스 hover index
function getHoverCircleIndex() {
  for (let i = 0; i < circles.length; i++) {
    let c = circles[i];
    let d = dist(mouseX, mouseY, c.x, c.y);
    if (d < c.radius) return i;
  }
  return -1;
}


// 클릭 처리
function mousePressed() {
  if (currentMode === "overview") {
    let idx = getHoverCircleIndex();
    if (idx !== -1) {
      let c = circles[idx];
      focusedRegion = c.region;
      focusedCity = c.city;
      currentMode = "city";
    }
  } else if (currentMode === "city") {
    currentMode = "overview";
    focusedRegion = null;
    focusedCity = null;
  }
}
