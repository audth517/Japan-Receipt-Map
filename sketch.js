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

let monoFont;

// Interaction state
let currentMode = "overview";
let focusedRegion = null;
let focusedCity   = null;
let selectedReceipt = null;
let receiptImages = {};

let regionBaseScale = 1;

// Canvas
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;

let targetViewScale = 1;
let targetViewOffsetX = 0;
let targetViewOffsetY = 0;

const VIEW_LERP = 0.1;

// PNG fade
let regionFade = 0;
let regionFadeTarget = 0;

// region bounding boxes (computed)
let regionRectsPx = {};
function rectPct(x, y, w, h) { return {x, y, w, h}; }

let regionRectsPct_raw = {
  Hokkaido: rectPct(47.5, 0.0, 27.7, 27.8),
  Honshu:   rectPct(7.1,  26.9, 54.6, 55.6),
  Shikoku:  rectPct(13.7, 77.2, 14.4, 11.3),
  Kyushu:   rectPct(0.0,  80.9, 13.9, 19.0)
};

let bgCol;



//------------------------------------------------------
// PRELOAD
//------------------------------------------------------
function preload() {
  monoFont = loadFont("assets/fonts/DepartureMono-Regular.woff");

  // load region PNG
  for (let region of REGION_NAMES) {
    regionImages[region] =
      loadImage(`assets/islands/${region.toLowerCase()}.png`);
  }

  // load city mask PNG
  for (let region of REGION_NAMES) {
    cityMaskImages[region] = {};
    for (let city of CITIES_BY_REGION[region]) {
      cityMaskImages[region][city] =
        loadImage(`assets/cities/${region.toLowerCase()}_${city.toLowerCase()}.png`);
    }
  }

  // load JSON
  receiptsData = loadJSON(
    "data/receipts.json",
    (r)=>{ receiptsData=r; jsonLoaded=true; },
    ()=>{ fetch("data/receipts.json").then(r=>r.json()).then(j=>{ receiptsData=j; jsonLoaded=true; }); }
  );
}



//------------------------------------------------------
// SETUP
//------------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);  // fullscreen
  pixelDensity(2);

  textFont(monoFont);
  smooth();
  bgCol = color("rgb(251,251,250)");

  prepareRegionRects();
  prepareCityMasks();
  resetView();

  if (!jsonLoaded) {
    noLoop();
    let t = setInterval(()=>{
      if (jsonLoaded) {
        clearInterval(t);
        processData();
        loop();
      }
    },30);
  } else {
    processData();
  }
}



//------------------------------------------------------
// LAYOUT: Region Rects
//------------------------------------------------------
function prepareRegionRects() {
  const base = min(width, height);
  const offsetX = (width  - base) / 2;
  const offsetY = (height - base) / 2;

  const uiLeft = 420;  // left UI width → push map to right

  for (let region of REGION_NAMES) {
    const P = regionRectsPct_raw[region];
    const x = offsetX + uiLeft + base*(P.x/100);
    const y = offsetY + base*(P.y/100);
    const w = base*(P.w/100);
    const h = base*(P.h/100);
    regionRectsPx[region] = {x,y,w,h};
  }
}



//------------------------------------------------------
// PREP CITY MASKS
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

      const SAFE = 0.03;
      const minX = iw*SAFE, maxX=iw*(1-SAFE);
      const minY = ih*SAFE, maxY=ih*(1-SAFE);

      for (let y=0; y<ih; y++) {
        for (let x=0; x<iw; x++) {
          const idx = 4*(y*iw + x);
          const r = img.pixels[idx];
          const g = img.pixels[idx+1];
          const b = img.pixels[idx+2];
          const a = img.pixels[idx+3];

          if (a>0 &&
              abs(r-219)<10 && abs(g-218)<10 && abs(b-217)<10 &&
              x>minX && x<maxX && y>minY && y<maxY) {
            pts.push({xImg:x, yImg:y});
          }
        }
      }
      if (pts.length>0) cityMaskPoints[region][city]=pts;
    }
  }
}



