import { WebSocketServer } from 'ws';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

const server = createServer(app);
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
                    players: [{
                        socket,
                        id: 'player1',
                        name: data.playerName || 'Player 1',
                        ready: false
                    }],
                    moves: {},
                    round: 0,
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
                    game.players.push({
                        socket,
                        id: 'player2',
                        name: data.playerName || 'Player 2',
                        ready: false
                    });
                    playerId = 'player2';
                    gameId = data.gameId;
                    
                    game.players.forEach(player => {
                        const opponent = game.players.find(p => p.id !== player.id);
                        player.socket.send(JSON.stringify({
                            type: 'game_started',
                            gameId,
                            opponentName: opponent.name
                        }));
                    });
                }
                break;

            case 'make_move':
                const currentGame = games.get(data.gameId);
                if (currentGame) {
                    currentGame.moves[playerId] = data.move;
                    
                    // Find opponent
                    const opponent = currentGame.players.find(p => p.id !== playerId);
                    
                    if (Object.keys(currentGame.moves).length === 2) {
                        const result = determineWinner(
                            currentGame.moves.player1,
                            currentGame.moves.player2
                        );
                        
                        currentGame.round++;
                        
                        currentGame.players.forEach(player => {
                            player.socket.send(JSON.stringify({
                                type: 'game_result',
                                result,
                                moves: currentGame.moves,
                                round: currentGame.round
                            }));
                        });
                        
                        currentGame.moves = {};
                    } else {
                        // Notify opponent that a move has been made
                        if (opponent) {
                            opponent.socket.send(JSON.stringify({
                                type: 'move_made'
                            }));
                        }
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
                otherPlayer
