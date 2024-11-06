const app = new PIXI.Application({
   width: window.innerWidth,
   height: window.innerHeight,
   backgroundColor: "#f4f3f2",
   resizeTo: window,
   autoDensity: true,
   resolution: window.devicePixelRatio || 1
});
document.body.appendChild(app.view);

const gridContainer = new PIXI.Container();
app.stage.addChild(gridContainer);

gridContainer.interactive = true;
gridContainer.on("pointerdown", (event) => {
   if (gameState.isGameOver) return;

   const pos = event.data.getLocalPosition(gridContainer);
   const cellX = Math.floor(pos.x / cellSize);
   const cellY = Math.floor(pos.y / cellSize);

   placeMark(cellX, cellY);
});

app.stage.interactive = true;
app.stage.hitArea = app.screen;

const cellSize = 50;
let scale = 1;
let isDragging = false;
let hasMoved = false;
let totalMovement = 0;
let velocity = { x: 0, y: 0 };
let lastDragPosition = null;
let lastDragTime = 0;
let dragStart = { x: 0, y: 0 };

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_SPEED = 0.1;
const STRIKE_COLOR = "#000000";
const STRIKE_WIDTH = 5;
const STRIKE_ANIMATION_DURATION = 200;
const FRICTION = 0.85;
const MIN_VELOCITY = 0.1;
const VELOCITY_DAMPING = 0.3;
const CAMERA_SPEED = 0.1;
const MARK_PADDING = 20;
const WINNING_LENGTH = 5;

const placedMarks = new Map();
const potentialWins = new Map();

let winningCells = null;

document.getElementById("singlePlayerBtn").addEventListener("click", () => {
   gameState.gameMode = "single";
   document.getElementById("menuOverlay").style.display = "none";
   document.getElementById("gameStatus").textContent = "X's Turn";
});

app.view.addEventListener("wheel", (event) => {
   event.preventDefault();

   const mousePos = {
      x: event.offsetX,
      y: event.offsetY
   };

   const zoomFactor = event.deltaY < 0 ? (1 + ZOOM_SPEED) : (1 - ZOOM_SPEED);
   const newScale = scale * zoomFactor;

   if (!(newScale >= MIN_SCALE && newScale <= MAX_SCALE)) {
      return;
   }
   const localPos = {
      x: (mousePos.x - gridContainer.x) / scale,
      y: (mousePos.y - gridContainer.y) / scale
   };

   const newX = mousePos.x - localPos.x * newScale;
   const newY = mousePos.y - localPos.y * newScale;

   scale = newScale;
   gridContainer.scale.set(scale);
   gridContainer.x = newX;
   gridContainer.y = newY;

   drawGrid();
   updateHoverCell({
      data: {
         getLocalPosition: () => ({
            x: (mousePos.x - newX) / newScale,
            y: (mousePos.y - newY) / newScale
         })
      }
   });
});

function drawGrid() {
   for (let i = gridContainer.children.length - 1; i >= 0; i--) {
      if (gridContainer.children[i] instanceof PIXI.Graphics) {
         gridContainer.removeChild(gridContainer.children[i]);
      }
   }

   const graphics = new PIXI.Graphics();
   graphics.lineStyle(1 / scale, "#1e1c1c", 1);

   const startX = Math.floor(-gridContainer.x / (cellSize * scale)) - 20;
   const startY = Math.floor(-gridContainer.y / (cellSize * scale)) - 20;
   const endX = startX + Math.ceil((app.screen.width / (cellSize * scale))) + 40;
   const endY = startY + Math.ceil((app.screen.height / (cellSize * scale))) + 40;

   for (let x = startX; x <= endX; x++) {
      graphics.moveTo(x * cellSize, startY * cellSize);
      graphics.lineTo(x * cellSize, endY * cellSize);
   }

   for (let y = startY; y <= endY; y++) {
      graphics.moveTo(startX * cellSize, y * cellSize);
      graphics.lineTo(endX * cellSize, y * cellSize);
   }

   if (winningCells) {
      const graphics = new PIXI.Graphics();
      gridContainer.addChild(graphics);

      const startCell = winningCells[0];
      const endCell = winningCells[winningCells.length - 1];

      const startX = (startCell[0] * cellSize) + (cellSize / 2);
      const startY = (startCell[1] * cellSize) + (cellSize / 2);
      const endX = (endCell[0] * cellSize) + (cellSize / 2);
      const endY = (endCell[1] * cellSize) + (cellSize / 2);

      graphics.lineStyle(STRIKE_WIDTH, STRIKE_COLOR, 1);
      graphics.moveTo(startX, startY);
      graphics.lineTo(endX, endY);
   }

   gridContainer.addChild(graphics);
}

