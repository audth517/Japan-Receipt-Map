//------------------------------------------------------
// GLOBALS
//------------------------------------------------------
const REGION_NAMES = ["Hokkaido", "Honshu", "Shikoku", "Kyushu"];

const CITIES_BY_REGION = {
  Hokkaido: ["Chitose", "Kamikawa", "Otaru", "Sapporo", "Hakodate"],
  Honshu:   ["Tokyo", "Osaka", "Kyoto"],
  Shikoku:  ["Ehime", "Imabari", "Matsuyama", "Saijo"],
  Kyushu:   ["Fukuoka", "Ukiha"]
};

// CATEGORY COLORS
const CATEGORY_COLORS = {
  "TP": [250, 160, 160],   // Transportation
  "CS": [160, 200, 250],   // Convenience Store
  "RC": [200, 160, 250],   // Restaurant & Cafe
  "TR": [250, 200, 160],   // Tourism
  "GS": [180, 230, 180],   // Goods Shop
};

let TEXT_COL = [55, 52, 49];
let BG_COL = [251, 251, 250];

let japanAspect = 1000 / 1328; // 일본 전체의 가로/세로 비율
let worldScale = 1;
let worldOffsetX = 0;
let worldOffsetY = 0;

let receiptsData = null;
let jsonLoaded = false;

let circles = [];
let minPrice = Infinity;
let maxPrice = 0;

let regionImages = {};
let cityMaskImages = {};
let cityMaskPoints = {};

let currentMode = "overview";   // "overview" → "region" → "city"
let focusedRegion = null;
let focusedCity   = null;

// ★ 더블클릭으로 선택된 영수증
let selectedReceipt = null;
let receiptImages = {};  // filename → { loading, img, error }

let bgCol;
let regionBaseScale = 1;
let monoFont;
let focusedCategory = null;

// Canvas size (참고용 상수)
const CANVAS_W = 1000;
const CANVAS_H = 1000;

// ---------- VIEW / CAMERA ----------
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;

let targetViewScale = 1;
let targetViewOffsetX = 0;
let targetViewOffsetY = 0;

const VIEW_LERP = 0.1;

// region PNG fade-in
let regionFade = 0;
let regionFadeTarget = 0;

// REGION PIXELS
function rectPct(x, y, w, h) {
  return {x, y, w, h};
}

let regionRectsPct_raw = {
  Hokkaido: rectPct(47.5, 0.0, 27.7, 27.8),
  Honshu:   rectPct(7.1,  26.9, 54.6, 55.6),
  Shikoku:  rectPct(13.7, 77.2, 14.4, 11.3),
  Kyushu:   rectPct(0.0,  80.9, 13.9, 19.0)
};

let regionRectsPx = {};


//------------------------------------------------------
// PRELOAD
//------------------------------------------------------
let titleFont;

function preload() {
  monoFont = loadFont("assets/fonts/DepartureMono-Regular.woff");
  titleFont = monoFont;
  
  for (let region of REGION_NAMES) {
    regionImages[region] =
      loadImage(`assets/islands/${region.toLowerCase()}.png`);
  }

  for (let region of REGION_NAMES) {
    cityMaskImages[region] = {};
    for (let city of CITIES_BY_REGION[region]) {
      cityMaskImages[region][city] =
        loadImage(`assets/cities/${region.toLowerCase()}_${city.toLowerCase()}.png`);
    }
  }

  receiptsData = loadJSON(
    "data/receipts.json",
    (result) => { receiptsData = result; jsonLoaded = true; },
    (err) => {
      fetch("data/receipts.json")
        .then(r => r.json())
        .then(json => { receiptsData = json; jsonLoaded = true; });
    }
  );
}


