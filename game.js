const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ==========================================
// LOAD ASSET GAMBAR & AUDIO
// ==========================================
const playerImg = new Image();
playerImg.src = "assets/images/player.png";

const coinImg = new Image();
coinImg.src = "assets/images/coin.png";

const rockImg = new Image();
rockImg.src = "assets/images/trap.png";

const islandImg = new Image();
islandImg.src = "assets/images/island.png";

// Audio & SFX
const coinSfx = new Audio("assets/sfx/coin.mp3");
const trapSfx = new Audio("assets/sfx/trap.mp3");
const walkSfx = new Audio("assets/sfx/walk.mp3");
walkSfx.loop = true;

const oceanBgm = new Audio("assets/sfx/ocean_bgm.mp3");
oceanBgm.loop = true;
oceanBgm.volume = 0.5;

function playSfx(audio) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ==========================================
// KONFIGURASI & UKURAN SESUAI PERMINTAAN
// ==========================================
const MAX_HEALTH = 3; 
const START_TIME = 60; 
const COIN_SCORE = 10;
const MAX_SCORE = 100;

// World & Spacing diperbesar karena Player Size besar (200x200)
const WORLD_WIDTH = 2600;
const WORLD_HEIGHT = 2000;
const SAFE_SPAWN_DISTANCE = 400; 

const COIN_COUNT = 10;
const ROCK_COUNT = 9;  
const ISLAND_COUNT = 6; 

// Ukuran Sesuai Request Kamu
const PLAYER_SIZE = { width: 200, height: 200 };
const COIN_RADIUS = 60;     
const ROCK_SIZE = 120;       
const ISLAND_SIZE = 220;    

const PLAYER_SPEED = 2.5; 
const FISHING_TIME_REQUIRED = 1.2; 

const player = {
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  width: PLAYER_SIZE.width,
  height: PLAYER_SIZE.height,
  speed: PLAYER_SPEED,
  angle: 0,
  targetAngle: 0,
  invincibleTimer: 0,
  color: "#00cc44"
};

const camera = {
  x: 0,
  y: 0,
  width: canvas.width,
  height: canvas.height
};

let score = 0;
let health = MAX_HEALTH;
let timeLeft = START_TIME;
let gameState = "menu";
let lastTime = 0;
let waveOffset = 0;

let fishingProgress = 0;
let activeFishingCoin = null;

const keysPressed = {};
const coinEffects = [];
const wakeParticles = []; 

const coins = Array.from({ length: COIN_COUNT }, () => ({ x: 0, y: 0, radius: COIN_RADIUS }));
const rocks = Array.from({ length: ROCK_COUNT }, () => ({ x: 0, y: 0, size: ROCK_SIZE }));
const islands = Array.from({ length: ISLAND_COUNT }, () => ({ x: 0, y: 0, size: ISLAND_SIZE }));

function getValidPosition(radiusOrSize, isCoin = false) {
  let pos;
  let attempts = 0;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;

  do {
    pos = {
      x: Math.random() * (WORLD_WIDTH - radiusOrSize * 2) + radiusOrSize,
      y: Math.random() * (WORLD_HEIGHT - radiusOrSize * 2) + radiusOrSize
    };

    let invalid = false;

    const distToPlayer = Math.hypot(pos.x - playerCenterX, pos.y - playerCenterY);
    if (distToPlayer < SAFE_SPAWN_DISTANCE) invalid = true;

    if (!invalid) {
      for (const island of islands) {
        const icx = island.x + island.size / 2;
        const icy = island.y + island.size / 2;
        if (Math.hypot(pos.x - icx, pos.y - icy) < (island.size / 2 + radiusOrSize + 50)) {
          invalid = true;
          break;
        }
      }
    }

    if (!invalid) {
      for (const rock of rocks) {
        if (
          pos.x + radiusOrSize > rock.x &&
          pos.x - radiusOrSize < rock.x + rock.size &&
          pos.y + radiusOrSize > rock.y &&
          pos.y - radiusOrSize < rock.y + rock.size
        ) {
          invalid = true;
          break;
        }
      }
    }

    if (!invalid && isCoin) {
      for (const coin of coins) {
        if (coin.x && coin.y && Math.hypot(pos.x - coin.x, pos.y - coin.y) < radiusOrSize * 4) {
          invalid = true;
          break;
        }
      }
    }

    attempts++;
    if (!invalid || attempts > 300) break;
  } while (true);

  return pos;
}