//------------------------------------------------------
// PROCESS DATA (Receipts)
//------------------------------------------------------
function processData() {
  for (let r of receiptsData) {
    const p = Number(r.price);
    if (p>0) {
      minPrice=min(minPrice,p);
      maxPrice=max(maxPrice,p);
    }
  }

  circles=[];
  for (let r of receiptsData) {
    const region=r.region;
    const city=r.city;
    const rr = regionRectsPx[region];
    if (!rr) continue;

    const pts = cityMaskPoints?.[region]?.[city];
    let xScreen,yScreen;

    if (pts && pts.length>0) {
      const img = cityMaskImages[region][city];
      const iw=img.width, ih=img.height;

      const centerPts = pts.filter(p=>{
        const dx=p.xImg - iw/2;
        const dy=p.yImg - ih/2;
        return dx*dx + dy*dy < (iw*ih)*0.15;
      });

      const pick = (centerPts.length>20 ? random(centerPts) : random(pts));
      xScreen = rr.x + (pick.xImg/iw)*rr.w;
      yScreen = rr.y + (pick.yImg/ih)*rr.h;

    } else {
      xScreen = random(rr.x, rr.x+rr.w);
      yScreen = random(rr.y, rr.y+rr.h);
    }

    circles.push({
      id:r.id,
      filename:r.filename,
      region, city,
      category:r.category || "Other",
      price:Number(r.price),
      x:xScreen, y:yScreen,
      radius: priceToRadius(Number(r.price))
    });
  }
}



//------------------------------------------------------
// PRICE→RADIUS
//------------------------------------------------------
function priceToRadius(price){
  const p=max(1,price);
  const Lmin=Math.log(minPrice);
  const Lmax=Math.log(maxPrice);
  const Lp = Math.log(p);
  return map(Lp,Lmin,Lmax,3,10);
}



//------------------------------------------------------
// VIEW
//------------------------------------------------------
function resetView() {
  const box = getJapanBounds();
  const margin=0.05;
  const wAvail=width*(1-2*margin);
  const hAvail=height*(1-2*margin);

  const s=min(wAvail/box.w, hAvail/box.h);
  viewScale=s;
  targetViewScale=s;

  const cx=box.x+box.w/2;
  const cy=box.y+box.h/2;

  viewOffsetX = width/2 - s*cx;
  viewOffsetY = height/2 - s*cy;
  targetViewOffsetX=viewOffsetX;
  targetViewOffsetY=viewOffsetY;
}


function zoomToRegion(region){
  const rr=regionRectsPx[region];
  if(!rr)return;

  const margin=0.15;
  const wAvail=width*(1- 2*margin);
  const hAvail=height*(1- 2*margin);
  const s=min(wAvail/rr.w, hAvail/rr.h);

  targetViewScale=s;
  regionBaseScale=s;

  const cx=rr.x+rr.w/2;
  const cy=rr.y+rr.h/2;

  targetViewOffsetX=width/2 - s*cx;
  targetViewOffsetY=height/2 - s*cy;

  regionFade=0;
  regionFadeTarget=1;
}


function zoomToCity(region, city) {
  const box = getCityBounds(region, city);
  if(!box)return;

  const margin=0.15;
  const wAvail=width*(1-2*margin);
  const hAvail=height*(1-2*margin);

  const rawScale=min(wAvail/box.w, hAvail/box.h);
  const minScale=regionBaseScale;
  const maxScale=regionBaseScale*3.2;
  const s=constrain(rawScale, minScale, maxScale);

  targetViewScale=s;

  const cx=box.x+box.w/2;
  const cy=box.y+box.h/2;

  targetViewOffsetX=width/2 - s*cx;
  targetViewOffsetY=height/2 - s*cy;

  regionFade=1;
  regionFadeTarget=1;
}



function updateView() {
  viewScale=lerp(viewScale,targetViewScale, VIEW_LERP);
  viewOffsetX=lerp(viewOffsetX,targetViewOffsetX, VIEW_LERP);
  viewOffsetY=lerp(viewOffsetY,targetViewOffsetY, VIEW_LERP);
  regionFade=lerp(regionFade, regionFadeTarget, 0.08);
}



//------------------------------------------------------
// DRAW
//------------------------------------------------------
function draw(){
  background(bgCol);

  // 🔥 draw UI left panel & header
  drawStaticUIPanel();

  // Map transform
  updateView();
  push();
  translate(viewOffsetX, viewOffsetY);
  scale(viewScale);

  drawRegions();

  if(currentMode==="overview") drawOverview();
  else if(currentMode==="region") drawRegionFocus();
  else drawCityFocus();

  pop();

  drawDetailPanel();
  drawFooter();
}