//------------------------------------------------------
// SETUP
//------------------------------------------------------
function setup() {
  let holder = document.getElementById("canvas-holder");
  let canvas = createCanvas(1000, 1200);
  canvas.parent(holder);

  textFont("ReceiptMono");

  // ===== Create category colored lines =====
  const block = document.getElementById("category-lines");
  for (let k in CATEGORY_COLORS) {
    let div = document.createElement("div");
    div.style.width = "80px";
    div.style.height = "4px";
    div.style.background = `rgb(${CATEGORY_COLORS[k][0]},${CATEGORY_COLORS[k][1]},${CATEGORY_COLORS[k][2]})`;
    block.appendChild(div);
  }
}


//------------------------------------------------------
// REGION RECT CALC (SHIFT + SCALE)
//------------------------------------------------------
function prepareRegionRects() {
  // 1) 일본 지도를 "정사각형 좌표계" 안에 그린다고 가정
  //    → 브라우저가 가로든 세로든 크기가 달라져도
  //      base = min(width, height)를 기준으로 동일 비율 유지
  const base = min(width, height);

  // 2) 남는 쪽은 여백으로 두고 가운데 정렬
  const offsetX = (width  - base) / 2;
  const offsetY = (height - base) / 2;

  // 3) regionRectsPct_raw의 x,y,w,h는
  //    0~100% 기준의 "정사각형 공간"이라고 생각하고 환산
  for (let region of REGION_NAMES) {
    const P = regionRectsPct_raw[region];
    if (!P) continue;

    const x = offsetX + base * (P.x / 100);
    const y = offsetY + base * (P.y / 100);
    const w = base * (P.w / 100);
    const h = base * (P.h / 100);

    regionRectsPx[region] = { x, y, w, h };
  }
}

//------------------------------------------------------
// CITY MASK PROCESSING
//------------------------------------------------------
function prepareCityMasks() {
  cityMaskPoints = {};

  for (let region of REGION_NAMES) {
    cityMaskPoints[region] = {};

    for (let city of CITIES_BY_REGION[region]) {
      const img = cityMaskImages[region][city];
      if (!img) continue;

      img.loadPixels();

      const pts = [];
      const iw = img.width;
      const ih = img.height;

      const SAFE_MARGIN = 0.03;
      const safeMinX = iw * SAFE_MARGIN;
      const safeMaxX = iw * (1 - SAFE_MARGIN);
      const safeMinY = ih * SAFE_MARGIN;
      const safeMaxY = ih * (1 - SAFE_MARGIN);

      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          const idx = 4 * (y * iw + x);
          const r = img.pixels[idx];
          const g = img.pixels[idx + 1];
          const b = img.pixels[idx + 2];
          const a = img.pixels[idx + 3];

          if (
            a > 0 &&
            Math.abs(r - 219) < 10 &&
            Math.abs(g - 218) < 10 &&
            Math.abs(b - 217) < 10
          ) {
            if (x > safeMinX && x < safeMaxX &&
                y > safeMinY && y < safeMaxY) {
              pts.push({ xImg: x, yImg: y });
            }
          }
        }
      }

      if (pts.length > 0) cityMaskPoints[region][city] = pts;
    }
  }
}


//------------------------------------------------------
// PROCESS DATA
//------------------------------------------------------
function processData() {
  for (let r of receiptsData) {
    const p = Number(r.price);
    if (p > 0) {
      minPrice = min(minPrice, p);
      maxPrice = max(maxPrice, p);
    }
  }

  circles = [];

  for (let r of receiptsData) {
    const region = r.region;
    const city = r.city;
    const rr = regionRectsPx[region];
    const pts = cityMaskPoints?.[region]?.[city];

    if (!rr) continue;

    let xScreen, yScreen;

    if (pts && pts.length > 0) {
      const img = cityMaskImages[region][city];
      const iw = img.width;
      const ih = img.height;

      const centerPts = pts.filter(p => {
        const dx = p.xImg - iw/2;
        const dy = p.yImg - ih/2;
        return dx*dx + dy*dy < (iw*ih)*0.15;
      });

      const pick = (centerPts.length > 20 ? random(centerPts) : random(pts));

      xScreen = rr.x + (pick.xImg / iw) * rr.w;
      yScreen = rr.y + (pick.yImg / ih) * rr.h;
    } else {
      // fallback: 섬 내부 random
      xScreen = random(rr.x, rr.x + rr.w);
      yScreen = random(rr.y, rr.y + rr.h);
    }

    circles.push({
      id: r.id,
      filename: r.filename,
      region,
      city,
      category: r.category || "Other",
      price: Number(r.price),
      x: xScreen,
      y: yScreen,
      radius: priceToRadius(Number(r.price))
    });
  }
}