document.addEventListener("keydown", (e) => { keysPressed[e.key.toLowerCase()] = true; });
document.addEventListener("keyup", (e) => { keysPressed[e.key.toLowerCase()] = false; });

function resetPlayer() {
  player.x = WORLD_WIDTH / 2;
  player.y = WORLD_HEIGHT / 2;
  player.angle = 0;
  player.targetAngle = 0;
  player.invincibleTimer = 0;
}

function resetObstacles() {
  islands.forEach((island) => {
    const pos = getValidPosition(island.size / 2);
    island.x = pos.x - island.size / 2;
    island.y = pos.y - island.size / 2;
  });

  rocks.forEach((rock) => {
    const pos = getValidPosition(rock.size / 2);
    rock.x = pos.x - rock.size / 2;
    rock.y = pos.y - rock.size / 2;
  });
}

function resetCoin(coin) {
  const pos = getValidPosition(coin.radius, true);
  coin.x = pos.x;
  coin.y = pos.y;
}

function updateHealthDisplay() {
  let hearts = "";
  for (let i = 0; i < health; i++) hearts += "❤️ ";
  document.getElementById("healthDisplay").textContent = hearts || "💀 Karam";
}

function resetGame() {
  score = 0;
  health = MAX_HEALTH;
  timeLeft = START_TIME;
  coinEffects.length = 0;
  wakeParticles.length = 0;
  fishingProgress = 0;
  activeFishingCoin = null;
  
  resetPlayer();
  resetObstacles();
  coins.forEach((coin) => resetCoin(coin));
  updateHealthDisplay();

  gameState = "playing";
  lastTime = performance.now();

  oceanBgm.currentTime = 0;
  oceanBgm.play().catch(() => {});

  document.getElementById("gameMenu").classList.add("hidden");
  document.getElementById("gameButton").textContent = "Mulai Berlayar";
  document.getElementById("menuTitle").textContent = "Kapal Nelayan";
  document.getElementById("menuText").textContent = "";
}

function loseGame(reason) {
  gameState = "lost";
  walkSfx.pause();
  oceanBgm.pause();
  playSfx(trapSfx);

  document.getElementById("menuTitle").textContent = "Game Over";
  document.getElementById("menuText").textContent = reason;
  document.getElementById("gameButton").textContent = "Coba Lagi";
  document.getElementById("gameMenu").classList.remove("hidden");
}

function winGame() {
  gameState = "won";
  walkSfx.pause();
  oceanBgm.pause();

  document.getElementById("menuTitle").textContent = "Tangkapan Melimpah!";
  document.getElementById("menuText").textContent = "Kamu berhasil mengumpulkan 100 skor ikan!";
  document.getElementById("gameButton").textContent = "Berlayar Lagi";
  document.getElementById("gameMenu").classList.remove("hidden");
}

document.getElementById("gameButton").addEventListener("click", resetGame);

// ==========================================
// COLLIDER AKURAT SESUAI SILUET KAPAL (LINGKARAN/ELIPS)
// ==========================================
function isPlayerCollidingWithRect(rock) {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const pRadius = 75; // Radius efektif badan kapal 200x200

  const closestX = Math.max(rock.x, Math.min(pcx, rock.x + rock.size));
  const closestY = Math.max(rock.y, Math.min(pcy, rock.y + rock.size));

  const dx = pcx - closestX;
  const dy = pcy - closestY;

  return (dx * dx + dy * dy) <= (pRadius * pRadius);
}

function isPlayerCollidingWithCircle(island) {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const pRadius = 75;

  const icx = island.x + island.size / 2;
  const icy = island.y + island.size / 2;
  const iRadius = island.size / 2;

  const dx = pcx - icx;
  const dy = pcy - icy;

  return (dx * dx + dy * dy) <= ((pRadius + iRadius - 30) * (pRadius + iRadius - 30));
}

function getClosestFishInRange() {
  let closest = null;
  let minDist = 100; // Jangkauan mancing disesuaikan ukuran besar

  coins.forEach((coin) => {
    const dx = (player.x + player.width / 2) - coin.x;
    const dy = (player.y + player.height / 2) - coin.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= minDist + coin.radius) {
      minDist = dist;
      closest = coin;
    }
  });
  return closest;
}

function createCoinEffect(x, y) {
  coinEffects.push({ x, y, radius: COIN_RADIUS, alpha: 1 });
}

