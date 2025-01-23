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
    
    const [type1, card1] = move1.split('-');
    const [type2, card2] = move2.split('-');
    
    if (type1 === 'joker' && type2 === 'upgraded') return 'player1';
    if (type2 === 'joker' && type1 === 'upgraded') return 'player2';
    if (type1 === 'joker' && type2.startsWith('regular')) return 'player2';
    if (type2 === 'joker' && type1.startsWith('regular')) return 'player1';
    
    if (type1 === 'upgraded' && type2.startsWith('regular') && card1 === card2) return 'player1';
    if (type2 === 'upgraded' && type1.startsWith('regular') && card1 === card2) return 'player2';
    
    const rules = {
        'rock': 'scissors',
        'paper': 'rock',
        'scissors': 'paper'
    };
    
    const baseCard1 = card1.split('-').pop();
    const baseCard2 = card2.split('-').pop();
    return rules[baseCard1] === baseCard2 ? 'player1' : 'player2';
}

wss.on('connection', (socket) => {
    let gameId = null;
    let playerId = null;

    socket.on('message', (message) => {
        const data = JSON.parse(message);
        console.log('Received message:', data);  // Debug log

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
                    currentTurn: 'player1'
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
                            type: 'game_started',
                            opponentName: opponent.name
                        }));
                    });

                    // Explicitly notify player 1 it's their turn
                    game.players[0].socket.send(JSON.stringify({
                        type: 'your_turn',
                        message: 'Your turn!'
                    }));

                    // Tell player 2 to wait
                    game.players[1].socket.send(JSON.stringify({
                        type: 'wait_turn',
                        message: 'Waiting for player 1...'
                    }));
                }
                break;

            case 'make_move':
                const currentGame = games.get(data.gameId);
                if (!currentGame || currentGame.currentTurn !== playerId) {
                    return;
                }

                // Record the move
                currentGame.moves[playerId] = data.move;
                console.log('Move made:', playerId, data.move); // Debug log

                if (playerId === 'player1') {
                    // Player 1 just moved
                    currentGame.currentTurn = 'player2';
                    
                    // Tell player 2 it's their turn
                    currentGame.players[1].socket.send(JSON.stringify({
                        type: 'your_turn',
                        message: 'Your turn!'
                    }));

                    // Tell player 1 to wait
                    currentGame.players[0].socket.send(JSON.stringify({
                        type: 'wait_turn',
                        message: 'Waiting for player 2...'
                    }));
                } else {
                    // Player 2 just moved - resolve the round immediately
                    const result = determineWinner(
                        currentGame.moves.player1,
                        currentGame.moves.player2
                    );

                    // Update scores
                    if (result !== 'tie') {
                        const winner = currentGame.players.find(p => p.id === result);
                        if (winner) winner.score++;
                    }

                    // Send round results to both players
                    const roundData = {
                        type: 'round_complete',
                        moves: currentGame.moves,
                        result: result,
                        scores: {
                            player1: currentGame.players[0].score,
                            player2: currentGame.players[1].score
                        },
                        round: currentGame.round
                    };

                    currentGame.players.forEach(p => {
                        p.socket.send(JSON.stringify(roundData));
                    });

                    // Prepare for next round
                    currentGame.round++;
                    currentGame.moves = {};
                    currentGame.currentTurn = 'player1';

                    if (currentGame.round <= 10) {
                        // Start next round
                        currentGame.players[0].socket.send(JSON.stringify({
                            type: 'your_turn',
                            message: 'Your turn!',
                            round: currentGame.round
                        }));

                        currentGame.players[1].socket.send(JSON.stringify({
                            type: 'wait_turn',
                            message: 'Waiting for player 1...',
                            round: currentGame.round
                        }));
                    } else {
                        // Game over
                        const p1Score = currentGame.players[0].score;
                        const p2Score = currentGame.players[1].score;
                        const winner = p1Score > p2Score ? 'player1' : 
                                     p2Score > p1Score ? 'player2' : 'tie';

                        currentGame.players.forEach(p => {
                            p.socket.send(JSON.stringify({
                                type: 'game_over',
                                winner: winner,
                                scores: {
                                    player1: p1Score,
                                    player2: p2Score
                                }
                            }));
                        });
                        games.delete(gameId);
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
