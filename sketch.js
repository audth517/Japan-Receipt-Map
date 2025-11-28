// -------------------------------------
// GLOBALS
// -------------------------------------
let receiptsData = null;
let jsonLoaded = false;

let circles = [];
let minPrice = Infinity;
let maxPrice = 0;

// region → p5.Image
let regionImages = {};
// region → {city → p5.Image}
let cityMaskImages = {};
// region → {city → [{xImg, yImg}, ...]} (mask 내부 usable 픽셀)
let cityMaskPoints = {};
// region → {city → bounding box}
let cityBounds = {};

// 상태
let currentMode = "overview";
let focusedRegion = null;
let focusedCity = null;


// -------------------------------------
// REGION & CITY INFO
// -------------------------------------
const REGION_NAMES = ["Hokkaido", "Honshu", "Shikoku", "Kyushu"];

const CITIES_BY_REGION = {
  Hokkaido: ["Chitose", "Kamikawa", "Otaru", "Sapporo"],
  Honshu:   ["Tokyo", "Osaka", "Kyoto"],
  Shikoku:  ["Ehime", "Imabari", "Matsuyama", "Saijo"],
  Kyushu:   ["Fukuoka", "Ukiha"]
};


// -------------------------------------
// ★ regionRectsPx: PNG 배치 최종 좌표 (1000x600 기준 잡았던 값)
// -------------------------------------
let regionRectsPx = {
  Hokkaido: { x: 560, y: 20,  w: 260, h: 260 },
  Honshu:   { x: 470, y: 190, w: 340, h: 360 },
  Shikoku:  { x: 520, y: 430, w: 160, h: 120 },
  Kyushu:   { x: 390, y: 430, w: 180, h: 220 }
};


// -------------------------------------
// CATEGORY COLORS
// -------------------------------------
const categoryColors = {
  TP: [120, 160, 230],   // Transportation
  TR: [190, 140, 220],   // Tourism
  RC: [230, 120, 120],   // Restaurant & Café
  CS: [140, 200, 160],   // Convenience Store
  GS: [240, 190, 120],   // Goods Shop
  Other: [180, 180, 180]
};

const categoryLabels = {
  TP: "Transportation",
  TR: "Tourism",
  RC: "Restaurant & Café",
  CS: "Convenience Store",
  GS: "Goods Shop",
  Other: "Other"
};


// -------------------------------------
// PRELOAD
// -------------------------------------
function preload() {
  // region PNG
  for (let region of REGION_NAMES) {
    const path = `assets/islands/${region.toLowerCase()}.png`;
    regionImages[region] = loadImage(path);
  }

  // city mask PNG
  for (let region of REGION_NAMES) {
    cityMaskImages[region] = {};
    for (let city of CITIES_BY_REGION[region]) {
      const path = `assets/cities/${region.toLowerCase()}_${city.toLowerCase()}.png`;
      cityMaskImages[region][city] = loadImage(path);
    }
  }

  // receipts JSON
  const url = "data/receipts.json";

  receiptsData = loadJSON(
    url,
    (result) => {
      receiptsData = result;
      jsonLoaded = true;
      console.log("JSON loaded via loadJSON:", receiptsData);
    },
    (err) => {
      console.warn("loadJSON failed, trying fetch() fallback", err);

      fetch(url)
        .then(r => r.json())
        .then(json => {
          receiptsData = json;
          jsonLoaded = true;
          console.log("JSON loaded via fetch fallback:", receiptsData);
        })
        .catch(e => console.error("Both loadJSON and fetch failed:", e));
    }
  );
}


// -------------------------------------
// SETUP
// -------------------------------------
function setup() {
  // ★★ 여기를 600 → 730으로만 수정 ★★
  createCanvas(1000, 730);
  pixelDensity(1);

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
    return;
  }

  processData();
}


