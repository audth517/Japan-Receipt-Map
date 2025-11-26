let receiptsData;
let receiptImages = {};

function preload() {
  receiptsData = loadJSON("data/receipts.json");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(30);

  console.log("receiptsData raw:", receiptsData);
  console.log("Array.isArray:", Array.isArray(receiptsData));
  console.log("keys:", Object.keys(receiptsData));

  // 테스트 - 영수증 첫 10개 그림
  let x = 100;
  let y = 100;

  for (let i = 0; i < min(10, receiptsData.length); i++) {
    let r = receiptsData[i];
    let img = loadImage("assets/receipts/" + r.filename);
    image(img, x, y, 100, 140);
    x += 120;
  }
}