app.stage.on("pointerdown", (event) => {
   isDragging = true;
   hasMoved = false;
   totalMovement = 0;
   dragStart = event.data.getLocalPosition(app.stage);
   lastDragPosition = { ...dragStart };
   lastDragTime = Date.now();
   velocity = { x: 0, y: 0 };
});

app.stage.on("pointermove", (event) => {
   if (isDragging) {
      const newPosition = event.data.getLocalPosition(app.stage);
      const currentTime = Date.now();
      const timeElapsed = currentTime - lastDragTime;

      if (timeElapsed > 0) {
         velocity.x = (newPosition.x - lastDragPosition.x) / timeElapsed * 16.67 * VELOCITY_DAMPING;
         velocity.y = (newPosition.y - lastDragPosition.y) / timeElapsed * 16.67 * VELOCITY_DAMPING;
      }

      const dx = newPosition.x - dragStart.x;
      const dy = newPosition.y - dragStart.y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);

      if (totalMovement > 10) {
         hasMoved = true;
      }

      if (hasMoved) {
         gridContainer.x += dx;
         gridContainer.y += dy;
         drawGrid();
      }

      dragStart = newPosition;
      lastDragPosition = { ...newPosition };
      lastDragTime = currentTime;
   }
   updateHoverCell(event);
});

app.stage.on("pointerup", (event) => {
   if (isDragging && !hasMoved) {
      const pos = event.data.getLocalPosition(gridContainer);
      const cellX = Math.floor(pos.x / cellSize);
      const cellY = Math.floor(pos.y / cellSize);
      placeMark(cellX, cellY);
   }
   isDragging = false;
   updateHoverCell(event);
});

app.stage.on("pointerupoutside", () => {
   isDragging = false;
});

function cameraAdjustment(targetX, targetY) {
   let isAnimating = true;

   function animate() {
      if (!isAnimating) return;

      const markWorldX = targetX * cellSize * scale + gridContainer.x;
      const markWorldY = targetY * cellSize * scale + gridContainer.y;
      const markSize = cellSize * scale;
      const statusBarHeight = document.getElementById("statusBar").offsetHeight + 40;

      let needsAdjustment = false;
      const adjustments = { x: 0, y: 0 };

      if (markWorldX < 0) {
         adjustments.x = -markWorldX + MARK_PADDING;
         needsAdjustment = true;
      } else if (markWorldX + markSize > window.innerWidth) {
         adjustments.x = window.innerWidth - (markWorldX + markSize) - MARK_PADDING;
         needsAdjustment = true;
      }

      if (markWorldY < statusBarHeight) {
         adjustments.y = statusBarHeight - markWorldY + MARK_PADDING;
         needsAdjustment = true;
      } else if (markWorldY + markSize > window.innerHeight) {
         adjustments.y = window.innerHeight - (markWorldY + markSize) - MARK_PADDING;
         needsAdjustment = true;
      }

      if (needsAdjustment) {
         gridContainer.x += adjustments.x * CAMERA_SPEED;
         gridContainer.y += adjustments.y * CAMERA_SPEED;
         drawGrid();
         requestAnimationFrame(animate);
         return;
      }
      isAnimating = false;
   }

   animate();
}

