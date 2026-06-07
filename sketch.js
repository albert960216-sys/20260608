let video;
let handpose;
let predictions = [];
let paddleX = 200; // 擋板的初始 X 座標
let ball;
let modelLoaded = false; // 用於自我檢查模型載入狀態
let bricks = [];
let gameState = "WAITING"; // 遊戲狀態：WAITING, PLAY, GAMEOVER, WIN
const rows = 5; // 增加到 5 層
const cols = 8;

function setup() {
  createCanvas(windowWidth, windowHeight);
  video = createCapture(VIDEO);
  video.size(width, height);

  // 1. 初始化 Handpose 模型 (修正：v1.x 版為 handPose，大寫 P)
  handpose = ml5.handPose(video, () => {
    modelLoaded = true;
    console.log("Model Ready!");
    // 2. 修正：v1.x 建議使用 detectStart 來啟動持續偵測
    handpose.detectStart(video, (results) => {
      predictions = results;
    });
  });

  // 隱藏原始的 HTML 影片元件，我們要在畫布上繪製
  video.hide();

  // 初始化球與磚塊
  resetGame();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  video.size(width, height);
}

function resetGame() {
  ball = new Ball();
  bricks = [];
  let baseWidth = width / cols;
  let baseHeight = 25;
  let brickWidth = baseWidth * 0.8; // 縮小到 80%
  let brickHeight = baseHeight * 0.8; // 縮小到 80%

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let b = new Brick(c * baseWidth + baseWidth / 2, r * baseHeight + 50, brickWidth, brickHeight, r);
      if (random(1) < 0.15) {
        b.active = false; // 15% 的機率消失
      }
      bricks.push(b);
    }
  }
  gameState = "WAITING";
}

function draw() {
  // 確保每一幀都先清空畫布，避免產生黃色軌跡
  background(255);

  // 1. 處理水平鏡像：將畫布原點移至右側並翻轉 X 軸
  translate(width, 0);
  scale(-1, 1);

  // 繪製攝影機畫面
  image(video, 0, 0, width, height);

  // 2. 偵測邏輯
  if (predictions.length > 0) {
    // 取得第一隻偵測到的手
    let hand = predictions[0];
    
    // 3. 更新食指尖端座標 (新版資料結構：hand.index_finger_tip)
    let indexFinger = hand.index_finger_tip;
    
    // 更新擋板座標
    // 1. 偵測優化：使用 lerp 讓擋板移動更平滑，數值 0.2 可以根據需求調整（越小越平滑但延遲感較重）
    paddleX = lerp(paddleX, indexFinger.x, 0.2);

    // 在食指尖端畫一個小圓點，方便確認偵測位置
    fill(0, 255, 0);
    noStroke();
    ellipse(indexFinger.x, indexFinger.y, 15, 15);

    // 檢查是否「手部打開」以重新開始遊戲
    if (gameState === "GAMEOVER" || gameState === "WIN") {
      let isOpen = hand.index_finger_tip.y < hand.index_finger_pip.y &&
                   hand.middle_finger_tip.y < hand.middle_finger_pip.y &&
                   hand.ring_finger_tip.y < hand.ring_finger_pip.y &&
                   hand.pinky_finger_tip.y < hand.pinky_finger_pip.y;
      
      if (isOpen) {
        resetGame();
        gameState = "PLAY";
      }
    }

    // 如果目前在等待狀態且偵測到手，就開始遊戲
    if (gameState === "WAITING") {
      gameState = "PLAY";
    }
  }

  // 自我檢查 UI (不論遊戲狀態，都顯示在最上層)
  push();
  scale(-1, 1);
  translate(-width, 0);
  fill(0);
  textSize(14);
  textAlign(LEFT);
  let statusText = !modelLoaded ? "🔄 模型載入中..." : (predictions.length > 0 ? "✅ 偵測中 (手部已發現)" : "❌ 未偵測到手部");
  text("狀態: " + statusText, 20, 30);
  pop();

  if (gameState === "WAITING") {
    // 等待偵測的畫面
    push();
    scale(-1, 1);
    translate(-width, 0);
    fill(0);
    textAlign(CENTER);
    textSize(24);
    text(!modelLoaded ? "Model Loading..." : "Ready! Please show your hand.", width / 2, height / 2);
    textSize(16);
    text("Please show your hand to the camera to start", width / 2, height / 2 + 40);
    pop();
  } else if (gameState === "PLAY") {
    // 3. 繪製擋板 (Paddle)
    fill(255, 50, 50);
    rectMode(CENTER);
    rect(paddleX, height - 30, 100, 20, 5);

    // 4. 更新與繪製球
    ball.update();
    ball.checkEdges();
    ball.checkPaddle(paddleX, height - 30, 100);
    ball.display();

    // 5. 更新與繪製磚塊
    for (let i = bricks.length - 1; i >= 0; i--) {
      bricks[i].display();
      if (bricks[i].active && ball.checkBrick(bricks[i])) {
        bricks[i].active = false; // 撞到後磚塊消失
      }
    }
    
    // 2. 邏輯優化：增加勝利判定 (當沒有任何主動磚塊時)
    let activeBricks = bricks.filter(b => b.active);
    if (activeBricks.length === 0 && bricks.length > 0) {
      gameState = "WIN";
    }

    // 檢查是否掉落底部
    if (ball.y > height) {
      gameState = "GAMEOVER";
    }
  } else if (gameState === "GAMEOVER") {
    // 遊戲結束畫面 (需要處理鏡像文字問題)
    push();
    scale(-1, 1); // 再次翻轉回來讓文字正常
    translate(-width, 0);
    fill(0); // 將文字改為黑色
    textAlign(CENTER);
    textSize(48);
    text("GAME OVER", width / 2, height / 2);
    textSize(20);
    text("Open Hand to Restart", width / 2, height / 2 + 50);
    pop();
  } else if (gameState === "WIN") {
    // 3. 增加勝利畫面顯示
    push();
    scale(-1, 1);
    translate(-width, 0);
    fill(0, 150, 0);
    textAlign(CENTER);
    textSize(48);
    text("YOU WIN!", width / 2, height / 2);
    textSize(20);
    text("Open Hand to Play Again", width / 2, height / 2 + 50);
    pop();
  }
}

