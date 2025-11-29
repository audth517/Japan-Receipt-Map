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

let receiptsData = null;
let jsonLoaded = false;

let circles = [];
let minPrice = Infinity;
let maxPrice = 0;

let regionImages = {};
let cityMaskImages = {};
let cityMaskPoints = {};

let currentMode = "overview";   // "overview" → "region" → "city" → "category"
let focusedRegion = null;
let focusedCity   = null;
let focusedCategory = null;     // category within city

let bgCol;
let regionBaseScale = 1;

// Canvas size (참고용 상수)
const CANVAS_W = 1000;
const CANVAS_H = 1000;

// Constellation style category colors
const categoryColors = {
  TP: [120, 160, 230],
  TR: [190, 140, 220],
  RC: [230, 120, 120],
  CS: [140, 200, 160],
  GS: [240, 190, 120],
  Other: [180, 180, 180]
};

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
  titleFont = loadFont('assets/fonts/DepartureMono-Regular.woff');
  
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
  createCanvas(windowWidth, windowHeight);
  pixelDensity(2);     // anti-alias for circles

  bgCol = color("rgb(35, 35, 34)");

  smooth();
  drawingContext.imageSmoothingEnabled = true;

  textFont("system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");

  prepareRegionRects();
  prepareCityMasks();
  resetView();

  if (!jsonLoaded) {
    noLoop();
    let timer = setInterval(() => {
      if (jsonLoaded) {
        clearInterval(timer);
        processData();
        loop();
      }
    }, 30);
  } else {
    processData();
  }
}


