let receiptsData = [];
let receiptImages = {};

async function preloadJSON() {
  // JSON 불러오기 (GitHub 캐시 무효화 포함)
  const response = await fetch("data/receipts02.json?v=" + Date.now());
  const jsonData = await response.json();

  // 혹시 Object 형태( {0: {...}, 1: {...}} )이면 배열로 변환
  if (!Array.isArray(jsonData)) {
    console.warn("JSON was not array → converting using Object.values()");
    receiptsData = Object.values(jsonData);
  } else {
    receiptsData = jsonData;
  }

  console.log("Loaded receiptsData:", receiptsData);
  console.log("isArray?", Array.isArray(receiptsData));
}

async function preload() {
  // preload에서는 async가 지원되지만, p5가 기다려주지 않음 → 직접 await 필요
  await preloadJSON();

  // 이미지 미리 로드 (선택)
  for (let r of receiptsData) {
    let path = "assets/receipts/" + r.filename;
    receiptImages[r.id] = loadImage(path,
      () => console.log("Loaded image:", path),
      () => console.warn("Failed to load image:", path)
    );
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);

  background(20);

  fill(255);
  textSize(20);
  text("Testing receipt images…", 50, 50);

  // JSON이 배열인지 다시 확인
  console.log("Final isArray?", Array.isArray(receiptsData));
}

function draw() {
  background(30);
  
  if (receiptsData.length === 0) {
    fill(200, 100, 100);
    textSize(32);
    text("JSON not loaded yet…", 50, 150);
    return;
  }

  // 첫 10개만 테스트로 그리기
  let x = 150;
  let y = 200;

  for (let i = 0; i < min(10, receiptsData.length); i++) {
    let r = receiptsData[i];
    let img = receiptImages[r.id];
    if (img) image(img, x, y, 120, 160);
    x += 150;
  }

  noLoop();
}