//------------------------------------------------------
// STATIC UI PANEL (Left)
//------------------------------------------------------
function drawStaticUIPanel() {
  push();
  fill(55,52,49);
  noStroke();
  textAlign(LEFT,TOP);

  // Title
  textSize(24);
  text("[Japan Receipt Map]", 60, 40);

  textSize(14);
  text("From 230201 to 250512", 60, 80);

  // dashed
  stroke(55,52,49);
  strokeWeight(1);
  drawingContext.setLineDash([6,6]);
  line(60,115, width-60,115);
  drawingContext.setLineDash([]);

  // Introduction
  noStroke();
  textSize(16);
  text("Introduction",60,145);

  textSize(12);
  text(
    "Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam\n"+
    "nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat\n"+
    "volutpat. Ut wisi enim ad minim veniam",
    60,175
  );

  text(
    "Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam\n"+
    "nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat\n"+
    "volutpat. Ut wisi enim ad minim veniam",
    width/2 - 100,175
  );

  // dashed
  stroke(55,52,49);
  drawingContext.setLineDash([6,6]);
  line(60,275, width-60,275);
  drawingContext.setLineDash([]);

  // HOW TO READ
  noStroke();
  textSize(16);
  text("How To Read",60,300);

  textSize(12);
  text("One Purchasing",60,330);

  fill(55,52,49);
  rect(180,328,10,10);

  text("Price: ¥10,000  ¥1,000  ¥100", 60,360);

  // price squares
  for(let i=0;i<3;i++){
    let s=14-i*3;
    rect(230 + i*20, 358 + (14-s)/2, s, s);
  }

  // Categories
  let cats=[
    "Convenient Store",
    "Goods Shop",
    "Restaurant & Cafe",
    "Transportation",
    "Tourism"
  ];

  let baseY=400;
  for(let i=0;i<cats.length;i++){
    text(cats[i],60, baseY+i*28);
    rect(180, baseY+i*28+3, 12,12);
  }

  // dashed bottom
  stroke(55,52,49);
  drawingContext.setLineDash([6,6]);
  line(60, baseY+cats.length*28+20, width-60, baseY+cats.length*28+20);
  drawingContext.setLineDash([]);

  pop();
}

//------------------------------------------------------
// FOOTER
//------------------------------------------------------
function drawFooter() {
  push();
  fill(55,52,49);
  noStroke();
  textAlign(CENTER,BOTTOM);
  textSize(12);
  text("336 Receipts                  Soyoung Myeong                    Japan Trip",
       width/2, height-20);
  pop();
}

//------------------------------------------------------
// REGIONS (Gray PNG)
//------------------------------------------------------
function drawRegions() {
  if(currentMode==="overview") return;

  drawingContext.globalAlpha=0.13;

  for(let region of REGION_NAMES){
    const img=regionImages[region];
    const rr=regionRectsPx[region];
    if(img && rr){
      image(img, rr.x, rr.y, rr.w, rr.h);
    }
  }

  drawingContext.globalAlpha=1;
}

//------------------------------------------------------
// DOT DRAWING (PIXEL SQUARE)
//------------------------------------------------------
function drawSquareDot(x,y,r){
  rectMode(CENTER);
  noStroke();
  fill(0,0,0,200);
  rect(x,y,r,r);
}

//------------------------------------------------------
// DRAW MODE: OVERVIEW
//------------------------------------------------------
function drawOverview() {
  const idx=getHoverCircleIndex();
  let hoverRegion=null;
  if(idx!==-1) hoverRegion=circles[idx].region;

  if(hoverRegion){
    const hovered=circles[idx];
    const sameCat=circles.filter(c=>c.region===hoverRegion && c.category===hovered.category);
    drawConnections(sameCat);
  }

  for(let c of circles){
    let s=c.radius*1.8;
    if(hoverRegion && c.region===hoverRegion) fill(0,0,0,230);
    else fill(0,0,0,120);

    noStroke();
    rectMode(CENTER);
    rect(c.x,c.y,s,s);
  }
}