function updateCoinEffects() {
  for (let i = coinEffects.length - 1; i >= 0; i--) {
    const effect = coinEffects[i];
    effect.radius += 3.0;
    effect.alpha -= 0.03;
    if (effect.alpha <= 0) coinEffects.splice(i, 1);
  }
}

function updateWakeParticles(isMoving) {
  if (isMoving) {
    const backX = (player.x + player.width / 2) - Math.cos(player.angle) * (player.width / 3);
    const backY = (player.y + player.height / 2) - Math.sin(player.angle) * (player.height / 3);
    wakeParticles.push({ x: backX, y: backY, radius: 6, alpha: 0.8 });
  }

  for (let i = wakeParticles.length - 1; i >= 0; i--) {
    const p = wakeParticles[i];
    p.radius += 0.5;
    p.alpha -= 0.035;
    if (p.alpha <= 0) wakeParticles.splice(i, 1);
  }
}

function update(deltaTime) {
  if (gameState !== "playing") return;

  let moveX = 0;
  let moveY = 0;

  if (keysPressed["arrowright"] || keysPressed["d"]) moveX += 1;
  if (keysPressed["arrowleft"] || keysPressed["a"])  moveX -= 1;
  if (keysPressed["arrowup"] || keysPressed["w"])    moveY -= 1;
  if (keysPressed["arrowdown"] || keysPressed["s"])  moveY += 1;

  const isMoving = moveX !== 0 || moveY !== 0;

  const fishInRange = getClosestFishInRange();
  if (keysPressed["e"] && fishInRange && !isMoving) {
    activeFishingCoin = fishInRange;
    fishingProgress += deltaTime / 1000;

    if (fishingProgress >= FISHING_TIME_REQUIRED) {
      playSfx(coinSfx);
      createCoinEffect(activeFishingCoin.x, activeFishingCoin.y);
      resetCoin(activeFishingCoin);
      score += COIN_SCORE;
      fishingProgress = 0;
      activeFishingCoin = null;

      if (score >= MAX_SCORE) {
        score = MAX_SCORE;
        winGame();
      }
    }
  } else {
    fishingProgress = 0;
    activeFishingCoin = null;

    if (isMoving) {
      player.targetAngle = Math.atan2(moveY, moveX);
      const len = Math.hypot(moveX, moveY);
      player.x += (moveX / len) * player.speed;
      player.y += (moveY / len) * player.speed;

      if (walkSfx.paused) walkSfx.play().catch(() => {});
    } else {
      walkSfx.pause();
    }
  }

  let angleDiff = player.targetAngle - player.angle;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  player.angle += angleDiff * 0.15;

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > WORLD_WIDTH) player.x = WORLD_WIDTH - player.width;
  if (player.y < 0) player.y = 0;
  if (player.y + player.height > WORLD_HEIGHT) player.y = WORLD_HEIGHT - player.height;

  camera.x = (player.x + player.width / 2) - camera.width / 2;
  camera.y = (player.y + player.height / 2) - camera.height / 2;
  camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH - camera.width));
  camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT - camera.height));

  timeLeft -= deltaTime / 1000;
  if (timeLeft <= 0) {
    timeLeft = 0;
    loseGame("Waktu habis! Kamu belum mencapai target ikan.");
    return;
  }

  if (player.invincibleTimer > 0) {
    player.invincibleTimer -= deltaTime;
  }

  updateWakeParticles(isMoving);

  // Cek Tabrakan Batu dengan Collider Akurat
  if (player.invincibleTimer <= 0) {
    rocks.forEach((rock) => {
      if (isPlayerCollidingWithRect(rock)) {
        playSfx(trapSfx);
        health -= 1;
        updateHealthDisplay();
        player.invincibleTimer = 1200;

        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        const rockCenterX = rock.x + rock.size / 2;
        const rockCenterY = rock.y + rock.size / 2;

        let pushX = playerCenterX - rockCenterX;
        let pushY = playerCenterY - rockCenterY;
        const dist = Math.hypot(pushX, pushY) || 1;

        player.x += (pushX / dist) * 80;
        player.y += (pushY / dist) * 80;

        if (health <= 0) {
          loseGame("Kapal kamu rusak parah karena menabrak batu!");
        }
      }
    });
  }

  // Cek Tabrakan Pulau
  islands.forEach((island) => {
    if (isPlayerCollidingWithCircle(island)) {
      loseGame("Kapal kamu karam karena menabrak pulau!");
    }
  });

  updateCoinEffects();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  gradient.addColorStop(0, "#0284c7");
  gradient.addColorStop(0.5, "#0369a1");
  gradient.addColorStop(1, "#075985");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  waveOffset += 0.03;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;

  for (let y = 50; y < WORLD_HEIGHT; y += 80) {
    ctx.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += 25) {
      const waveY = Math.sin(x * 0.02 + waveOffset + y) * 6;
      if (x === 0) ctx.moveTo(x, y + waveY);
      else ctx.lineTo(x, y + waveY);
    }
    ctx.stroke();
  }
}

