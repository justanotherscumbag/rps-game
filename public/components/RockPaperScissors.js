import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { HandRock, HandPaper, Scissors, Copy, Crown } from 'lucide-react';

const RockPaperScissors = () => {
  const [gameState, setGameState] = useState({
    gameId: null,
    playerId: null,
    status: 'initial', // initial, waiting, playing, finished
    playerChoice: null,
    opponentChoice: null,
    playerScore: 0,
    opponentScore: 0,
  });

  const [socket, setSocket] = useState(null);
  const [joinGameId, setJoinGameId] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleGameMessage(data);
    };

    setSocket(ws);

    return () => ws.close();
  }, []);

  const handleGameMessage = (data) => {
    switch (data.type) {
      case 'game_created':
        setGameState(prev => ({
          ...prev,
          gameId: data.gameId,
          playerId: data.playerId,
          status: 'waiting'
        }));
        break;

      case 'game_started':
        setGameState(prev => ({
          ...prev,
          status: 'playing'
        }));
        setMessage({ type: 'success', text: 'Game started! Make your move.' });
        break;

      case 'waiting_for_move':
        setMessage({ type: 'info', text: "Waiting for opponent's move..." });
        break;

      case 'game_result':
        const result = data.result;
        const isWinner = result === gameState.playerId;
        const isTie = result === 'tie';
        
        setGameState(prev => ({
          ...prev,
          opponentChoice: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
          status: 'finished',
          playerScore: prev.playerScore + (isWinner ? 1 : 0),
          opponentScore: prev.opponentScore + (!isWinner && !isTie ? 1 : 0)
        }));

        setMessage({
          type: isWinner ? 'success' : isTie ? 'info' : 'error',
          text: isTie ? "It's a tie!" : isWinner ? 'You win!' : 'Opponent wins!'
        });
        break;

      case 'player_disconnected':
        setMessage({ type: 'error', text: 'Opponent disconnected. Please start a new game.' });
        setGameState(prev => ({ ...prev, status: 'initial' }));
        break;
    }
  };

  const createGame = () => {
    socket.send(JSON.stringify({ type: 'create_game' }));
  };

  const joinGame = () => {
    socket.send(JSON.stringify({
      type: 'join_game',
      gameId: joinGameId
    }));
  };

  const makeMove = (choice) => {
    setGameState(prev => ({ ...prev, playerChoice: choice }));
    socket.send(JSON.stringify({
      type: 'make_move',
      gameId: gameState.gameId,
      move: choice
    }));
  };

  const copyGameId = () => {
    navigator.clipboard.writeText(gameState.gameId);
    setMessage({ type: 'success', text: 'Game ID copied to clipboard!' });
  };

  const startNewRound = () => {
    setGameState(prev => ({
      ...prev,
      status: 'playing',
      playerChoice: null,
      opponentChoice: null
    }));
    setMessage(null);
  };

  const getChoiceIcon = (choice, size = 24) => {
    switch (choice) {
      case 'rock':
        return <HandRock size={size} />;
      case 'paper':
        return <HandPaper size={size} />;
      case 'scissors':
        return <Scissors size={size} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl bg-white/5 backdrop-blur-sm text-white">
        <CardHeader className="text-center border-b border-white/10">
          <CardTitle className="text-3xl font-bold">Rock Paper Scissors</CardTitle>
          <CardDescription className="text-gray-300">
            {gameState.status === 'initial' ? 'Create or join a game to start playing' : 
             gameState.status === 'waiting' ? 'Waiting for opponent...' :
             'Choose your move'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {message && (
            <Alert className={`mb-6 ${
              message.type === 'success' ? 'bg-green-500/20 border-green-500/50' :
              message.type === 'error' ? 'bg-red-500/20 border-red-500/50' :
              'bg-blue-500/20 border-blue-500/50'
            }`}>
              <AlertTitle>{message.text}</AlertTitle>
            </Alert>
          )}

          {gameState.status === 'initial' && (
            <div className="space-y-4">
              <Button 
                onClick={createGame}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                Create New Game
              </Button>
              <div className="flex gap-2">
                <Input
                  value={joinGameId}
                  onChange={(e) => setJoinGameId(e.target.value)}
                  placeholder="Enter Game ID"
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                />
                <Button onClick={joinGame} variant="secondary">
                  Join Game
                </Button>
              </div>
            </div>
          )}

          {gameState.status === 'waiting' && (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl font-semibold">Game ID: {gameState.gameId}</div>
                <Button size="sm" variant="ghost" onClick={copyGameId}>
                  <Copy size={16} />
                </Button>
              </div>
              <div className="animate-pulse text-gray-300">
                Waiting for opponent to join...
              </div>
            </div>
          )}

          {(gameState.status === 'playing' || gameState.status === 'finished') && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center space-y-4">
                  <div className="text-xl font-semibold flex items-center justify-center gap-2">
                    You {gameState.playerScore > gameState.opponentScore && <Crown className="text-yellow-500" />}
                    <span className="text-2xl text-purple-400">{gameState.playerScore}</span>
                  </div>
                  {gameState.status === 'playing' ? (
                    <div className="flex gap-2 justify-center">
                      {['rock', 'paper', 'scissors'].map(choice => (
                        <Button
                          key={choice}
                          onClick={() => makeMove(choice)}
                          disabled={gameState.playerChoice}
                          variant={gameState.playerChoice === choice ? "secondary" : "outline"}
                          className="p-6 hover:bg-white/10"
                        >
                          {getChoiceIcon(choice, 32)}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <div className="p-6 border rounded-lg border-white/20">
                        {getChoiceIcon(gameState.playerChoice, 48)}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-center space-y-4">
                  <div className="text-xl font-semibold flex items-center justify-center gap-2">
                    Opponent {gameState.opponentScore > gameState.playerScore && <Crown className="text-yellow-500" />}
                    <span className="text-2xl text-blue-400">{gameState.opponentScore}</span>
                  </div>
                  {gameState.opponentChoice && (
                    <div className="flex justify-center">
                      <div className="p-6 border rounded-lg border-white/20">
                        {getChoiceIcon(gameState.opponentChoice, 48)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {gameState.status === 'finished' && (
                <Button 
                  onClick={startNewRound}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  Play Next Round
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RockPaperScissors;