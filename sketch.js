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
// region → {city → [{xImg, yImg}, ...]} (mask 내부 픽셀들)
let cityMaskPoints = {};
// region → {city → {x, y, w, h} } (스크린 좌표 bounding box)
let cityBounds = {};
// region → {x, y, w, h} (스크린 좌표)
let regionRectsPx = {};

// 카테고리 색 (focus 모드에서 사용)
const categoryColors = {
  TP: [120, 160, 230],   // Transportation
  TR: [190, 140, 220],   // Tourism
  RC: [230, 120, 120],   // Restaurant & Café
  CS: [140, 200, 160],   // Convenience Store
  GS: [240, 190, 120],   // Goods Shop
};

// 상태
let currentMode = "overview"; // "overview" | "city"
let focusedRegion = null;
let focusedCity = null;

// -------------------------------------
// 설정 상수
// -------------------------------------

const REGION_NAMES = ["Hokkaido", "Honshu", "Shikoku", "Kyushu"];

const CITIES_BY_REGION = {
  Hokkaido: ["Chitose", "Kamikawa", "Otaru", "Sapporo"],
  Honshu: ["Tokyo", "Osaka", "Kyoto"],
  Shikoku: ["Ehime", "Imabari", "Matsuyama", "Saijo"],
  Kyushu: ["Fukuoka", "Ukiha"]
};

// 일본 전체 지도(캔버스 기준) 비율
const japanMapRectPct = { x: 0.0, y: 0.0, w: 75.26, h: 100.0 };

// 일본 지도 내부에서 region 영역 비율
const regionRectsPct = {
  Hokkaido: { x: 47.5, y: 0.0,  w: 27.7, h: 27.8 },
  Honshu:   { x: 7.1,  y: 26.9, w: 54.6, h: 55.6 },
  Shikoku:  { x: 13.7, y: 77.2, w: 14.4, h: 11.3 },
  Kyushu:   { x: 0.0,  y: 80.9, w: 13.9, h: 19.0 }
};


// -------------------------------------
// PRELOAD
// -------------------------------------
function preload() {
  // 1) region 이미지 로드
  for (let region of REGION_NAMES) {
    const path = `assets/islands/${region.toLowerCase()}.png`;
    regionImages[region] = loadImage(path);
  }

  // 2) city mask 이미지 로드
  for (let region of REGION_NAMES) {
    cityMaskImages[region] = {};
    const cities = CITIES_BY_REGION[region];
    for (let city of cities) {
      const path = `assets/islands/${region.toLowerCase()}_${city.toLowerCase()}.png`;
      cityMaskImages[region][city] = loadImage(path);
    }
  }

  // 3) receipts JSON 로드 (Safari 대응)
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
        .then((res) => res.json())
        .then((json) => {
          receiptsData = json;
          jsonLoaded = true;
          console.log("JSON loaded via fetch fallback:", receiptsData);
        })
        .catch((e) => {
          console.error("Both loadJSON and fetch failed:", e);
        });
    }
  );
}


// -------------------------------------
// SETUP
// -------------------------------------
function setup() {
  createCanvas(1000, 600);
  pixelDensity(1);

  // 1) regionRectsPx 계산 (캔버스 크기 기준)
  computeRegionRectsPx();

  // 2) city mask에서 usable한 픽셀 & bounding box 계산
  prepareCityMasks();

  // 3) JSON 로딩 상태에 따라 processData 실행
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

  processData();
}


// -------------------------------------
// regionRectsPx 계산
// -------------------------------------
function computeRegionRectsPx() {
  const jm = japanMapRectPct;
  const japanX = (jm.x / 100) * width;
  const japanY = (jm.y / 100) * height;
  const japanW = (jm.w / 100) * width;
  const japanH = (jm.h / 100) * height;

  for (let region of REGION_NAMES) {
    const rp = regionRectsPct[region];
    const rx = japanX + (rp.x / 100) * japanW;
    const ry = japanY + (rp.y / 100) * japanH;
    const rw = (rp.w / 100) * japanW;
    const rh = (rp.h / 100) * japanH;

    regionRectsPx[region] = { x: rx, y: ry, w: rw, h: rh };
  }
}


