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
let minPrice = Infinity;
let maxPrice = 0;

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
// VIEW
//------------------------------------------------------
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;

let targetViewScale = 1;
let targetViewOffsetX = 0;
let targetViewOffsetY = 0;

let regionFade = 0;
let regionFadeTarget = 0;

const VIEW_LERP = 0.1;

let regionRectsPx = {};

function rectPct(x,y,w,h){ return {x,y,w,h}; }

let regionRectsPct_raw = {
  Hokkaido: rectPct(47.5, 0,    27.7, 27.8),
  Honshu:   rectPct(7.1,  26.9, 54.6, 55.6),
  Shikoku:  rectPct(13.7, 77.2, 14.4, 11.3),
  Kyushu:   rectPct(0,    80.9, 13.9, 19.0)
};


//------------------------------------------------------
// PRELOAD
//------------------------------------------------------
function preload() {

  // ⚠ 폰트 제거 (woff 지원 X)
  // monoFont = loadFont();

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
    (result)=>{ receiptsData=result; jsonLoaded=true; },
    ()=>{ fetch("data/receipts.json").then(r=>r.json()).then(j=>{ receiptsData=j; jsonLoaded=true; }); }
  );
}


//------------------------------------------------------
// SETUP
//------------------------------------------------------
function setup() {

  let holder = document.getElementById("canvas-holder");
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(holder);

  // 폰트 제거
  // textFont(monoFont);

  prepareRegionRects();

  if (jsonLoaded) {
    prepareCityMasks();
    processData();
  }

  resetView();
}


//------------------------------------------------------
// REGION RECT
//------------------------------------------------------
function prepareRegionRects() {
  const base = min(width, height);
  const offsetX = (width - base) / 2;
  const offsetY = (height - base) / 2;

  for (let region of REGION_NAMES) {
    const P = regionRectsPct_raw[region];
    regionRectsPx[region] = {
      x: offsetX + base*(P.x/100),
      y: offsetY + base*(P.y/100),
      w: base*(P.w/100),
      h: base*(P.h/100)
    };
  }
}


//------------------------------------------------------
// CITY MASK
//------------------------------------------------------
function prepareCityMasks(){
  cityMaskPoints={};

  for(let region of REGION_NAMES){
    cityMaskPoints[region]={};

    for(let city of CITIES_BY_REGION[region]){
      const img = cityMaskImages[region][city];
      if(!img) continue;

      img.loadPixels();
      const pts=[];
      const iw=img.width, ih=img.height;

      for(let y=0;y<ih;y++){
        for(let x=0;x<iw;x++){
          const idx=4*(y*iw+x);
          if(img.pixels[idx+3]>0){ pts.push({xImg:x,yImg:y}); }
        }
      }

      if(pts.length>0) cityMaskPoints[region][city]=pts;
    }
  }
}


//------------------------------------------------------
// PROCESS DATA
//------------------------------------------------------
function processData(){

  for(let r of receiptsData){
    const p=Number(r.price);
    if(p>0){ minPrice=min(minPrice,p); maxPrice=max(maxPrice,p); }
  }

  for(let r of receiptsData){
    const region=r.region;
    const city=r.city;
    const rr=regionRectsPx[region];
    const pts=cityMaskPoints?.[region]?.[city];

    let xScreen,yScreen;

    if(pts && pts.length>0){
      const pick = random(pts);
      xScreen = rr.x + (pick.xImg / cityMaskImages[region][city].width) * rr.w;
      yScreen = rr.y + (pick.yImg / cityMaskImages[region][city].height) * rr.h;
    }else{
      xScreen = random(rr.x, rr.x+rr.w);
      yScreen = random(rr.y, rr.y+rr.h);
    }

    circles.push({
      id:r.id,
      filename:r.filename,
      region,
      city,
      category:r.category,
      price:r.price,
      x:xScreen,
      y:yScreen,
      radius:priceToRadius(r.price)
    });
  }
}

function priceToRadius(p){
  const logMin=Math.log(minPrice);
  const logMax=Math.log(maxPrice);
  const logP=Math.log(p);
  return map(logP,logMin,logMax,0.003,5);
}


//------------------------------------------------------
// VIEW CONTROL
//------------------------------------------------------
function resetView(){
  const box=getJapanBounds();
  const margin=0.05;

  const availW=width*(1-2*margin);
  const availH=height*(1-2*margin);
  const s=min(availW/box.w,availH/box.h);

  viewScale=s;
  targetViewScale=s;

  const cx=box.x+box.w/2;
  const cy=box.y+box.h/2;

  viewOffsetX=width/2 - s*cx;
  viewOffsetY=height/2 - s*cy;

  targetViewOffsetX=viewOffsetX;
  targetViewOffsetY=viewOffsetY;
}


//------------------------------------------------------
// DRAW
//------------------------------------------------------
function draw(){
  background(BG_COL);

  updateView();

  push();
  translate(viewOffsetX,viewOffsetY);
  scale(viewScale);

  drawRegions();

  if(currentMode==="overview") drawOverview();
  else if(currentMode==="region") drawRegionFocus();
  else drawCityFocus();

  pop();

  drawDetailPanel();
  drawUI();
}


//------------------------------------------------------
// WINDOW RESIZE
//------------------------------------------------------
function windowResized(){
  resizeCanvas(windowWidth,windowHeight);
  prepareRegionRects();
  resetView();
}


//------------------------------------------------------
// JAPAN BOUNDS
//------------------------------------------------------
function getJapanBounds(){
  let minX=Infinity,minY=Infinity;
  let maxX=-Infinity,maxY=-Infinity;

  for(let region of REGION_NAMES){
    const rr=regionRectsPx[region];
    minX=min(minX,rr.x);
    minY=min(minY,rr.y);
    maxX=max(maxX,rr.x+rr.w);
    maxY=max(maxY,rr.y+rr.h);
  }

  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}
