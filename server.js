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
app.use(express.static(join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store active games
const games = new Map();

// Generate a deck of cards
function generateDeck() {
    return {
        rock: 10,
        paper: 10,
        scissors: 10
    };
}

// Deal cards to a player
function dealCards(deck) {
    const hand = { rock: 0, paper: 0, scissors: 0 };
    const totalCards = 15; // Each player gets 15 cards
    let remaining = totalCards;

    ['rock', 'paper', 'scissors'].forEach((type, index) => {
        if (index === 2) {
            hand[type] = remaining;
        } else {
            const max = Math.min(deck[type], Math.floor(remaining / 2));
            const amount = Math.floor(Math.random() * max) + 1;
            hand[type] = amount;
            deck[type] -= amount;
            remaining -= amount;
        }
    });

    return hand;
}

wss.on('connection', (socket) => {
    let gameId = null;
    let playerId = null;

    socket.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'create_game':
                gameId = Math.random().toString(36).substring(7);
                const deck = generateDeck();
                const player1Hand = dealCards(deck);
                
                games.set(gameId, {
                    players: [{ 
                        socket, 
                        id: 'player1',
                        hand: player1Hand,
                        score: 0
                    }],
                    deck: deck,
                    moves: {},
                    round: 0,
                    status: 'waiting'
                });
                
                playerId = 'player1';
                socket.send(JSON.stringify({ 
                    type: 'game_created', 
                    gameId,
                    playerId,
                    hand: player1Hand
                }));
                break;

            case 'join_game':
                const game = games.get(data.gameId);
                if (game && game.players.length === 1) {
                    const player2Hand = dealCards(game.deck);
                    
                    game.players.push({ 
                        socket, 
                        id: 'player2',
                        hand: player2Hand,
                        score: 0
                    });
                    
                    playerId = 'player2';
                    gameId = data.gameId;

                    // Notify both players that game is starting
                    game.players.forEach(player => {
                        player.socket.send(JSON.stringify({
                            type: 'game_started',
                            gameId,
                            hand: player.hand
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
                    if (player) {
                        player.hand[data.move]--;
                    }

                    if (Object.keys(currentGame.moves).length === 2) {
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

                        // Handle redraw at round 5
                        if (currentGame.round === 5) {
                            currentGame.players.forEach(player => {
                                player.socket.send(JSON.stringify({
                                    type: 'redraw_available'
                                }));
                            });
                        }

                        // Send result to both players
                        currentGame.players.forEach(player => {
                            player.socket.send(JSON.stringify({
                                type: 'game_result',
                                result,
                                moves: currentGame.moves,
                                round: currentGame.round,
                                hand: player.hand,
                                scores: {
                                    player1: currentGame.players[0].score,
                                    player2: currentGame.players[1].score
                                }
                            }));
                        });

                        // Reset moves for next round
                        currentGame.moves = {};

                        // End game if reached 10 rounds
                        if (currentGame.round === 10) {
                            currentGame.players.forEach(player => {
                                player.socket.send(JSON.stringify({
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
                        // Notify other player that a move has been made
                        const otherPlayer = currentGame.players.find(p => p.id !== playerId);
                        otherPlayer.socket.send(JSON.stringify({
                            type: 'waiting_for_move'
                        }));
                    }
                }
                break;

            case 'request_redraw':
                const gameToRedraw = games.get(data.gameId);
                if (gameToRedraw && gameToRedraw.round === 5) {
                    const player = gameToRedraw.players.find(p => p.id === playerId);
                    if (player) {
                        // Generate new hand for player
                        const newHand = dealCards(gameToRedraw.deck);
                        player.hand = newHand;
                        
                        player.socket.send(JSON.stringify({
                            type: 'redraw_complete',
                            hand: newHand
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