// ==========================================
// RIPPLE (RILAK OMBAK) SESUAI SILUET OVAL/ELIPS KAPAL
// ==========================================
function drawSilhouetteRipple(x, y, width, height, isCircle = false, angle = 0) {
  const time = Date.now() * 0.004;
  const expand = Math.sin(time) * 5 + 10;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 3;
  ctx.fillStyle = "transparent";

  if (isCircle) {
    const radius = width / 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + expand, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Menggunakan ctx.ellipse agar riak mengikuti bentuk kapal yang lonjong/oval berotasi
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    const rx = width / 2.6 + expand;
    const ry = height / 3.2 + expand;
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCoin(coin) {
  if (coinImg.complete && coinImg.naturalWidth !== 0) {
    ctx.drawImage(coinImg, coin.x - coin.radius, coin.y - coin.radius, coin.radius * 2, coin.radius * 2);
  } else {
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawRock(rock) {
  const rx = rock.x + rock.size / 2;
  const ry = rock.y + rock.size / 2;
  
  drawSilhouetteRipple(rx, ry, rock.size, rock.size, false, 0);

  if (rockImg.complete && rockImg.naturalWidth !== 0) {
    ctx.drawImage(rockImg, rock.x, rock.y, rock.size, rock.size);
  } else {
    ctx.fillStyle = rock.color;
    ctx.fillRect(rock.x, rock.y, rock.size, rock.size);
  }
}

function drawIsland(island) {
  const ix = island.x + island.size / 2;
  const iy = island.y + island.size / 2;

  drawSilhouetteRipple(ix, iy, island.size, island.size, true, 0);

  if (islandImg.complete && islandImg.naturalWidth !== 0) {
    ctx.drawImage(islandImg, island.x, island.y, island.size, island.size);
  } else {
    ctx.fillStyle = island.color;
    ctx.beginPath();
    ctx.arc(ix, iy, island.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawPlayer() {
  if (player.invincibleTimer > 0) {
    const flashIndex = Math.floor(player.invincibleTimer / 100);
    if (flashIndex % 2 === 0) return;
  }

  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;

  // Riak air kini berbentuk elips dan ikut berotasi mengikuti bentuk kapal
  drawSilhouetteRipple(px, py, player.width, player.height, false, player.angle);

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.angle);

  if (playerImg.complete && playerImg.naturalWidth !== 0) {
    ctx.drawImage(playerImg, -player.width / 2, -player.height / 2, player.width, player.height);
  } else {
    ctx.fillStyle = player.color;
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
  }

  if (player.invincibleTimer > 0) {
    ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
  }

  ctx.restore();
}

function drawWakeParticles() {
  wakeParticles.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
    ctx.fill();
  });
}

function drawCoinEffects() {
  coinEffects.forEach((effect) => {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(56, 189, 248, " + effect.alpha + ")";
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}

function drawFishingUI() {
  if (fishingProgress > 0 && activeFishingCoin) {
    const cx = player.x + player.width / 2;
    const cy = player.y - 25;
    const progressRatio = fishingProgress / FISHING_TIME_REQUIRED;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(cx - 40, cy - 10, 80, 10);

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(cx - 40, cy - 10, 80 * progressRatio, 10);

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Mancing...", cx, cy - 16);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawBackground();
  drawWakeParticles();

  rocks.forEach((rock) => drawRock(rock));
  islands.forEach((island) => drawIsland(island));
  coins.forEach((coin) => drawCoin(coin));

  drawCoinEffects();
  drawPlayer();
  drawFishingUI();

  ctx.restore();

  document.getElementById("score").textContent = score + " / " + MAX_SCORE;
  document.getElementById("timer").textContent = Math.ceil(timeLeft) + "s";
}

function gameLoop(currentTime) {
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  update(deltaTime);
  draw();

  requestAnimationFrame(gameLoop);
}

lastTime = performance.now();
requestAnimationFrame(gameLoop);