// -------------------------------------
// city mask에서 픽셀 포인트 & bounding box 계산
// -------------------------------------
function prepareCityMasks() {
  cityMaskPoints = {};
  cityBounds = {};

  for (let region of REGION_NAMES) {
    cityMaskPoints[region] = {};
    cityBounds[region] = {};

    const rr = regionRectsPx[region];
    if (!rr) continue;

    const cities = CITIES_BY_REGION[region];

    for (let city of cities) {
      const img = cityMaskImages[region][city];
      if (!img) {
        console.warn("No city mask image for:", region, city);
        continue;
      }

      img.loadPixels();

      let pts = [];
      let minX = img.width;
      let minY = img.height;
      let maxX = -1;
      let maxY = -1;

      // 샘플링 step (2픽셀 간격으로 훑기 → 성능 & 충분한 밀도)
      const step = 2;

      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          let idx = 4 * (y * img.width + x);
          let r = img.pixels[idx + 0];
          let g = img.pixels[idx + 1];
          let b = img.pixels[idx + 2];
          let a = img.pixels[idx + 3];

          // 도시 영역 색: #221f20 (34,31,32) 근처
          if (a > 0 && Math.abs(r - 34) < 3 && Math.abs(g - 31) < 3 && Math.abs(b - 32) < 3) {
            pts.push({ xImg: x, yImg: y });
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (pts.length === 0) {
        console.warn("City mask had no usable pixels:", region, city);
        continue;
      }

      cityMaskPoints[region][city] = pts;

      // bounding box를 스크린 좌표로 변환
      const iw = img.width;
      const ih = img.height;

      const boundX = rr.x + (minX / iw) * rr.w;
      const boundY = rr.y + (minY / ih) * rr.h;
      const boundW = (maxX - minX) / iw * rr.w;
      const boundH = (maxY - minY) / ih * rr.h;

      cityBounds[region][city] = {
        x: boundX,
        y: boundY,
        w: boundW,
        h: boundH
      };

      console.log(`City mask prepared: ${region}/${city}, points=${pts.length}`);
    }
  }
}


// -------------------------------------
// 데이터 처리
// -------------------------------------
function processData() {
  if (!receiptsData) {
    console.error("receiptsData is undefined!");
    return;
  }

  let arr = receiptsData;

  // Safari: {"0": {...}, "1": {...}} 형태 → 배열로 변환
  if (!Array.isArray(arr) && typeof arr === "object") {
    const keys = Object.keys(arr);

    if (keys.every((k) => !isNaN(Number(k)))) {
      arr = keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => arr[k]);
      console.warn("Converted numeric-object into array (Safari fix)", arr.length);
    } else if (arr.default && Array.isArray(arr.default)) {
      arr = arr.default;
      console.warn("Using arr.default as array (Safari fix)", arr.length);
    }
  }

  if (!Array.isArray(arr)) {
    console.error("Still not an array after fix. arr =", arr);
    return;
  }

  // 가격 min/max 계산
  for (let r of arr) {
    let p = Number(r.price);
    if (!isNaN(p) && p > 0) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
  }

  console.log("Price range:", minPrice, maxPrice);

  // 개별 receipt → circle 배치
  circles = [];

  for (let r of arr) {
    const region = r.region;
    const city = r.city;

    const rr = regionRectsPx[region];
    if (!rr) {
      console.warn("No region rect for:", region);
      continue;
    }

    const cityPts =
      cityMaskPoints[region] && cityMaskPoints[region][city]
        ? cityMaskPoints[region][city]
        : null;

    let xScreen, yScreen;

    if (cityPts && cityPts.length > 0) {
      // city mask 내부 픽셀 하나 랜덤 선택
      const img = cityMaskImages[region][city];
      const rrLocal = regionRectsPx[region];
      const iw = img.width;
      const ih = img.height;

      const idx = floor(random(cityPts.length));
      const p = cityPts[idx];

      xScreen = rrLocal.x + (p.xImg / iw) * rrLocal.w;
      yScreen = rrLocal.y + (p.yImg / ih) * rrLocal.h;
    } else {
      // fallback: region rect 내부 랜덤
      console.warn("No city mask points for:", region, city, "— using region random.");
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
      radius,
      raw: r
    });
  }

  console.log("Finished processData(), total circles:", circles.length);
}


