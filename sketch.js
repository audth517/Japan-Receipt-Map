// -----------------------------------------------------
// GLOBAL VARIABLES
// -----------------------------------------------------
let receiptsData = [];
let receiptImages = {};

let islands = [];
let ready = false;
let assigned = false;

let imgRegion = {};     // hokkaido / honshu / shikoku / kyushu
let cityMasks = {};     // cityMasks[region][city]

// -----------------------------------------------------
// CITY MAP STRUCTURE
// -----------------------------------------------------
const CITY_MAP = {
  hokkaido: ["chitose", "sapporo", "otaru", "hakodate"],
  honshu:   ["tokyo", "kyoto", "osaka"],
  shikoku:  ["ehime", "imabari", "matsuyama", "saijo"],
  kyushu:   ["fukuoka", "ukiha"]
};

// -----------------------------------------------------
// PRELOAD
// -----------------------------------------------------
function preload() {

  // --- region PNG 로딩 ---
  const regions = Object.keys(CITY_MAP);
  for (let r of regions) {
    imgRegion[r] = loadImage(`assets/islands/${r}.png`);
  }

  // --- city PNG 로딩 ---
  for (let r of regions) {
    cityMasks[r] = {};

    // region-level mask
    cityMasks[r]["_region"] = loadImage(`assets/cities/${r}.png`);

    // city-level mask
    for (let c of CITY_MAP[r]) {
      cityMasks[r][c] = loadImage(`assets/cities/${r}_${c}.png`);
    }
  }

  // --- receipts data ---
  receiptsData = loadJSON("data/receipts.json?v=" + Date.now());
}

// -----------------------------------------------------
// SETUP
// -----------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);

  if (!Array.isArray(receiptsData)) {
    receiptsData = Object.values(receiptsData);
  }

  // 이미지 로딩
  let loadedCount = 0;
  let totalImages = receiptsData.length;

  for (let r of receiptsData) {
    let path = "assets/receipts/" + r.filename;

    receiptImages[r.id] = loadImage(
      path,
      () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          ready = true;
        }
      },
      () => console.error("Failed to load:", path)
    );
  }

  setupIslands();
  assignReceiptsByCity();
}

// -----------------------------------------------------
// WINDOW RESIZE
// -----------------------------------------------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupIslands();
  assignReceiptsByCity();
}

// -----------------------------------------------------
// ISLAND LAYOUT
// -----------------------------------------------------
function setupIslands() {
  islands = [];

  const mapH = height * 1.10;
  const mapW = mapH * 0.43;
  const mapX = (width - mapW) / 2;
  const mapY = height * (-0.05);

  const baseH = mapH * 0.55;

  const defs = {
    honshu:   { dx: 0.47, dy: 0.54, hRatio: 0.7 },
    hokkaido: { dx: 0.90, dy: 0.25, hRatio: 0.364 },
    shikoku:  { dx: 0.26, dy: 0.74, hRatio: 0.161 },
    kyushu:   { dx: 0.01, dy: 0.79, hRatio: 0.259 }
  };

  const order = ["honshu", "hokkaido", "shikoku", "kyushu"];

  for (let name of order) {
    let img = imgRegion[name];
    if (!img) continue;

    const d = defs[name];

    const h = baseH * d.hRatio;
    const w = h * (img.width / img.height);

    const cx = mapX + mapW * d.dx;
    const cy = mapY + mapH * d.dy;

    islands.push({
      name,
      x: cx - w/2,
      y: cy - h/2,
      w,
      h,
      receipts: [],
      cities: {}
    });
  }
}

// -----------------------------------------------------
// ASSIGN RECEIPTS INTO ISLAND & CITY
// -----------------------------------------------------
function assignReceiptsByCity() {
  for (let isl of islands) {
    isl.receipts = [];
    isl.cities = {};
  }

  for (let r of receiptsData) {
    let region = r.region.toLowerCase();
    let island = islands.find(i => i.name === region);
    if (!island) continue;

    island.receipts.push(r);

    let city = r.city.toLowerCase();
    if (!island.cities[city]) island.cities[city] = [];
    island.cities[city].push(r);
  }
}

// -----------------------------------------------------
// DRAW
// -----------------------------------------------------
function draw() {
  background(20);

  if (!ready) {
    push();
    textAlign(CENTER, CENTER);
    fill(245);
    textSize(24);
    text("Loading receipts...", width/2, height/2);
    pop();
    return;
  }

  if (!assigned) {
    for (let isl of islands) {
      computeIslandScaling(isl);
      applyPriceScaling(isl);
      computeCityLayouts(isl);
    }
    assigned = true;
  }

  // region image + city borders
  for (let isl of islands) {
    drawIslandImage(isl);
  }

  // city-level receipt drawing
  for (let isl of islands) {
    let region = isl.name;

    for (let city in isl.cityAreas) {
      let area = isl.cityAreas[city];
      let receipts = isl.cities[city];
      drawReceiptsInCity(area, receipts, region, city);
    }
  }
}

// -----------------------------------------------------
// DRAW REGION IMAGE
// -----------------------------------------------------
function drawIslandImage(island) {
  let img = imgRegion[island.name];
  if (!img) return;

  push();
  imageMode(CORNER);

  let aspect = img.width / img.height;
  let boxAspect = island.w / island.h;

  let w, h;
  if (aspect > boxAspect) {
    w = island.w;
    h = island.w / aspect;
  } else {
    h = island.h;
    w = island.h * aspect;
  }

  let x = island.x + (island.w - w)/2;
  let y = island.y + (island.h - h)/2;

  image(img, x, y, w, h);
  pop();
}