// -------------------------------------
// PREPARE CITY MASKS
// -------------------------------------
function prepareCityMasks() {
  cityMaskPoints = {};
  cityBounds = {};

  for (let region of REGION_NAMES) {
    cityMaskPoints[region] = {};
    cityBounds[region] = {};

    const rr = regionRectsPx[region];
    if (!rr) continue;

    for (let city of CITIES_BY_REGION[region]) {
      const img = cityMaskImages[region][city];
      if (!img) continue;

      img.loadPixels();

      let pts = [];
      let minX = img.width, minY = img.height;
      let maxX = -1, maxY = -1;

      const step = 1;

      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          let idx = 4 * (y * img.width + x);
          let r = img.pixels[idx];
          let g = img.pixels[idx + 1];
          let b = img.pixels[idx + 2];
          let a = img.pixels[idx + 3];

          // #221F20 근처 픽셀 허용범위 확대
          if (
            a > 0 &&
            Math.abs(r - 34) < 12 &&
            Math.abs(g - 31) < 12 &&
            Math.abs(b - 32) < 12
          ) {
            pts.push({ xImg: x, yImg: y });
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (pts.length === 0) {
        console.warn(`No city mask points for ${region}/${city}`);
        continue;
      }

      cityMaskPoints[region][city] = pts;

      const iw = img.width;
      const ih = img.height;

      const bx = rr.x + (minX / iw) * rr.w;
      const by = rr.y + (minY / ih) * rr.h;
      const bw = (maxX - minX) / iw * rr.w;
      const bh = (maxY - minY) / ih * rr.h;

      cityBounds[region][city] = { x: bx, y: by, w: bw, h: bh };
    }
  }
}


// -------------------------------------
// PROCESS DATA
// -------------------------------------
function processData() {
  if (!Array.isArray(receiptsData)) {
    receiptsData = Object.keys(receiptsData)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => receiptsData[k]);
  }

  // price range
  minPrice = Infinity;
  maxPrice = 0;

  for (let r of receiptsData) {
    const p = Number(r.price);
    if (p > 0) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
  }

  circles = [];

  for (let r of receiptsData) {
    const region = r.region;
    const city = r.city;

    const rr = regionRectsPx[region];
    if (!rr) continue;

    const pts =
      cityMaskPoints[region] && cityMaskPoints[region][city]
        ? cityMaskPoints[region][city]
        : null;

    let xScreen, yScreen;

    if (pts && pts.length > 0) {
      const img = cityMaskImages[region][city];
      const iw = img.width;
      const ih = img.height;
      const idx = floor(random(pts.length));
      const p = pts[idx];

      xScreen = rr.x + (p.xImg / iw) * rr.w;
      yScreen = rr.y + (p.yImg / ih) * rr.h;
    } else {
      xScreen = random(rr.x, rr.x + rr.w);
      yScreen = random(rr.y, rr.y + rr.h);
    }

    const radius = priceToRadius(r.price);

    circles.push({
      id: r.id,
      filename: r.filename,
      region,
      city,
      category: r.category || "Other",
      price: Number(r.price),
      x: xScreen,
      y: yScreen,
      radius
    });
  }
}


// -------------------------------------
// PRICE → RADIUS (log scale, 전체 0.4배)
// -------------------------------------
function priceToRadius(price) {
  const p = Math.max(1, Number(price));

  const logMin = Math.log(minPrice);
  const logMax = Math.log(maxPrice);
  const logP = Math.log(p);

  return map(logP, logMin, logMax, 2, 22);
}


// -------------------------------------
// DRAW
// -------------------------------------
function draw() {
  background(245);

  drawRegions();

  if (currentMode === "overview") {
    drawOverview();
  } else {
    drawCityFocus();
  }

  drawUI();
}


// region PNG
function drawRegions() {
  for (let region of REGION_NAMES) {
    const img = regionImages[region];
    const rr = regionRectsPx[region];
    if (img) image(img, rr.x, rr.y, rr.w, rr.h);
  }
}


// overview mode
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


// city mode
function drawCityFocus() {
  noStroke();
  const hover = getHoverCircleIndex();

  for (let c of circles) {
    const sel = (c.region === focusedRegion && c.city === focusedCity);

    if (sel) {
      const col = categoryColors[c.category] || categoryColors.Other;
      fill(col[0], col[1], col[2], 230);
    } else {
      fill(255, 70);
    }
    ellipse(c.x, c.y, c.radius * 2);
  }

  if (hover !== -1) drawTooltip(circles[hover]);
}


// tooltip
function drawTooltip(c) {
  fill(0);
  textAlign(LEFT, BOTTOM);
  textSize(14);
  text(
    `${c.region} / ${c.city}\n${c.id} (${c.price}¥)\n${categoryLabels[c.category]}`,
    20,
    height - 20
  );
}


// UI
function drawUI() {
  fill(0);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(18);
  text("Japan Receipts – Circle Map (PNG + log scale)", 20, 20);

  textSize(14);
  text(
    currentMode === "overview"
      ? "Click a circle to focus on that city."
      : `Focused: ${focusedRegion} / ${focusedCity} (click to return)`,
    20,
    46
  );
}


// hover index
function getHoverCircleIndex() {
  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];
    if (dist(mouseX, mouseY, c.x, c.y) < c.radius) return i;
  }
  return -1;
}


// mouse
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
