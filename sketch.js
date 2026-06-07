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

  // 1. 初始化 Handpose 模型
  handpose = ml5.handPose(video, () => {
    modelLoaded = true;
    console.log("Model Ready!");
    // 2. 啟動持續偵測
    handpose.detectStart(video, (results) => {
      predictions = results;
    });
  });

  // 隱藏原始的 HTML 影片元件
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
  let brickWidth = baseWidth * 0.8; 
  let brickHeight = baseHeight * 0.8; 

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
  // 1. 每一幀開頭清空畫布
  background(255);

  // 2. 【核心修正】將鏡像與遊戲本體包在 push() / pop() 內
  // 這樣一來，鏡像翻轉與平移只會作用在內部的視訊、球、擋板與磚塊上，不會無限疊加
  push();
  translate(width, 0);
  scale(-1, 1);

  // 繪製攝影機畫面
  image(video, 0, 0, width, height);

  // 偵測邏輯
  if (predictions.length > 0) {
    let hand = predictions[0];
    let indexFinger = hand.index_finger_tip;
    
    // 使用 lerp 讓擋板移動更平滑
    paddleX = lerp(paddleX, indexFinger.x, 0.2);

    // 在食指尖端畫一個小圓點
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

    if (gameState === "WAITING") {
      gameState = "PLAY";
    }
  }

  // 遊戲處於 PLAY 狀態時的更新與繪製（必須在鏡像矩陣內，擋板才會跟著手走）
  if (gameState === "PLAY") {
    // 繪製擋板
    fill(255, 50, 50);
    rectMode(CENTER);
    rect(paddleX, height - 30, 100, 20, 5);

    // 更新與繪製球
    ball.update();
    ball.checkEdges();
    ball.checkPaddle(paddleX, height - 30, 100);
    ball.display();

    // 更新與繪製磚塊
    for (let i = bricks.length - 1; i >= 0; i--) {
      bricks[i].display();
      if (bricks[i].active && ball.checkBrick(bricks[i])) {
        bricks[i].active = false;
      }
    }
    
    // 勝利判定
    let activeBricks = bricks.filter(b => b.active);
    if (activeBricks.length === 0 && bricks.length > 0) {
      gameState = "WIN";
    }

    // 檢查是否掉落底部
    if (ball.y > height) {
      gameState = "GAMEOVER";
    }
  }
  pop(); // 【核心修正】還原畫布座標系，此時座標系回到最原始、正向的狀態！

  // 3. 處理 UI 與文字顯示 (因為上面 pop() 了，這裡不需要再隨便 scale(-1, 1) 翻轉文字)
  fill(0);
  textSize(14);
  textAlign(LEFT, TOP);
  let statusText = !modelLoaded ? "🔄 模型載入中..." : (predictions.length > 0 ? "✅ 偵測中 (手部已發現)" : "❌ 未偵測到手部");
  text("狀態: " + statusText, 20, 20);

  // 根據不同狀態顯示對應的正向文字
  textAlign(CENTER, CENTER);
  if (gameState === "WAITING") {
    textSize(24);
    text(!modelLoaded ? "Model Loading..." : "Ready! Please show your hand.", width / 2, height / 2);
    textSize(16);
    text("Please show your hand to the camera to start", width / 2, height / 2 + 40);
  } else if (gameState === "GAMEOVER") {
    fill(255, 0, 0);
    textSize(48);
    text("GAME OVER", width / 2, height / 2);
    fill(0);
    textSize(20);
    text("Open Hand to Restart", width / 2, height / 2 + 50);
  } else if (gameState === "WIN") {
    fill(0, 150, 0);
    textSize(48);
    text("YOU WIN!", width / 2, height / 2);
    fill(0);
    textSize(20);
    text("Open Hand to Play Again", width / 2, height / 2 + 50);
  }
}

// --- 物件導向類別設計 (保持不變) ---

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
    if (this.y + this.r >= py - 10 && this.y - this.r <= py + 10 && 
        this.x + this.r > px - pw / 2 && this.x - this.r < px + pw / 2) {
      
      if (this.speedY > 0) {
        this.speedY *= -1;
        let hitSpot = (this.x - px) / (pw / 2); 
        this.speedX = hitSpot * 7; 
      }
    }
  }

  checkBrick(brick) {
    if (!brick.active) return false;
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
