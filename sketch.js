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

let currentMode = "overview";
let focusedRegion = null;
let focusedCity = null;

const CANVAS_W = 1000;
const CANVAS_H = 1000;

// 지도 전체 이동/축소
const SHIFT_X = 80;
const SHIFT_Y = 0;
const SCALE   = 0.8;

//------------------------------------------------------
// REGION RAW COORDS (percent)
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
let regionRectsPx = {};

function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  pixelDensity(1);

  prepareRegionRects();
  prepareCityMasks();

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
// REGION RECTS (SHIFT + SCALE)
//------------------------------------------------------
function prepareRegionRects() {

  for (let region of REGION_NAMES) {

    const P = regionRectsPct_raw[region];

    const rawX = CANVAS_W * P.x / 100;
    const rawY = CANVAS_H * P.y / 100;
    const rawW = CANVAS_W * P.w / 100;
    const rawH = CANVAS_H * P.h / 100;

    regionRectsPx[region] = {
      x: rawX * SCALE + SHIFT_X,
      y: rawY * SCALE + SHIFT_Y,
      w: rawW * SCALE,
      h: rawH * SCALE
    };
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

      let pts = [];
      let iw = img.width;
      let ih = img.height;

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

          // 마스크 색: rgb(247,249,249)
          if (
            a > 0 &&
            Math.abs(r - 247) < 12 &&
            Math.abs(g - 249) < 12 &&
            Math.abs(b - 249) < 12
          ) {
            if (x > safeMinX && x < safeMaxX && y > safeMinY && y < safeMaxY) {
              pts.push({ xImg: x, yImg: y });
            }
          }
        }
        // testestset0-----------------
        if (region === "Hokkaido" && city === "Hakodate") {
          console.log(x, y, r, g, b, a);
        }
      }

      if (pts.length > 0) {
        cityMaskPoints[region][city] = pts;
      }
    }
  }
}


//------------------------------------------------------
// PROCESS DATA
//------------------------------------------------------
function processData() {

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

      let centerPts = pts.filter(p => {
        let dx = p.xImg - iw/2;
        let dy = p.yImg - ih/2;
        return dx*dx + dy*dy < (iw*ih)*0.15;
      });

      let pick = (centerPts.length > 20 ? random(centerPts) : random(pts));

      xScreen = rr.x + (pick.xImg / iw) * rr.w;
      yScreen = rr.y + (pick.yImg / ih) * rr.h;

    } else {
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


//------------------------------------------------------
// DRAW REGIONS
//------------------------------------------------------
function drawRegions() {
  for (let region of REGION_NAMES) {
    const img = regionImages[region];
    const rr = regionRectsPx[region];
    if (img && rr) image(img, rr.x, rr.y, rr.w, rr.h);
  }
}


//------------------------------------------------------
// OVERVIEW MODE
//------------------------------------------------------
function drawOverview() {
  noStroke();
  const hover = getHoverCircleIndex();

  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];

    if (i === hover) {
      fill(255);
      stroke(0);
      strokeWeight(2);
    } else {
      fill(255, 230);
      noStroke();
    }
    ellipse(c.x, c.y, c.radius * 2);
  }

  if (hover !== -1) drawTooltip(circles[hover]);
}


//------------------------------------------------------
// CITY MODE
//------------------------------------------------------
function drawCityFocus() {
  noStroke();
  const hover = getHoverCircleIndex();

  for (let c of circles) {
    const isFocused = (c.region === focusedRegion && c.city === focusedCity);

    if (isFocused) {
      fill(120, 180, 200, 240);
    } else {
      fill(255, 70);
    }

    ellipse(c.x, c.y, c.radius * 2);
  }

  if (hover !== -1) drawTooltip(circles[hover]);
}


//------------------------------------------------------
// TOOLTIP
//------------------------------------------------------
function drawTooltip(c) {
  fill(0);
  textAlign(LEFT, TOP);
  textSize(14);

  text(
    `${c.region}/${c.city}\n${c.id}\n${c.price}¥`,
    20, height - 80
  );
}


//------------------------------------------------------
// UI TEXT
//------------------------------------------------------
function drawUI() {
  fill(0);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(18);

  text("Japan Receipts – Circle Map", 20, 20);

  textSize(14);
  if (currentMode === "overview") {
    text("Click a circle to focus a city", 20, 48);
  } else {
    text(`Focused: ${focusedRegion}/${focusedCity} (click to exit)`, 20, 48);
  }
}


//------------------------------------------------------
// HOVER DETECTION
//------------------------------------------------------
function getHoverCircleIndex() {
  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];
    if (dist(mouseX, mouseY, c.x, c.y) < c.radius) return i;
  }
  return -1;
}


//------------------------------------------------------
// MOUSE INTERACTION
//------------------------------------------------------
function mousePressed() {
  const idx = getHoverCircleIndex();

  if (currentMode === "overview") {
    if (idx !== -1) {
      focusedRegion = circles[idx].region;
      focusedCity = circles[idx].city;
      currentMode = "city";
    }
  } else {
    currentMode = "overview";
    focusedRegion = null;
    focusedCity = null;
  }
}