// --- 物件導向類別設計 ---

class Ball {
  constructor() {
    this.x = width / 2;
    this.y = height / 2;
    this.r = 10;
    this.speedX = 5;
    this.speedY = -5;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
  }

  display() {
    fill(255, 255, 0);
    noStroke();
    ellipse(this.x, this.y, this.r * 2);
  }

  checkEdges() {
    if (this.x < 0 || this.x > width) this.speedX *= -1;
    if (this.y < 0) this.speedY *= -1;
  }

  checkPaddle(px, py, pw) {
    // 簡單的圓形與矩形碰撞偵測
    // 檢查球是否從上方撞擊擋板
    if (this.y + this.r >= py - 10 && this.y - this.r <= py + 10 && 
        this.x + this.r > px - pw / 2 && this.x - this.r < px + pw / 2) {
      
      // 確保球是向下移動時才反彈 (避免從側面或下方誤判)
      if (this.speedY > 0) {
        this.speedY *= -1; // 反轉垂直速度，向上彈

        // 計算撞擊點相對於擋板中心的偏移量
        // 範圍從 -1 (最左邊) 到 1 (最右邊)
        let hitSpot = (this.x - px) / (pw / 2); 
        
        // 根據撞擊點調整水平速度，最大水平速度為 7
        this.speedX = hitSpot * 7; 
      }
    }
  }

  checkBrick(brick) {
    if (!brick.active) return false;
    // 優化碰撞偵測：考慮球的半徑 (this.r)
    if (this.x + this.r > brick.x - brick.w/2 && this.x - this.r < brick.x + brick.w/2 &&
        this.y + this.r > brick.y - brick.h/2 && this.y - this.r < brick.y + brick.h/2) {
      this.speedY *= -1;
      return true;
    }
    return false;
  }
}

class Brick {
  constructor(x, y, w, h, row) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.active = true;
    // 根據不同排給予不同顏色
    this.color = [color(255, 100, 100), color(100, 255, 100), color(100, 100, 255)][row % 3];
  }

  display() {
    if (this.active) {
      fill(this.color);
      stroke(255);
      rectMode(CENTER);
      rect(this.x, this.y, this.w, this.h);
    }
  }
}