function placeMark(cellX, cellY) {
   if (gameState.isGameOver) return;
   const coordKey = `${cellX},${cellY}`;

   if (gameState.gameMode === "multi") {
      if (!gameState.isMyTurn) {
         console.log("Not your turn!");
         return;
      }
      if (placedMarks.has(coordKey)) return;

      socket.emit("placeMark", { roomId: gameState.roomId, cellX, cellY });
      return;
   }

   if (gameState.gameMode !== "single") {
      return;
   }
   const player = gameState.currentPlayer;
   if (placedMarks.has(coordKey)) return;

   velocity = { x: 0, y: 0 };

   const text = new PIXI.Text(player, {
      fontSize: 40,
      fill: player === "X" ? "#ff6961" : "#a2bffe",
      align: "center",
      fontWeight: "bold"
   });

   text.anchor.set(0.5);
   text.x = (cellX * cellSize) + (cellSize / 2);
   text.y = (cellY * cellSize) + (cellSize / 2);

   const targetSize = cellSize * 0.8;
   const scale = targetSize / Math.max(text.width, text.height);
   text.scale.set(scale);

   gridContainer.addChild(text);

   placedMarks.set(coordKey, {
      player,
      text
   });

   cameraAdjustment(cellX, cellY);

   const winningCells = checkWin(cellX, cellY, player);
   if (winningCells) {
      animateWinningLine(winningCells);
      setTimeout(() => {
         gameState.isGameOver = true;
         document.getElementById("gameStatus").textContent = `Player ${player} wins!`;
         document.getElementById("restartButton").style.display = "block";
      }, STRIKE_ANIMATION_DURATION);
      return;
   }

   gameState.currentPlayer = gameState.currentPlayer === "X" ? "O" : "X";
   document.getElementById("gameStatus").textContent = `${gameState.currentPlayer}'s Turn`;
}

function checkWin(cellX, cellY, player) {
   /* 
      the main optimization is that were now keeping track of consecutive pieces as theyre placed, which can help with:
         - quick lookups of potential threats
         - early detection of winning possibilities
         - memory of previous moves impact
      could further optimize this by:
         - adding threat detection (4-in-a-row with open ends)
         - implementing move suggestions based on potential wins
         - adding pattern recognition for common winning setups
   */
   const directions = [
      [1, 0],   // horizontal
      [0, 1],   // vertical
      [1, 1],   // diagonal right
      [1, -1]   // diagonal left
   ];

   for (const [dx, dy] of directions) {
      let count = 1;
      let blocked = 0;
      const cells = [[cellX, cellY]];

      const dirKey = `${dx},${dy}`;

      for (let dir = -1; dir <= 1; dir += 2) {
         let consecutive = 0;
         for (let i = 1; i < WINNING_LENGTH; i++) {
            const newX = cellX + dx * i * dir;
            const newY = cellY + dy * i * dir;
            const checkKey = `${newX},${newY}`;
            const cell = placedMarks.get(checkKey);

            if (cell?.player === player) {
               count++;
               consecutive++;
               cells.push([newX, newY]);

               const lineKey = `${dirKey},${newX},${newY}`;
               const existing = potentialWins.get(lineKey) || { count: 0, cells: [] };
               existing.count = Math.max(existing.count, consecutive + 1);
               existing.cells = [...new Set([...existing.cells, [newX, newY]])];
               potentialWins.set(lineKey, existing);
            } else {
               blocked++;
               break;
            }
         }
      }

      if (count >= WINNING_LENGTH) {
         cells.sort((a, b) => {
            if (a[0] === b[0]) return a[1] - b[1];
            return a[0] - b[0];
         });
         return cells;
      }

      if (blocked === 2 && count < WINNING_LENGTH) {
         const lineKey = `${dirKey},${cellX},${cellY}`;
         potentialWins.delete(lineKey);
         continue;
      }
   }

   return false;
}