//------------------------------------------------------
// PRICE → RADIUS
//------------------------------------------------------
function priceToRadius(price) {
  const p = max(1, price);
  const logMin = Math.log(minPrice);
  const logMax = Math.log(maxPrice);
  const logP = Math.log(p);
  return map(logP, logMin, logMax, 0.003, 5);
}


//------------------------------------------------------
// VIEW CONTROL
//------------------------------------------------------
function resetView() {
  const box = getJapanBounds();

  // ★ 처음 지도 더 크게: margin을 0.05로 줄여서 화면을 더 꽉 채우게
  const margin = 0.05;
  const availW = width  * (1 - margin * 2);
  const availH = height * (1 - margin * 2);

  // 전체 일본 지도가 화면에 맞게 자동 스케일
  const s = min(availW / box.w, availH / box.h);

  viewScale = s;
  targetViewScale = s;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  // 중앙 정렬
  viewOffsetX = width  / 2 - s * cx;
  viewOffsetY = height / 2 - s * cy;

  targetViewOffsetX = viewOffsetX;
  targetViewOffsetY = viewOffsetY;
}

function zoomToRegion(region) {
  const rr = regionRectsPx[region];
  if (!rr) return;

  const marginRatio = 0.15;
  const availW = width  * (1 - 2 * marginRatio);
  const availH = height * (1 - 2 * marginRatio);

  const s = min(availW / rr.w, availH / rr.h);
  targetViewScale = s;

  const cx = rr.x + rr.w / 2;
  const cy = rr.y + rr.h / 2;

  targetViewOffsetX = width  / 2 - s * cx;
  targetViewOffsetY = height / 2 - s * cy;

  regionFade = 0;
  regionFadeTarget = 1;

  regionBaseScale = s;
}