// -----------------------------------------------------
// DRAW RECEIPTS INSIDE CITY MASK
// -----------------------------------------------------
function drawReceiptsInCity(area, receipts, regionName, cityName) {
  if (!receipts || receipts.length === 0) return;

  let maskImg = cityMasks[regionName][cityName];
  if (!maskImg) return;

  let mask = createMaskGrid(area, maskImg);
  placeReceiptsInMask(mask, receipts);

  for (let r of receipts) {
    let drawX = area.x + r.cityX + r.scaledW/2;
    let drawY = area.y + r.cityY + r.scaledH/2;

    image(receiptImages[r.id], drawX, drawY, r.scaledW, r.scaledH);
  }
}

// -----------------------------------------------------
// CREATE MASK GRID (city PNG 기반)
// -----------------------------------------------------
function createMaskGrid(area, maskImg) {
  let grid = [];
  maskImg.loadPixels();

  for (let y = 0; y < area.h; y++) {
    grid[y] = [];

    for (let x = 0; x < area.w; x++) {

      // PNG 해상도가 region과 동일 → 좌표 그대로 사용
      let mx = int(area.x + x);
      let my = int(area.y + y);

      let idx = (my * maskImg.width + mx) * 4;
      let alpha = maskImg.pixels[idx + 3];

      grid[y][x] = alpha > 10;   // shape 내부만 true
    }
  }
  return grid;
}

// -----------------------------------------------------
// PLACE RECEIPTS INSIDE INTERNAL GRID
// -----------------------------------------------------
function placeReceiptsInMask(mask, receipts) {
  let placed = [];

  for (let r of receipts) {
    let w = int(r.scaledW);
    let h = int(r.scaledH);

    let pos = findPositionForRectangle(mask, w, h, placed);

    if (pos) {
      r.cityX = pos.x;
      r.cityY = pos.y;
      placed.push({x: pos.x, y: pos.y, w, h});
    }
  }
}

// -----------------------------------------------------
function findPositionForRectangle(mask, w, h, placed) {
  for (let y = 0; y < mask.length - h; y++) {
    for (let x = 0; x < mask[0].length - w; x++) {

      if (!fitsMask(mask, x, y, w, h)) continue;
      if (overlaps(x, y, w, h, placed)) continue;

      return {x, y};
    }
  }
  return null;
}

function fitsMask(mask, x, y, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!mask[y+j][x+i]) return false;
    }
  }
  return true;
}

function overlaps(x, y, w, h, placed) {
  for (let p of placed) {
    if (x < p.x + p.w &&
        x + w > p.x &&
        y < p.y + p.h &&
        y + h > p.y)
      return true;
  }
  return false;
}

// -----------------------------------------------------
// PRICE SCALING
// -----------------------------------------------------
function computeIslandScaling(island) {
  let total = 0;
  for (let r of island.receipts) total += r.price;

  island.scaleK = (island.w * island.h * 0.05) / total;
}

function applyPriceScaling(island) {
  for (let r of island.receipts) {
    let aspect = r.width / r.height;
    let area = r.price * island.scaleK;

    let h = sqrt(area / aspect);
    let w = h * aspect;

    r.scaledW = w;
    r.scaledH = h;
  }
}

// -----------------------------------------------------
// CITY LAYOUT BOXES
// -----------------------------------------------------
function computeCityLayouts(island) {
  const regionName = island.name; // "hokkaido", "honshu", ...

  const maskRegionImg = cityMasks[regionName]["_region"];
  if (!maskRegionImg) return;

  // 섬 이미지와 마스크 이미지의 해상도가 같다고 가정
  const imgW = maskRegionImg.width;
  const imgH = maskRegionImg.height;

  // 섬이 캔버스에서 차지하는 영역 → 이미지 픽셀 좌표와의 스케일링
  const scaleX = island.w / imgW;
  const scaleY = island.h / imgH;

  island.cityAreas = {};

  // 이 섬에 실제로 존재하는 city들만 처리
  const cities = Object.keys(island.cities);

  for (let city of cities) {
    const maskImg = cityMasks[regionName][city];
    if (!maskImg) continue;

    maskImg.loadPixels();

    let minX = maskImg.width;
    let minY = maskImg.height;
    let maxX = -1;
    let maxY = -1;

    // 마스크 이미지 전체에서 알파 있는 부분의 바운딩 박스 찾기
    for (let y = 0; y < maskImg.height; y++) {
      for (let x = 0; x < maskImg.width; x++) {
        const idx = (y * maskImg.width + x) * 4;
        const alpha = maskImg.pixels[idx + 3];

        if (alpha > 10) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 해당 city 마스크에 아무 픽셀도 없으면 패스
    if (maxX < minX || maxY < minY) continue;

    // 마스크 좌표 → 캔버스 좌표로 변환
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;

    const areaX = island.x + minX * scaleX;
    const areaY = island.y + minY * scaleY;
    const areaW = boxW * scaleX;
    const areaH = boxH * scaleY;

    island.cityAreas[city] = {
      x: areaX,
      y: areaY,
      w: areaW,
      h: areaH,

      // 나중에 마스크 샘플링할 때 다시 쓰기 위해 원본 마스크 좌표도 저장
      maskBounds: {
        minX,
        minY,
        maxX,
        maxY
      }
    };
  }
}
