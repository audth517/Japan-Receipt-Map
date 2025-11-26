let receiptsData = [];
let receiptImages = {};
let imagesLoaded = 0;
let totalImages = 0;
let ready = false;

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

        // 모든 이미지 로딩 끝나면 ready = true
        if (imagesLoaded === totalImages) {
          ready = true;
        }
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

  // 아직 로딩 중이면 메시지 출력
  if (!ready) {
    fill(255);
    textSize(24);
    text(`Loading images… ${imagesLoaded}/${totalImages}`, 50, 100);
    return;
  }

  // 이미지 로딩 완료됨 → 첫 10개 표시
  let x = 150;
  let y = 200;

  for (let i = 0; i < 10 && i < receiptsData.length; i++) {
    let id = receiptsData[i].id;
    let img = receiptImages[id];
    if (img) image(img, x, y, 120, 160);
    x += 150;
  }
}
