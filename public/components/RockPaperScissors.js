const RockPaperScissors = () => {
  const [gameState, setGameState] = React.useState({
    gameId: null,
    playerId: null,
    status: 'initial', // initial, waiting, playing, finished
    playerChoice: null,
    opponentChoice: null,
    playerScore: 0,
    opponentScore: 0,
  });

  const [socket, setSocket] = React.useState(null);
  const [joinGameId, setJoinGameId] = React.useState('');
  const [message, setMessage] = React.useState(null);

  React.useEffect(() => {
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
        setMessage('Game created! Share the Game ID with your opponent.');
        break;

      case 'game_started':
        setGameState(prev => ({
          ...prev,
          status: 'playing'
        }));
        setMessage('Game started! Make your move.');
        break;

      case 'waiting_for_move':
        setMessage("Waiting for opponent's move...");
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

        setMessage(isTie ? "It's a tie!" : isWinner ? 'You win!' : 'Opponent wins!');
        break;

      case 'player_disconnected':
        setMessage('Opponent disconnected. Please start a new game.');
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
    setMessage('Game ID copied to clipboard!');
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-2xl mx-auto bg-gray-800 rounded-lg p-6 shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6">Rock Paper Scissors</h1>
        
        {message && (
          <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 mb-6 text-center">
            {message}
          </div>
        )}

        {gameState.status === 'initial' && (
          <div className="space-y-4">
            <button 
              onClick={createGame}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Create New Game
            </button>
            <div className="flex gap-2">
              <input
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                placeholder="Enter Game ID"
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded"
              />
              <button 
                onClick={joinGame}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Join Game
              </button>
            </div>
          </div>
        )}

        {gameState.status === 'waiting' && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <p className="text-xl">Game ID: {gameState.gameId}</p>
              <button 
                onClick={copyGameId}
                className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
              >
                Copy
              </button>
            </div>
            <p className="text-gray-400">Waiting for opponent to join...</p>
          </div>
        )}

        {(gameState.status === 'playing' || gameState.status === 'finished') && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="text-xl font-bold mb-4">
                  You: {gameState.playerScore}
                </div>
                {gameState.status === 'playing' ? (
                  <div className="flex gap-2 justify-center">
                    {['rock', 'paper', 'scissors'].map(choice => (
                      <button
                        key={choice}
                        onClick={() => makeMove(choice)}
                        disabled={gameState.playerChoice}
                        className={`px-6 py-4 rounded ${
                          gameState.playerChoice === choice 
                            ? 'bg-blue-600' 
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xl">{gameState.playerChoice}</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xl font-bold mb-4">
                  Opponent: {gameState.opponentScore}
                </div>
                {gameState.opponentChoice && (
                  <div className="text-xl">{gameState.opponentChoice}</div>
                )}
              </div>
            </div>

            {gameState.status === 'finished' && (
              <button 
                onClick={startNewRound}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Play Next Round
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
