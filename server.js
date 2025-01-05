// server.js
import { WebSocketServer } from 'ws';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// Serve static files
app.use(express.static('public'));

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active games
const games = new Map();

wss.on('connection', (socket) => {
  let gameId = null;
  let playerId = null;

  socket.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'create_game':
        gameId = Math.random().toString(36).substring(7);
        games.set(gameId, {
          players: [{ socket, id: 'player1' }],
          moves: {},
          status: 'waiting'
        });
        playerId = 'player1';
        socket.send(JSON.stringify({ 
          type: 'game_created', 
          gameId,
          playerId 
        }));
        break;

      case 'join_game':
        const game = games.get(data.gameId);
        if (game && game.players.length === 1) {
          game.players.push({ socket, id: 'player2' });
          playerId = 'player2';
          gameId = data.gameId;
          
          // Notify both players that game is starting
          game.players.forEach(player => {
            player.socket.send(JSON.stringify({
              type: 'game_started',
              gameId
            }));
          });
        }
        break;

      case 'make_move':
        const currentGame = games.get(data.gameId);
        if (currentGame) {
          currentGame.moves[playerId] = data.move;
          
          if (Object.keys(currentGame.moves).length === 2) {
            const result = determineWinner(
              currentGame.moves.player1,
              currentGame.moves.player2
            );
            
            currentGame.players.forEach(player => {
              player.socket.send(JSON.stringify({
                type: 'game_result',
                result,
                moves: currentGame.moves
              }));
            });
            
            currentGame.moves = {};
          } else {
            const otherPlayer = currentGame.players.find(p => p.id !== playerId);
            otherPlayer.socket.send(JSON.stringify({
              type: 'waiting_for_move'
            }));
          }
        }
        break;
    }
  });

  socket.on('close', () => {
    if (gameId && games.has(gameId)) {
      const game = games.get(gameId);
      const otherPlayer = game.players.find(p => p.id !== playerId);
      if (otherPlayer) {
        otherPlayer.socket.send(JSON.stringify({
          type: 'player_disconnected'
        }));
      }
      games.delete(gameId);
    }
  });
});

function determineWinner(move1, move2) {
  if (move1 === move2) return 'tie';
  if (
    (move1 === 'rock' && move2 === 'scissors') ||
    (move1 === 'paper' && move2 === 'rock') ||
    (move1 === 'scissors' && move2 === 'paper')
  ) {
    return 'player1';
  }
  return 'player2';
}

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});