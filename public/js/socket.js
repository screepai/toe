const socket = io();

socket.on("connect", () => {
   console.log("Connected to server with ID:", socket.id);
});

document.getElementById("createGameBtn").addEventListener("click", () => {
   socket.emit("createRoom");
});

document.getElementById("joinGameBtn").addEventListener("click", () => {
   const roomIdToJoin = document.getElementById("roomIdInput").value;
   socket.emit("joinRoom", roomIdToJoin);
});

socket.on("roomCreated", (newRoomId) => {
   gameState.gameMode = "multi";
   gameState.roomId = newRoomId;
   gameState.playerMark = "X";
   gameState.isMyTurn = true;
   document.getElementById("menuOverlay").style.display = "none";
   document.getElementById("gameStatus").innerHTML = `Room ID: ${newRoomId}<br>Waiting for opponent...`;
});

socket.on("gameJoined", (data) => {
   // console.log("Raw gameJoined data:", data);

   gameState.gameMode = "multi";
   gameState.playerMark = typeof data === "object" ? data.mark : data;
   gameState.roomId = typeof data === "object" ? data.roomId : null;
   gameState.isMyTurn = gameState.playerMark === "X";

   document.getElementById("menuOverlay").style.display = "none";
   document.getElementById("gameStatus").textContent = gameState.isMyTurn ? "Your turn" : "Opponent's turn";

   // console.log("Game joined:", {
   //    mark: gameState.playerMark,
   //    roomId: gameState.roomId,
   //    isMyTurn: gameState.isMyTurn
   // });
});

socket.on("opponentJoined", () => {
   document.getElementById("gameStatus").textContent = gameState.isMyTurn ? "Your turn" : "Opponent's turn";
   // console.log("Opponent joined, interactive properties set");
});

socket.on("markPlaced", ({ cellX, cellY, player, nextPlayer }) => {
   // console.log("Received markPlaced:", { cellX, cellY, player, nextPlayer });
   const coordKey = `${cellX},${cellY}`;
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
   placedMarks.set(coordKey, { player, text });
   cameraAdjustment(cellX, cellY);

   const winningCells = checkWin(cellX, cellY, player);
   if (winningCells) {
      animateWinningLine(winningCells);
      setTimeout(() => {
         gameState.isGameOver = true;
         document.getElementById("gameStatus").textContent =
            player === gameState.playerMark ? "You win!" : "Opponent wins!";
         document.getElementById("restartButton").style.display = "block";
      }, STRIKE_ANIMATION_DURATION);
      return;
   }

   gameState.isMyTurn = nextPlayer === gameState.playerMark;
   document.getElementById("gameStatus").textContent =
      gameState.isMyTurn ? "Your turn" : "Opponent's turn";
});

socket.on("opponentLeft", () => {
   document.getElementById("gameStatus").textContent = "Opponent left the game";
   document.getElementById("restartButton").style.display = "block";
   isGameOver = true;
});