// 🔸 city bounding box
function getCityBounds(region, city) {
  const filtered = circles.filter(c => c.region === region && c.city === city);
  if (filtered.length === 0) return null;

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (let c of filtered) {
    minX = min(minX, c.x);
    minY = min(minY, c.y);
    maxX = max(maxX, c.x);
    maxY = max(maxY, c.y);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

// 🔸 city 확대
function zoomToCity(region, city) {
  const box = getCityBounds(region, city);
  if (!box) return;

  const margin = 0.15;
  const availW = width  * (1 - margin * 2);
  const availH = height * (1 - margin * 2);

  const rawScale = min(availW / box.w, availH / box.h);
  const minScale = regionBaseScale;          
  const maxScale = regionBaseScale * 3.2;    
  const s = constrain(rawScale, minScale, maxScale);
  targetViewScale = s;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  targetViewOffsetX = width  / 2 - s * cx;
  targetViewOffsetY = height / 2 - s * cy;

  regionFade = 1;
  regionFadeTarget = 1;
}

function updateView() {
  viewScale = lerp(viewScale, targetViewScale, VIEW_LERP);
  viewOffsetX = lerp(viewOffsetX, targetViewOffsetX, VIEW_LERP);
  viewOffsetY = lerp(viewOffsetY, targetViewOffsetY, VIEW_LERP);
  regionFade = lerp(regionFade, regionFadeTarget, 0.08);
}

function screenToWorld(mx, my) {
  return {
    x: (mx - viewOffsetX) / viewScale,
    y: (my - viewOffsetY) / viewScale
  };
}


//------------------------------------------------------
// DRAW
//------------------------------------------------------
function draw() {
  background(bgCol);
  background(BG_COL);
  updateView();

  push();
  translate(viewOffsetX, viewOffsetY);
  scale(viewScale);

  drawRegions();

  // ★ hover 텍스트는 완전히 제거
  // 원 그리기 & 연결선만 사용

  if (currentMode === "overview") {
    drawOverview();
  } else if (currentMode === "region") {
    drawRegionFocus();
  } else {
    drawCityFocus();
  }

  pop();

  // ★ 선택된 영수증 디테일 패널
  drawDetailPanel();

  // UI 텍스트
  drawUI();
}


//------------------------------------------------------
// DRAW REGIONS (PNG)
//------------------------------------------------------
function drawRegions() {
  if (currentMode === "overview") return;  // 초기에는 숨김

  drawingContext.globalAlpha = regionFade;

  imageMode(CORNER);
  for (let region of REGION_NAMES) {
    const img = regionImages[region];
    const rr = regionRectsPx[region];

    if (img && rr) {
      image(img, rr.x, rr.y, rr.w, rr.h);
    }
  }

  drawingContext.globalAlpha = 1;
}


//------------------------------------------------------
// CONNECTION LINE (CONSTELLATION)
//------------------------------------------------------
function drawConnections(circleList) {
  if (!circleList || circleList.length < 2) return;

  const rawCircles = circleList.map(obj => obj.c);

  let cx = 0, cy = 0;
  for (let c of rawCircles) {
    cx += c.x;
    cy += c.y;
  }
  cx /= rawCircles.length;
  cy /= rawCircles.length;

  let pts = rawCircles.map(c => ({
    c,
    ang: atan2(c.y - cy, c.x - cx)
  }));

  pts.sort((a, b) => a.ang - b.ang);

  const alpha = 100 + 60 * sin(frameCount * 0.06);

  const cat = pts[0].c.category;
  const col = CATEGORY_COLORS[cat] || [230, 220, 250];

  stroke(col[0], col[1], col[2], alpha);
  strokeWeight(1.0);
  noFill();

  beginShape();
  for (let p of pts) {
    vertex(p.c.x, p.c.y);
  }
  vertex(pts[0].c.x, pts[0].c.y);
  endShape();
}

//------------------------------------------------------
// OVERVIEW
//------------------------------------------------------
function drawOverview() {
  const idx = getHoverCircleIndex();
  let hoverRegion = null;

  if (idx !== -1) hoverRegion = circles[idx].region;

  if (hoverRegion) {
    const regionCircles = circles.filter(c => c.region === hoverRegion);

    drawConnections(regionCircles.map(c => ({ c })));
  }

  noStroke();
  for (let c of circles) {
    if (hoverRegion && c.region === hoverRegion)
      fill(254, 251, 247, 230);
    else
      fill(254, 251, 247, 130);

    ellipse(c.x, c.y, c.radius * 2.0);
  }
}

//------------------------------------------------------
// REGION FOCUS (region 전체 보기)
//------------------------------------------------------
function drawRegionFocus() {
  if (!focusedRegion) return;

  const idx = getHoverCircleIndex();
  if (idx !== -1) {
    const hovered = circles[idx];

    if (hovered.region === focusedRegion) {
      const sameCity = circles.filter(
        c => c.region === focusedRegion && c.city === hovered.city
      );

      drawConnections(sameCity.map(c => ({ c })));
    }
  }

  noStroke();
  for (let c of circles) {
    if (c.region === focusedRegion)
      fill(254, 251, 247, 230);
    else
      fill(254, 251, 247, 40);

    ellipse(c.x, c.y, c.radius * 2);
  }
}

//------------------------------------------------------
// CITY FOCUS (city)
//------------------------------------------------------
function drawCityFocus() {
  if (!focusedRegion || !focusedCity) return;

  const idx = getHoverCircleIndex();

  if (focusedCategory) {
    // category 연결
    const sameCat = circles.filter(
      c => c.region === focusedRegion &&
           c.city === focusedCity &&
           c.category === focusedCategory
    );
    drawConnections(sameCat.map(c => ({ c })));
  } 
  else if (idx !== -1) {
  }

  noStroke();
  for (let c of circles) {
    if (c.region === focusedRegion && c.city === focusedCity) {
      fill(254, 251, 247, 230);
    } else {
      fill(254, 251, 247, 30);
    }
    ellipse(c.x, c.y, c.radius * 2.0);
  }
}

//------------------------------------------------------
// DETAIL PANEL (선택된 영수증)
//------------------------------------------------------
function drawDetailPanel() {
  if (!selectedReceipt) return;

  const pad = 16;
  const panelW = min(width - 40, 720);
  const panelH = min(height - 80, 260);
  const x0 = 20;
  const y0 = height - panelH - 20;  // 화면 아래쪽에 붙이기
  const corner = 10;

  // 패널 배경
  noStroke();
  fill(20, 210); // 약간 어두운 반투명
  rect(x0, y0, panelW, panelH, corner);

  // 좌우 영역 나누기 (왼쪽: 이미지, 오른쪽: 텍스트)
  const midX = x0 + panelW * 0.45;

  // --- 왼쪽: 이미지 ---
  const key = selectedReceipt.filename || selectedReceipt.id;
  let holder = key ? receiptImages[key] : null;

  // 이미지 상태에 따라 텍스트
  fill(240);
  textAlign(CENTER, CENTER);
  textSize(12);

  const imgBoxX = x0 + pad;
  const imgBoxY = y0 + pad;
  const imgBoxW = panelW * 0.45 - pad * 2;
  const imgBoxH = panelH - pad * 2;

  if (!holder) {
    text("Double-clicked receipt image\nwill load here.", 
         imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2);
  } else if (holder.loading) {
    text("Loading image...", 
         imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2);
  } else if (holder.error || !holder.img) {
    text("Failed to load image.", 
         imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2);
  } else {
    // 이미지 그리기 (비율 유지해서 fit)
    imageMode(CENTER);
    const img = holder.img;
    const imgRatio = img.width / img.height;
    let w = imgBoxW;
    let h = w / imgRatio;
    if (h > imgBoxH) {
      h = imgBoxH;
      w = h * imgRatio;
    }
    image(img, imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2, w, h);
  }

  // --- 오른쪽: 텍스트 정보 ---
  textAlign(LEFT, TOP);
  textSize(13);

  const tx = midX + pad;
  const ty = y0 + pad;

  let lines = [];
  lines.push(`ID: ${selectedReceipt.id}`);
  lines.push(`Region: ${selectedReceipt.region}`);
  lines.push(`City: ${selectedReceipt.city}`);
  lines.push(`Category: ${selectedReceipt.category}`);
  lines.push(`Price: ¥${selectedReceipt.price}`);
  if (selectedReceipt.filename) {
    lines.push(`File: ${selectedReceipt.filename}`);
  }

  let yy = ty;
  for (let s of lines) {
    text(s, tx, yy);
    yy += 18;
  }

  textSize(11);
  fill(200);
  text("Tip: Double-click another circle to switch.\nDouble-click empty space to close.",
       tx, y0 + panelH - pad - 32);
}


//------------------------------------------------------
// UI TEXT
//------------------------------------------------------
function drawUI() {
  fill(254, 251, 247);
  noStroke();

  textAlign(LEFT, TOP);
  textSize(20);

  text("Japan Receipts Map", 20, 20);

  textSize(13);

  if (currentMode === "overview") {
    text(
      "Hover: see region constellation\n" +
      "Click circle: zoom into region\n" +
      "Double-click circle: show receipt detail",
      20, 48
    );
  } else if (currentMode === "region") {
    text(
      "Click circle: zoom into city\n" +
      "Click empty: back to overview\n" +
      "Double-click circle: show receipt detail",
      20, 48
    );
  } else if (currentMode === "city") {
    text(
      "Click another city circle: jump\n" +
      "Click empty: back to region\n" +
      "Double-click circle: show receipt detail",
      20, 48
    );
  }
}

//------------------------------------------------------
// HOVER DETECTION (WORLD COORD)
//------------------------------------------------------
function getHoverCircleIndex() {
  const w = screenToWorld(mouseX, mouseY);

  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];
    if (dist(w.x, w.y, c.x, c.y) < c.radius * 1.4)
      return i;
  }
  return -1;
}