// -------------------------------------
// 가격 → 원 크기 (log 스케일 하나로 통일)
// -------------------------------------
function priceToRadius(price) {
  let p = Math.max(1, Number(price));

  if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice <= 0 || maxPrice <= 0) {
    return 10;
  }

  const logMin = Math.log(minPrice);
  const logMax = Math.log(maxPrice);
  const logP = Math.log(p);

  if (logMax === logMin) return 20;

  // 최소 5px, 최대 55px 사이에서 log 비율로 매핑
  return map(logP, logMin, logMax, 5, 55);
}


// -------------------------------------
// DRAW
// -------------------------------------
function draw() {
  background(245);

  drawRegions();

  drawCityAreasBase();  // 디버그용 city bounding rect

  if (currentMode === "overview") {
    drawOverview();
  } else if (currentMode === "city") {
    drawCityFocus();
  }

  drawUI();
}


// region PNG 그리기
function drawRegions() {
  for (let region of REGION_NAMES) {
    const img = regionImages[region];
    const rr = regionRectsPx[region];
    if (!img || !rr) continue;

    image(img, rr.x, rr.y, rr.w, rr.h);
  }
}


// city 영역 표시 (디버그용 bounding box)
function drawCityAreasBase() {
  noFill();
  stroke(220);
  strokeWeight(1);

  for (let region in cityBounds) {
    for (let city in cityBounds[region]) {
      const b = cityBounds[region][city];
      rect(b.x, b.y, b.w, b.h);
    }
  }
}


// overview 모드
function drawOverview() {
  noStroke();
  const hoverIndex = getHoverCircleIndex();

  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];

    if (i === hoverIndex) {
      fill(255);
      stroke(0);
      strokeWeight(2);
    } else {
      fill(255, 220);
      noStroke();
    }

    ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
  }

  if (hoverIndex !== -1) {
    const c = circles[hoverIndex];
    drawTooltip(c);
  }
}


// city 모드
function drawCityFocus() {
  const hoverIndex = getHoverCircleIndex();

  noStroke();
  for (let c of circles) {
    const isFocusedCity =
      c.region === focusedRegion && c.city === focusedCity;

    if (isFocusedCity) {
      const col = categoryColors[c.category] || categoryColors.Other;
      fill(col[0], col[1], col[2], 230);
    } else {
      fill(255, 60);
    }

    ellipse(c.x, c.y, c.radius * 2, c.radius * 2);
  }

  // 선택된 city bounding 박스 강조
  if (
    focusedRegion &&
    focusedCity &&
    cityBounds[focusedRegion] &&
    cityBounds[focusedRegion][focusedCity]
  ) {
    const b = cityBounds[focusedRegion][focusedCity];
    noFill();
    stroke(0, 120);
    strokeWeight(2);
    rect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  }

  if (hoverIndex !== -1) {
    const c = circles[hoverIndex];
    drawTooltip(c);
  }
}


// tooltip
function drawTooltip(c) {
  fill(0);
  textAlign(LEFT, BOTTOM);
  textSize(14);
  text(`${c.region} / ${c.city}\n${c.id} (${c.price}¥)`, 20, height - 20);
}


// UI 표시
function drawUI() {
  fill(0);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(18);
  text("Japan Receipts – Circle Map (V2: PNG mask + log radius)", 20, 20);

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
    const c = circles[i];
    const d = dist(mouseX, mouseY, c.x, c.y);
    if (d < c.radius) return i;
  }
  return -1;
}


// 클릭 처리
function mousePressed() {
  if (currentMode === "overview") {
    const idx = getHoverCircleIndex();
    if (idx !== -1) {
      const c = circles[idx];
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
