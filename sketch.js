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

const CATEGORY_COLORS = {
  "TP": [250, 160, 160],
  "CS": [160, 200, 250],
  "RC": [200, 160, 250],
  "TR": [250, 200, 160],
  "GS": [180, 230, 180]
};

let BG_COL = [251, 251, 250];

let receiptsData = null;
let jsonLoaded = false;
let circles = [];
let regionImages = {};
let cityMaskImages = {};
let cityMaskPoints = {};

let currentMode = "overview";
let focusedRegion = null;
let focusedCity = null;

let selectedReceipt = null;
let receiptImages = {};
let focusedCategory = null;

let regionBaseScale = 1;

//------------------------------------------------------
// VIEW / CAMERA
//------------------------------------------------------
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;

let targetViewScale = 1;
let targetViewOffsetX = 0;
let targetViewOffsetY = 0;

const VIEW_LERP = 0.1;

let regionFade = 0;
let regionFadeTarget = 0;

let regionRectsPx = {};

function rectPct(x, y, w, h) {
  return {x, y, w, h};
}

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

  // ⛔ woff 사용 금지
  // monoFont = loadFont("assets/fonts/AnonymiceProNerdFontMono-Bold.woff");
  // textFont("ReceiptMono");

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
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(holder);

  prepareRegionRects();

  if (jsonLoaded) {
    prepareCityMasks();
    processData();
  }

  resetView();

  // lines UI
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
// REGION RECT CALC
//------------------------------------------------------
function prepareRegionRects() {
  const base = min(width, height);
  const offsetX = (width - base) / 2;
  const offsetY = (height - base) / 2;

  for (let region of REGION_NAMES) {
    const P = regionRectsPct_raw[region];
    const x = offsetX + base * (P.x / 100);
    const y = offsetY + base * (P.y / 100);
    const w = base * (P.w / 100);
    const h = base * (P.h / 100);
    regionRectsPx[region] = { x, y, w, h };
  }
}


//------------------------------------------------------
// PROCESS DATA
//------------------------------------------------------
let minPrice = Infinity;
let maxPrice = 0;

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
      const pick = random(pts);

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
      category: r.category,
      price: Number(r.price),
      x: xScreen,
      y: yScreen,
      radius: priceToRadius(Number(r.price))
    });
  }
}

function priceToRadius(price) {
  const p = max(1, price);
  const logMin = Math.log(minPrice);
  const logMax = Math.log(maxPrice);
  const logP = Math.log(p);
  return map(logP, logMin, logMax, 0.003, 5);
}


//------------------------------------------------------
// DRAW LOOP
//------------------------------------------------------
function draw() {
  background(BG_COL);

  updateView();

  push();
  translate(viewOffsetX, viewOffsetY);
  scale(viewScale);

  drawRegions();

  if (currentMode === "overview") drawOverview();
  else if (currentMode === "region") drawRegionFocus();
  else drawCityFocus();

  pop();

  drawDetailPanel();
  drawUI();
}


//------------------------------------------------------
// DRAW REGIONS
//------------------------------------------------------
function drawRegions() {
  if (currentMode === "overview") return;

  drawingContext.globalAlpha = regionFade;

  imageMode(CORNER);
  for (let region of REGION_NAMES) {
    const img = regionImages[region];
    const rr = regionRectsPx[region];
    image(img, rr.x, rr.y, rr.w, rr.h);
  }

  drawingContext.globalAlpha = 1;
}


//------------------------------------------------------
// WINDOW RESIZE
//------------------------------------------------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  prepareRegionRects();
  resetView();
}