//------------------------------------------------------
// MOUSE INTERACTION
//------------------------------------------------------
function mousePressed() {
  const idx = getHoverCircleIndex();
  if (idx === -1) selectedReceipt = null;

  if (currentMode === "overview") {
    if (idx !== -1) {
      const clicked = circles[idx];
      focusedRegion = clicked.region;
      focusedCity = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
    }
    return;
  }

  if (currentMode === "region") {
    if (idx === -1) {
      // 빈 공간: overview로
      currentMode = "overview";
      focusedRegion = null;
      focusedCity = null;
      resetView();
      regionFade = 0;
      regionFadeTarget = 0;
      return;
    }

    const clicked = circles[idx];

    if (clicked.region !== focusedRegion) {
      // 다른 region 클릭 → 그 region으로 점프
      focusedRegion = clicked.region;
      focusedCity = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
      return;
    }

    // 같은 region → city 확대
    focusedRegion = clicked.region;
    focusedCity = clicked.city;
    currentMode = "city";
    zoomToCity(focusedRegion, focusedCity);
    return;
  }

  if (currentMode === "city") {
    if (idx === -1) {
      focusedCategory = null;
      focusedCity = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
      return;
    }
  
    const clicked = circles[idx];
  
    if (clicked.city !== focusedCity) {
      // 다른 city로 이동
      focusedCity = clicked.city;
      focusedCategory = null;
      currentMode = "city";
      zoomToCity(focusedRegion, focusedCity);
      return;
    }
  
    // ★ 같은 city 클릭 = category constellation 토글
    if (focusedCategory === clicked.category) {
      focusedCategory = null;
    } else {
      focusedCategory = clicked.category;
    }
  
    return;
  }
}