//------------------------------------------------------
// REGION RECT CALC (SHIFT + SCALE)
//------------------------------------------------------
function prepareRegionRects() {
  for (let region of REGION_NAMES) {
    const P = regionRectsPct_raw[region];

    const x = width  * P.x / 100;
    const y = height * P.y / 100;
    const w = width  * P.w / 100;
    const h = height * P.h / 100;

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
            Math.abs(r - 44) < 10 &&
            Math.abs(g - 44) < 10 &&
            Math.abs(b - 42) < 10
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

  const margin = 0.15;
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
  updateView();

  push();
  translate(viewOffsetX, viewOffsetY);
  scale(viewScale);

  drawRegions();

  if (currentMode === "overview") {
    drawOverview();
  } else if (currentMode === "region") {
    drawRegionFocus();
  } else { // "city" 또는 "category"
    drawCityFocus();
  }

  pop();

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

  let cx = 0, cy = 0;
  for (let c of circleList) {
    cx += c.x; cy += c.y;
  }
  cx /= circleList.length;
  cy /= circleList.length;

  let pts = circleList.map(c => ({
    c, ang: atan2(c.y - cy, c.x - cx)
  }));
  pts.sort((a, b) => a.ang - b.ang);

  const alpha = 80 + 40 * sin(frameCount * 0.06);
  stroke(230, 220, 250, alpha);
  strokeWeight(0.7);
  noFill();

  beginShape();
  for (let p of pts) vertex(p.c.x, p.c.y);
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
    drawConnections(regionCircles);
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

  const regionCircles = circles.filter(c => c.region === focusedRegion);

  noStroke();
  for (let c of circles) {
    if (c.region !== focusedRegion) {
      fill(254, 251, 247, 20);
      ellipse(c.x, c.y, c.radius * 1.6);
      continue;
    }

    // region 단계에서는 category 강조 없이 동일하게
    fill(254, 251, 247, 200);
    ellipse(c.x, c.y, c.radius * 2.1);
  }
}


//------------------------------------------------------
// CITY FOCUS (city + city 내 category)
//------------------------------------------------------
function drawCityFocus() {
  if (!focusedRegion || !focusedCity) return;

  const cityCircles = circles.filter(
    c => c.region === focusedRegion && c.city === focusedCity
  );

  if (focusedCategory) {
    const cat = cityCircles.filter(c => c.category === focusedCategory);
    drawConnections(cat);
  }

  noStroke();
  for (let c of circles) {
    // 다른 region/city는 희미하게
    if (c.region !== focusedRegion || c.city !== focusedCity) {
      fill(254, 251, 247, 15);
      ellipse(c.x, c.y, c.radius * 1.4);
      continue;
    }

    // 같은 city 내부
    if (focusedCategory && c.category === focusedCategory) {
      const col = categoryColors[c.category] || categoryColors.Other;
      fill(col[0], col[1], col[2], 230);
    } else if (focusedCategory) {
      fill(254, 251, 247, 70);
    } else {
      fill(254, 251, 247, 200);
    }

    ellipse(c.x, c.y, c.radius * 2.1);
  }
}


//------------------------------------------------------
// UI TEXT
//------------------------------------------------------
function drawUI() {
  fill(254, 251, 247);
  noStroke();

  textAlign(LEFT, TOP);
  textSize(20);
  textFont(titleFont);
  text("Japan Receipts Map", 20, 20);
  
  // 다른 글꼴로 돌아갈 때
  textFont("system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");

  textSize(13);
  if (currentMode === "overview") {
    text("Hover: region connections\nClick: zoom into region", 20, 48);
  } else if (currentMode === "region") {
    text("Click circle: zoom into city\nClick empty: back to overview", 20, 48);
  } else if (currentMode === "city") {
    text("Click circle: category constellation (within city)\nClick empty: back to region", 20, 48);
  } else if (currentMode === "category") {
    text("Click empty: back to city\nClick another city circle: jump", 20, 48);
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

  // -----------------------------
  // OVERVIEW
  // -----------------------------
  if (currentMode === "overview") {
    if (idx !== -1) {
      const clicked = circles[idx];
      focusedRegion = clicked.region;
      focusedCity = null;
      focusedCategory = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
    }
    return;
  }

  // -----------------------------
  // REGION MODE
  // -----------------------------
  if (currentMode === "region") {
    if (idx === -1) {
      // 빈 공간: overview로
      currentMode = "overview";
      focusedRegion = null;
      focusedCity = null;
      focusedCategory = null;
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
      focusedCategory = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
      return;
    }

    // 같은 region → city 확대
    focusedRegion = clicked.region;
    focusedCity = clicked.city;
    focusedCategory = null;
    currentMode = "city";
    zoomToCity(focusedRegion, focusedCity);
    return;
  }

  // -----------------------------
  // CITY MODE
  // -----------------------------
  if (currentMode === "city") {
    if (idx === -1) {
      // 빈 공간: region으로
      focusedCity = null;
      focusedCategory = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
      return;
    }

    const clicked = circles[idx];

    if (clicked.region !== focusedRegion) {
      // 다른 region 클릭 → 그 region으로
      focusedRegion = clicked.region;
      focusedCity = null;
      focusedCategory = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
      return;
    }

    if (clicked.city !== focusedCity) {
      // 같은 region 내 다른 city로 점프
      focusedCity = clicked.city;
      focusedCategory = null;
      currentMode = "city";
      zoomToCity(focusedRegion, focusedCity);
      return;
    }

    // 같은 city 내부 → category 포커스 토글
    if (!focusedCategory) {
      focusedCategory = clicked.category;
      currentMode = "category";
    } else {
      if (focusedCategory === clicked.category) {
        focusedCategory = null;
        currentMode = "city";
      } else {
        focusedCategory = clicked.category;
        currentMode = "category";
      }
    }
    return;
  }

  // -----------------------------
  // CATEGORY MODE (city 내부)
  // -----------------------------
  if (currentMode === "category") {
    if (idx === -1) {
      // 빈 공간: 다시 city view
      currentMode = "city";
      focusedCategory = null;
      return;
    }

    const clicked = circles[idx];

    if (clicked.region !== focusedRegion) {
      // 다른 region으로 점프
      focusedRegion = clicked.region;
      focusedCity = null;
      focusedCategory = null;
      currentMode = "region";
      zoomToRegion(focusedRegion);
      return;
    }

    if (clicked.city !== focusedCity) {
      // 같은 region 내 다른 city로 점프
      focusedCity = clicked.city;
      focusedCategory = null;
      currentMode = "city";
      zoomToCity(focusedRegion, focusedCity);
      return;
    }

    // 같은 city → category 토글
    if (focusedCategory === clicked.category) {
      focusedCategory = null;
      currentMode = "city";
    } else {
      focusedCategory = clicked.category;
      currentMode = "category";
    }
    return;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  prepareRegionRects(); // 크기 바뀔 때마다 지도 위치 다시 계산
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