//------------------------------------------------------
// REGION FOCUS
//------------------------------------------------------
function drawRegionFocus(){
  if(!focusedRegion)return;

  const idx=getHoverCircleIndex();
  if(idx!==-1){
    const hovered=circles[idx];
    if(hovered.region===focusedRegion){
      const sameCat=circles.filter(
        c=>c.region===focusedRegion && c.category===hovered.category
      );
      drawConnections(sameCat);
    }
  }

  for(let c of circles){
    let s=c.radius*1.8;

    if(c.region===focusedRegion) fill(0,0,0,230);
    else fill(0,0,0,40);

    noStroke();
    rectMode(CENTER);
    rect(c.x,c.y,s,s);
  }
}

//------------------------------------------------------
// CITY FOCUS
//------------------------------------------------------
function drawCityFocus(){
  if(!focusedRegion || !focusedCity) return;

  const idx=getHoverCircleIndex();
  if(idx!==-1){
    const hovered=circles[idx];
    if(hovered.region===focusedRegion && hovered.city===focusedCity){
      const sameCat=circles.filter(
        c=>c.region===focusedRegion && c.city===focusedCity && c.category===hovered.category
      );
      drawConnections(sameCat);
    }
  }

  for(let c of circles){
    let s=c.radius*1.8;

    if(c.region===focusedRegion && c.city===focusedCity)
      fill(0,0,0,230);
    else
      fill(0,0,0,30);

    noStroke();
    rectMode(CENTER);
    rect(c.x,c.y,s,s);
  }
}

//------------------------------------------------------
// CONNECTION LINES (CATEGORY CONSTELLATION)
//------------------------------------------------------
function getCategoryStrokeColor(cat){
  switch(cat){
    case "TP": return color(250,160,160);
    case "CS": return color(160,200,250);
    case "RC": return color(200,160,250);
    case "TR": return color(250,200,160);
    case "GS": return color(180,230,180);
    default: return color(120);
  }
}

function drawConnections(circleList){
  if(!circleList || circleList.length<2) return;

  let cx=0, cy=0;
  for(let c of circleList){ cx+=c.x; cy+=c.y; }
  cx/=circleList.length;
  cy/=circleList.length;

  let pts=circleList.map(c=>({c,ang:atan2(c.y-cy, c.x-cx)}));
  pts.sort((a,b)=>a.ang-b.ang);

  const alpha=80+40*sin(frameCount*0.06);
  let cat=circleList[0].category;

  let baseCol=getCategoryStrokeColor(cat);

  stroke(red(baseCol), green(baseCol), blue(baseCol), alpha);
  strokeWeight(1.1);
  noFill();

  beginShape();
  for(let p of pts){
    vertex(p.c.x, p.c.y);
  }
  vertex(pts[0].c.x, pts[0].c.y);
  endShape();
}

//------------------------------------------------------
// DETAIL PANEL (Double Click)
//------------------------------------------------------
function drawDetailPanel(){
  if(!selectedReceipt) return;

  const pad=16;
  const panelW=min(width-60, 700);
  const panelH=240;
  const x0=60;
  const y0=height-panelH-60;
  const corner=8;

  fill(0,0,0,30);
  noStroke();
  rect(x0,y0,panelW,panelH,corner);

  const midX=x0+panelW*0.45;

  // left: image
  const key=selectedReceipt.filename || selectedReceipt.id;
  let holder= receiptImages[key];

  const imgBoxX=x0+pad;
  const imgBoxY=y0+pad;
  const imgBoxW=panelW*0.45 - pad*2;
  const imgBoxH=panelH - pad*2;

  fill(55,52,49);
  textAlign(CENTER,CENTER);
  textSize(12);

  if(!holder){
    text("Double-clicked receipt image\nwill appear here.",
         imgBoxX+imgBoxW/2, imgBoxY+imgBoxH/2);
  } else if(holder.loading){
    text("Loading...", imgBoxX+imgBoxW/2, imgBoxY+imgBoxH/2);
  } else if(holder.error){
    text("Load failed.", imgBoxX+imgBoxW/2, imgBoxY+imgBoxH/2);
  } else {
    let img=holder.img;
    let r=img.width/img.height;
    let w=imgBoxW;
    let h=w/r;
    if(h>imgBoxH){
      h=imgBoxH;
      w=h*r;
    }
    imageMode(CENTER);
    image(img, imgBoxX+imgBoxW/2, imgBoxY+imgBoxH/2, w,h);
  }

  // right text
  textAlign(LEFT,TOP);
  textSize(13);
  let tx=midX+pad;
  let ty=y0+pad;

  let lines=[
    `ID: ${selectedReceipt.id}`,
    `Region: ${selectedReceipt.region}`,
    `City: ${selectedReceipt.city}`,
    `Category: ${selectedReceipt.category}`,
    `Price: ¥${selectedReceipt.price}`,
  ];
  if(selectedReceipt.filename) lines.push(`File: ${selectedReceipt.filename}`);

  for(let s of lines){
    text(s,tx,ty); ty+=18;
  }

  fill(120);
  textSize(11);
  text("Double-click another square to switch.\nDouble-click empty area to close.",
       tx, y0+panelH-pad-30);
}