// ★ 더블클릭: 영수증 디테일 패널 열기/닫기
function doubleClicked() {
  const idx = getHoverCircleIndex();

  if (idx === -1) {
    // 빈 공간 더블클릭 → 패널 닫기
    selectedReceipt = null;
    return false;
  }

  const r = circles[idx];
  selectedReceipt = r;

  const key = r.filename || r.id;
  if (key && !receiptImages[key]) {
    // 이미지 로딩 시작
    receiptImages[key] = { loading: true, img: null, error: false };
    const path = `assets/receipts/${r.filename}`;

    loadImage(
      path,
      (img) => {
        receiptImages[key] = { loading: false, img, error: false };
      },
      (err) => {
        console.error("Failed to load receipt image:", path);
        receiptImages[key] = { loading: false, img: null, error: true };
      }
    );
  }

  // 브라우저에서 기본 더블클릭 동작 막기
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  prepareRegionRects(); 
  resetView();
}


//------------------------------------------------------
// 전체 일본 영역 bounding box
//------------------------------------------------------
function getJapanBounds() {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (let region of REGION_NAMES) {
    const rr = regionRectsPx[region];
    if (!rr) continue;

    minX = min(minX, rr.x);
    minY = min(minY, rr.y);
    maxX = max(maxX, rr.x + rr.w);
    maxY = max(maxY, rr.y + rr.h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}


//------------------------------------------------------
// (예전 버전에서 쓰던) 섬+지역+분류+가격 마우스 hover 그리기
// 지금은 사용 안 함, hover 제거
//------------------------------------------------------
function drawReceiptsInCity(area, receipts) {
  for (let r of receipts) {
    let x = r.x;
    let y = r.y;

    let side = r.size;  // 기존 radius 기반 → side length

    fill(r.color);
    noStroke();
    rectMode(CENTER);
    square(x, y, side);

    if (mouseX > x - side/2 &&
        mouseX < x + side/2 &&
        mouseY > y - side/2 &&
        mouseY < y + side/2) {
      hoveredReceipt = r;
    }
  }
}