function animateWinningLine(cells) {
   winningCells = cells;
   const graphics = new PIXI.Graphics();
   gridContainer.addChild(graphics);

   const startCell = cells[0];
   const endCell = cells[cells.length - 1];

   const startX = (startCell[0] * cellSize) + (cellSize / 2);
   const startY = (startCell[1] * cellSize) + (cellSize / 2);
   const endX = (endCell[0] * cellSize) + (cellSize / 2);
   const endY = (endCell[1] * cellSize) + (cellSize / 2);

   let progress = 0;
   const animate = () => {
      if (progress >= 1) return;

      progress += 1 / (STRIKE_ANIMATION_DURATION / 16.67);
      progress = Math.min(progress, 1);

      graphics.clear();
      graphics.lineStyle(STRIKE_WIDTH, STRIKE_COLOR, 1);
      graphics.moveTo(startX, startY);
      graphics.lineTo(
         startX + (endX - startX) * progress,
         startY + (endY - startY) * progress
      );

      if (progress < 1) {
         requestAnimationFrame(animate);
      }
   };

   animate();
}

drawGrid();

window.addEventListener("resize", onResize);

function onResize() {
   app.renderer.resize(window.innerWidth, window.innerHeight);
   app.stage.hitArea = app.screen;
   drawGrid();
}

const hoverGraphics = new PIXI.Graphics();
app.stage.addChild(hoverGraphics);

function updateHoverCell(event) {
   hoverGraphics.clear();

   if (gameState.isGameOver) return;
   if (!(!isDragging || !hasMoved)) return;
   if (gameState.gameMode === "multi" && !gameState.isMyTurn) return;

   const pos = event.data.getLocalPosition(gridContainer);
   const cellX = Math.floor(pos.x / cellSize);
   const cellY = Math.floor(pos.y / cellSize);
   const coordKey = `${cellX},${cellY}`;

   if (placedMarks.has(coordKey)) return;

   const worldX = cellX * cellSize * scale + gridContainer.x;
   const worldY = cellY * cellSize * scale + gridContainer.y;

   hoverGraphics.lineStyle(1, "#888888", 0.3);
   hoverGraphics.beginFill("#888888", 0.3);
   hoverGraphics.drawRect(
      worldX,
      worldY,
      cellSize * scale,
      cellSize * scale
   );
   hoverGraphics.endFill();
}

function updateMomentum() {
   if (!(!isDragging && (Math.abs(velocity.x) > MIN_VELOCITY || Math.abs(velocity.y) > MIN_VELOCITY))) {
      return;
   }
   gridContainer.x += velocity.x;
   gridContainer.y += velocity.y;

   velocity.x *= FRICTION;
   velocity.y *= FRICTION;

   drawGrid();

   const mousePosition = app.renderer.plugins.interaction?.mouse?.global || app.renderer.events?.pointer || { x: 0, y: 0 };

   updateHoverCell({
      data: {
         getLocalPosition: (container) => {
            return container === gridContainer ? {
               x: (mousePosition.x - gridContainer.x) / scale,
               y: (mousePosition.y - gridContainer.y) / scale
            } : mousePosition;
         }
      }
   });

   if (Math.abs(velocity.x) < MIN_VELOCITY) velocity.x = 0;
   if (Math.abs(velocity.y) < MIN_VELOCITY) velocity.y = 0;
}

app.ticker.add(updateMomentum);

function restartGame() {
   const existingTimeouts = setTimeout(() => { }, 0);
   for (let i = 0; i < existingTimeouts; i++) {
      clearTimeout(i);
   }

   placedMarks.forEach(mark => {
      gridContainer.removeChild(mark.text);
   });
   placedMarks.clear();

   for (let i = gridContainer.children.length - 1; i >= 0; i--) {
      const child = gridContainer.children[i];
      if (child instanceof PIXI.Graphics && child !== hoverGraphics) {
         gridContainer.removeChild(child);
      }
   }

   if (gameState.gameMode === "multi") {
      document.getElementById("menuOverlay").style.display = "flex";
      gameState.gameMode = null;
      gameState.playerMark = "";
      gameState.roomId = "";
      gameState.isMyTurn = false;
   } else {
      gameState.currentPlayer = "X";
      document.getElementById("gameStatus").textContent = `${gameState.currentPlayer}'s Turn`;
   }

   gameState.isGameOver = false;
   winningCells = null;
   document.getElementById("restartButton").style.display = "none";

   drawGrid();
   potentialWins.clear();
}