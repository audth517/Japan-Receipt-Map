//------------------------------------------------------
// GLOBALS
//------------------------------------------------------
const REGION_NAMES = ["Hokkaido", "Honshu", "Shikoku", "Kyushu"];

const CITIES_BY_REGION = {
  Hokkaido: ["Chitose", "Kamikawa", "Otaru", "Sapporo"],
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
let cityBounds = {};

let currentMode = "overview";
let focusedRegion = null;
let focusedCity = null;

const CANVAS_W = 1000;
const CANVAS_H = 1000;

//------------------------------------------------------
// SHIFT + SCALE 적용
//------------------------------------------------------
const SHIFT_X = 80;    // 🔥 전체 지도 오른쪽 이동
const SHIFT_Y = 0;     // 🔥 필요하면 20~40 줘도 됨
const SCALE   = 0.8;   // 🔥 전체 지도 크기 0.8배 축소

//------------------------------------------------------
// REGION RAW COORDS (퍼센트 기반 원본)
//------------------------------------------------------
function rectPct(x, y, w, h) { return {x, y, w, h}; }

let regionRectsPct_raw = {
  Hokkaido: rectPct(47.5, 0.0, 27.7, 27.8),
  Honshu:   rectPct(7.1,  26.9, 54.6, 55.6),
  Shikoku:  rectPct(13.7, 77.2, 14.4, 11.3),
  Kyushu:   rectPct(0.0,  80.9, 13.9, 19.0)
};

//------------------------------------------------------
// PRELOAD
//------------------------------------------------------
function preload() {
  for (let region of REGION_NAMES) {
    regionImages[region] = loadImage(`assets/islands/${region.toLowerCase()}.png`);
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
  createCanvas(CANVAS_W, CANVAS_H);
  pixelDensity(1);

  prepareRegionRects();   // 🔥 SHIFT + SCALE 적용
  prepareCityMasks();

  if (!jsonLoaded) {
    noLoop();
    let timer = setInterval(() => {
      if (jsonLoaded) { clearInterval(timer); processData(); loop(); }
    }, 30);
  } else {
    processData();
  }
}

//------------------------------------------------------
// (A) SHIFT + SCALE 적용한 실제 regionRectsPx 계산
//------------------------------------------------------
let regionRectsPx = {};

function prepareRegionRects() {

  for (let region of REGION_NAMES) {

    const P = regionRectsPct_raw[region];

    const raw = {
      x: CANVAS_W * P.x / 100,
      y: CANVAS_H * P.y / 100,
      w: CANVAS_W * P.w / 100,
      h: CANVAS_H * P.h / 100
    };

    // 🔥 전체 지도 스케일 + 이동
    regionRectsPx[region] = {
      x: raw.x * SCALE + SHIFT_X,
      y: raw.y * SCALE + SHIFT_Y,
      w: raw.w * SCALE,
      h: raw.h * SCALE
    };
  }
}

//------------------------------------------------------
// (B) CITY MASK PROCESSING
//------------------------------------------------------
function prepareCityMasks() {
  cityMaskPoints = {};
  cityBounds = {};

  for (let region of REGION_NAMES) {
    cityMaskPoints[region] = {};
    cityBounds[region] = {};

    const rr = regionRectsPx[region];

    for (let city of CITIES_BY_REGION[region]) {
      const img = cityMaskImages[region][city];
      if (!img) continue;

      img.loadPixels();

      let pts = [];
      let iw = img.width;
      let ih = img.height;

      const cx = iw / 2;
      const cy = ih / 2;

      // 원 밖으로 튀는 것 방지: 안전 영역
      const SAFE_MARGIN = 0.03;  
      const safeMinX = iw * SAFE_MARGIN;
      const safeMaxX = iw * (1 - SAFE_MARGIN);
      const safeMinY = ih * SAFE_MARGIN;
      const safeMaxY = ih * (1 - SAFE_MARGIN);

      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          let idx = 4 * (y * iw + x);
          let r = img.pixels[idx];
          let g = img.pixels[idx + 1];
          let b = img.pixels[idx + 2];
          let a = img.pixels[idx + 3];

          if (
            a > 0 &&
            Math.abs(r - 247) < 12 &&
            Math.abs(g - 249) < 12 &&
            Math.abs(b - 249) < 12
          ) {
              pts.push({ xImg: x, yImg: y });
          
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
          }
        }
      }

      if (pts.length === 0) continue;

      cityMaskPoints[region][city] = pts;
    }
  }
}

//------------------------------------------------------
// PROCESS DATA (safe circle placement)
//------------------------------------------------------
function processData() {

  // min/max
  for (let r of receiptsData) {
    let p = Number(r.price);
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
      let iw = img.width;
      let ih = img.height;

      // 🔥 중앙에 가까운 픽셀 우선적으로 사용 (바깥으로 튀는 것 방지)
      let centerPts = pts.filter(p => {
        let dx = p.xImg - iw/2;
        let dy = p.yImg - ih/2;
        return dx*dx + dy*dy < (iw*ih)*0.15;
      });

      let pick = (centerPts.length > 20 ? random(centerPts) : random(pts));

      xScreen = rr.x + (pick.xImg / iw) * rr.w;
      yScreen = rr.y + (pick.yImg / ih) * rr.h;

    } else {
      // fallback
      xScreen = random(rr.x, rr.x + rr.w);
      yScreen = random(rr.y, rr.y + rr.h);
    }

    circles.push({
      id: r.id,
      filename: r.filename,
      region, city,
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
  return map(logP, logMin, logMax, 2, 22); 
}

//------------------------------------------------------
// DRAW
//------------------------------------------------------
function draw() {
  background(245);
  drawRegions();

  if (currentMode === "overview") drawOverview();
  else drawCityFocus();

  drawUI();
}

// draw region PNG
function drawRegions() {
  for (let region of REGION_NAMES) {
    const img = regionImages[region];
    const rr = regionRectsPx[region];
    if (img && rr) image(img, rr.x, rr.y, rr.w, rr.h);
  }
}