//------------------------------------------------------
// HOVER DETECTION
//------------------------------------------------------
function screenToWorld(mx,my){
  return{
    x:(mx-viewOffsetX)/viewScale,
    y:(my-viewOffsetY)/viewScale
  };
}

function getHoverCircleIndex(){
  const w=screenToWorld(mouseX,mouseY);
  for(let i=0;i<circles.length;i++){
    const c=circles[i];
    if(dist(w.x,w.y,c.x,c.y)< c.radius*1.4) return i;
  }
  return -1;
}

//------------------------------------------------------
// MOUSE
//------------------------------------------------------
function mousePressed(){
  const idx=getHoverCircleIndex();
  if(idx===-1) selectedReceipt=null;

  if(currentMode==="overview"){
    if(idx!==-1){
      const clicked=circles[idx];
      focusedRegion=clicked.region;
      focusedCity=null;
      currentMode="region";
      zoomToRegion(focusedRegion);
    }
    return;
  }

  if(currentMode==="region"){
    if(idx===-1){
      currentMode="overview";
      focusedRegion=null;
      focusedCity=null;
      resetView();
      regionFade=0;
      regionFadeTarget=0;
      return;
    }

    const c=circles[idx];
    if(c.region!==focusedRegion){
      focusedRegion=c.region;
      focusedCity=null;
      currentMode="region";
      zoomToRegion(focusedRegion);
      return;
    }

    focusedCity=c.city;
    currentMode="city";
    zoomToCity(focusedRegion, focusedCity);
    return;
  }

  if(currentMode==="city"){
    if(idx===-1){
      focusedCity=null;
      currentMode="region";
      zoomToRegion(focusedRegion);
      return;
    }

    const c=circles[idx];

    if(c.region!==focusedRegion){
      focusedRegion=c.region;
      focusedCity=null;
      currentMode="region";
      zoomToRegion(focusedRegion);
      return;
    }

    if(c.city!==focusedCity){
      focusedCity=c.city;
      currentMode="city";
      zoomToCity(focusedRegion,c.city);
      return;
    }
  }
}

//------------------------------------------------------
// DOUBLE CLICK
//------------------------------------------------------
function doubleClicked(){
  const idx=getHoverCircleIndex();
  if(idx===-1){
    selectedReceipt=null;
    return false;
  }

  const r=circles[idx];
  selectedReceipt=r;

  const key=r.filename||r.id;
  if(key && !receiptImages[key]){
    receiptImages[key]={loading:true,img:null,error:false};
    const path=`assets/receipts/${r.filename}`;

    loadImage(path,
      img=>{receiptImages[key]={loading:false,img,error:false}},
      ()=>{receiptImages[key]={loading:false,img:null,error:true}}
    );
  }

  return false;
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
// BOUNDS
//------------------------------------------------------
function getJapanBounds(){
  let minX=99999, minY=99999;
  let maxX=-99999, maxY=-99999;

  for(let region of REGION_NAMES){
    const rr=regionRectsPx[region];
    if(!rr)continue;

    minX=min(minX, rr.x);
    minY=min(minY, rr.y);
    maxX=max(maxX, rr.x+rr.w);
    maxY=max(maxY, rr.y+rr.h);
  }
  return {x:minX,y:minY, w:maxX-minX, h:maxY-minY};
}

function getCityBounds(region,city){
  const arr=circles.filter(c=>c.region===region && c.city===city);
  if(arr.length===0) return null;

  let minX=99999,minY=99999,maxX=-99999,maxY=-99999;
  for(let c of arr){
    minX=min(minX,c.x);
    minY=min(minY,c.y);
    maxX=max(maxX,c.x);
    maxY=max(maxY,c.y);
  }
  return {x:minX,y:minY,w:maxX-minX,h:maxY-minY};
}
