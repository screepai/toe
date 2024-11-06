const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const rooms = new Map();

io.on("connection", (socket) => {
   console.log("User connected");

   socket.on("createRoom", () => {
      const roomId = Math.random().toString(36).substring(2, 8);
      rooms.set(roomId, {
         players: [socket.id],
         currentPlayer: "X",
         placedMarks: new Map(),
         isGameOver: false
      });
      socket.join(roomId);
      socket.emit("roomCreated", roomId);
   });

   socket.on("joinRoom", (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.players.length < 2) {
         room.players.push(socket.id);
         socket.join(roomId);
         socket.emit("gameJoined", "O");
         socket.to(roomId).emit("opponentJoined");
         return;
      }
      socket.emit("joinError", "Room is full or does not exist");
   });

   socket.on("placeMark", ({ roomId, cellX, cellY }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const coordKey = `${cellX},${cellY}`;
      if (room.placedMarks.has(coordKey)) return;

      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex === -1) return;

      const currentPlayerMark = playerIndex === 0 ? "X" : "O";
      if (currentPlayerMark !== room.currentPlayer) return;

      room.placedMarks.set(coordKey, currentPlayerMark);
      room.currentPlayer = room.currentPlayer === "X" ? "O" : "X";

      io.in(roomId).emit("markPlaced", {
         cellX,
         cellY,
         player: currentPlayerMark,
         nextPlayer: room.currentPlayer
      });
   });

   socket.on("disconnect", () => {
      rooms.forEach((room, roomId) => {
         if (room.players.includes(socket.id)) {
            io.to(roomId).emit("opponentLeft");
            rooms.delete(roomId);
         }
      });
   });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`);
});
