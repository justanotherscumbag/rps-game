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

// Game constants and helpers
const CardTypes = {
    REGULAR: 'regular',
    UPGRADED: 'upgraded',
    JOKER: 'joker'
};

function generateHand() {
    return {
        'regular-rock': 3,
        'regular-paper': 3,
        'regular-scissors': 3,
        'upgraded-rock': 1,
        'upgraded-paper': 1,
        'upgraded-scissors': 1,
        'joker': 1
    };
}

function determineWinner(move1, move2) {
    if (move1 === move2) return 'tie';
    
    const [type1, card1] = move1.split('-');
    const [type2, card2] = move2.split('-');
    
    // Joker rules
    if (type1 === 'joker' && type2 === 'upgraded') return 'player1';
    if (type2 === 'joker' && type1 === 'upgraded') return 'player2';
    if (type1 === 'joker' && type2.startsWith('regular')) return 'player2';
    if (type2 === 'joker' && type1.startsWith('regular')) return 'player1';
    
    // Upgraded vs Regular of same type
    if (type1 === 'upgraded' && type2.startsWith('regular') && card1 === card2) return 'player1';
    if (type2 === 'upgraded' && type1.startsWith('regular') && card1 === card2) return 'player2';
    
    // Standard RPS rules
    const rules = {
        'rock': 'scissors',
        'paper': 'rock',
        'scissors': 'paper'
    };
    
    return rules[card1] === card2 ? 'player1' : 'player2';
}

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
                    
                    // Notify both players
                    game.players.forEach(player => {
                        const opponent = game.players.find(p => p.id !== player.id);
                        player.socket.send(JSON.stringify({
                            type: 'game_joined',
                            opponentName: opponent.name,
                            currentTurn: 'player1'
                        }));
                    });
                }
                break;

            case 'make_move':
    const currentGame = games.get(data.gameId);
    if (currentGame && currentGame.currentTurn === playerId) {
        // Record the move
        currentGame.moves[playerId] = data.move;
        
        if (Object.keys(currentGame.moves).length === 2) {
            // Both players have moved - determine round winner
            const result = determineWinner(
                currentGame.moves.player1,
                currentGame.moves.player2
            );
            
            if (result !== 'tie') {
                const winner = currentGame.players.find(p => p.id === result);
                if (winner) winner.score++;
            }

            // Send round results to both players
            currentGame.players.forEach(p => {
                p.socket.send(JSON.stringify({
                    type: 'round_complete',
                    moves: currentGame.moves,
                    result: result,
                    scores: {
                        player1: currentGame.players[0].score,
                        player2: currentGame.players[1].score
                    },
                    round: currentGame.round
                }));
            });
            
            // Reset for next round
            currentGame.moves = {};
            currentGame.round++;
            currentGame.currentTurn = 'player1';

            // Check for game end
            if (currentGame.round > 10) {
                // Handle game over...
            }
        } else {
            // First player moved, waiting for second player
            const opponent = currentGame.players.find(p => p.id !== playerId);
            currentGame.currentTurn = opponent.id;
            
            // Notify both players
            opponent.socket.send(JSON.stringify({
                type: 'your_turn'
            }));
            
            const player = currentGame.players.find(p => p.id === playerId);
            player.socket.send(JSON.stringify({
                type: 'waiting_for_opponent'
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

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
