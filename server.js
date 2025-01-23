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
                        score: 0
                    }],
                    moves: {},
                    round: 1,
                    currentTurn: 'player1',
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
                        score: 0
                    });
                    playerId = 'player2';
                    gameId = data.gameId;
                    
                    game.players.forEach(player => {
                        const opponent = game.players.find(p => p.id !== player.id);
                        player.socket.send(JSON.stringify({
                            type: 'game_joined',
                            opponentName: opponent.name
                        }));
                    });
                }
                break;

            case 'make_move':
                const currentGame = games.get(data.gameId);
                if (currentGame && currentGame.currentTurn === playerId) {
                    currentGame.moves[playerId] = data.move;
                    
                    // Switch turns
                    const nextTurn = playerId === 'player1' ? 'player2' : 'player1';
                    currentGame.currentTurn = nextTurn;

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

                        // Send round results
                        currentGame.players.forEach(p => {
                            p.socket.send(JSON.stringify({
                                type: 'round_result',
                                moves: currentGame.moves,
                                winner: result,
                                round: currentGame.round,
                                scores: {
                                    player1: currentGame.players[0].score,
                                    player2: currentGame.players[1].score
                                }
                            }));
                        });

                        // Reset for next round
                        currentGame.moves = {};
                        currentGame.round++;
                        currentGame.currentTurn = 'player1';

                        // Check if game is over
                        if (currentGame.round > 10) {
                            const player1Score = currentGame.players[0].score;
                            const player2Score = currentGame.players[1].score;
                            const winner = player1Score > player2Score ? 'player1' : 
                                         player2Score > player1Score ? 'player2' : 'tie';

                            currentGame.players.forEach(p => {
                                p.socket.send(JSON.stringify({
                                    type: 'game_over',
                                    winner,
                                    scores: {
                                        player1: player1Score,
                                        player2: player2Score
                                    }
                                }));
                            });
                            games.delete(gameId);
                        }
                    } else {
                        // Notify about turn change
                        currentGame.players.forEach(p => {
                            p.socket.send(JSON.stringify({
                                type: 'move_made',
                                nextTurn
                            }));
                        });
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
