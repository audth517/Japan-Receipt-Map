let receiptsData = [];
let receiptImages = {};
let imagesLoaded = 0;
let totalImages = 0;

async function preloadJSON() {
  const response = await fetch("data/receipts.json?v=" + Date.now());
  const jsonData = await response.json();

  receiptsData = Array.isArray(jsonData) ? jsonData : Object.values(jsonData);
}

async function preload() {
  await preloadJSON();

  totalImages = receiptsData.length;

  for (let r of receiptsData) {
    let path = "assets/receipts/" + r.filename;
    receiptImages[r.id] = loadImage(
      path,
      () => {
        imagesLoaded++;
        console.log("Loaded:", path);
      },
      () => console.error("Failed:", path)
    );
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);
}

function draw() {
  background(20);

  // 모든 이미지가 로드되기 전에는 "loading" 표시
  if (imagesLoaded < totalImages) {
    fill(255);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, 50, 100);
    return;
  }

  // 이미지 로드 끝 → 화면에 그리기
  let x = 150;
  let y = 200;

  for (let i = 0; i < 10 && i < receiptsData.length; i++) {
    let id = receiptsData[i].id;
    let img = receiptImages[id];
    if (img) image(img, x, y, 120, 160);
    x += 150;
  }

  noLoop();
}
