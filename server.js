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

function generateInitialHand() {
    return {
        rock: Math.floor(Math.random() * 5) + 3,
        paper: Math.floor(Math.random() * 5) + 3,
        scissors: Math.floor(Math.random() * 5) + 3
    };
}

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
                        hand: generateInitialHand(),
                        score: 0
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
                        hand: generateInitialHand(),
                        score: 0
                    });
                    playerId = 'player2';
                    gameId = data.gameId;
                    
                    // Notify both players with opponent names
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
                    // Record the move
                    currentGame.moves[playerId] = data.move;
                    
                    // Update player's hand
                    const player = currentGame.players.find(p => p.id === playerId);
                    if (player && player.hand[data.move] > 0) {
                        player.hand[data.move]--;
                    }

                    const opponent = currentGame.players.find(p => p.id !== playerId);
                    
                    if (Object.keys(currentGame.moves).length === 2) {
                        // Both players have moved
                        const result = determineWinner(
                            currentGame.moves.player1,
                            currentGame.moves.player2
                        );
                        
                        // Update scores
                        if (result !== 'tie') {
                            const winner = currentGame.players.find(p => p.id === result);
                            if (winner) winner.score++;
                        }

                        currentGame.round++;
                        
                        // Send results to both players
                        currentGame.players.forEach(p => {
                            p.socket.send(JSON.stringify({
                                type: 'game_result',
                                result,
                                moves: currentGame.moves,
                                round: currentGame.round,
                                scores: {
                                    player1: currentGame.players[0].score,
                                    player2: currentGame.players[1].score
                                }
                            }));
                        });
                        
                        // Reset moves for next round
                        currentGame.moves = {};
                        
                        // Handle game end after 10 rounds
                        if (currentGame.round === 10) {
                            currentGame.players.forEach(p => {
                                p.socket.send(JSON.stringify({
                                    type: 'game_over',
                                    scores: {
                                        player1: currentGame.players[0].score,
                                        player2: currentGame.players[1].score
                                    }
                                }));
                            });
                            games.delete(gameId);
                        }
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
                otherPlayer.socket.send(JSON.stringify({
                    type: 'player_disconnected'
                }));
            }
            games.delete(gameId);
        }
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
