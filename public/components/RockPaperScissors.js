const RockPaperScissors = () => {
  // Add generateHand function at the top of the component
  const generateHand = () => {
    const hand = { rock: 0, paper: 0, scissors: 0 };
    const total = 15;
    let remaining = total;
    
    ['rock', 'paper', 'scissors'].forEach((type, index, array) => {
      if (index === array.length - 1) {
        hand[type] = remaining;
      } else {
        const amount = Math.floor(Math.random() * (remaining - (array.length - index - 1))) + 1;
        hand[type] = amount;
        remaining -= amount;
      }
    });
    
    return hand;
  };

  const [gameState, setGameState] = React.useState({
    gameId: null,
    playerId: null,
    status: 'initial',
    playerHand: { rock: 0, paper: 0, scissors: 0 },
    opponentHand: { rock: 0, paper: 0, scissors: 0 },
    playerChoice: null,
    opponentChoice: null,
    playerScore: 0,
    opponentScore: 0,
    round: 0,
    canRedraw: false,
    moveHistory: [],
    playerName: '',
    opponentName: 'Opponent',
  });

  const [socket, setSocket] = React.useState(null);
  const [joinGameId, setJoinGameId] = React.useState('');
  const [playerName, setPlayerName] = React.useState('');
  const [message, setMessage] = React.useState(null);

  const cardIcons = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️'
  };

  React.useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
      const data = JSON.parse(event.data);
      handleGameMessage(data);
    };

    ws.onclose = function() {
      setMessage('Connection lost. Please refresh the page.');
    };

    setSocket(ws);

    return function cleanup() {
      ws.close();
    };
  }, []);

  const handleGameMessage = (data) => {
    switch (data.type) {
      case 'game_created':
        setGameState(prev => ({
          ...prev,
          gameId: data.gameId,
          playerId: data.playerId,
          status: 'waiting',
          playerName: playerName || 'Player 1',
          playerHand: generateHand()
        }));
        setMessage('Game created! Share your game ID with a friend to play.');
        break;

      case 'game_started':
        setGameState(prev => ({
          ...prev,
          status: 'playing',
          opponentName: data.opponentName || 'Player 2'
        }));
        setMessage('Game started! Make your move.');
        break;

      case 'waiting_for_move':
        setGameState(prev => ({
          ...prev,
          status: 'waiting'
        }));
        setMessage("Waiting for opponent's move...");
        break;

      case 'move_made':
        setGameState(prev => ({
          ...prev,
          status: 'playing'
        }));
        setMessage('Opponent made their move. Your turn!');
        break;

      case 'game_result':
        const result = data.result;
        const isWinner = result === gameState.playerId;
        const isTie = result === 'tie';
        
        setGameState(prev => ({
          ...prev,
          status: 'playing',
          opponentChoice: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
          playerScore: prev.playerScore + (isWinner ? 1 : 0),
          opponentScore: prev.opponentScore + (!isWinner && !isTie ? 1 : 0),
          round: prev.round + 1,
          playerChoice: null,
          moveHistory: [...prev.moveHistory, {
            round: prev.round + 1,
            playerMove: prev.playerChoice,
            opponentMove: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
            result: isWinner ? 'win' : isTie ? 'tie' : 'lose'
          }]
        }));

        setMessage(isTie ? "It's a tie!" : isWinner ? 'You win!' : 'Opponent wins!');
        break;

      case 'player_disconnected':
        setMessage('Opponent disconnected. Please start a new game.');
        setGameState(prev => ({ 
          ...prev, 
          status: 'initial',
          playerHand: { rock: 0, paper: 0, scissors: 0 },
          moveHistory: []
        }));
        break;
    }
  };

  const createGame = () => {
    if (!playerName.trim()) {
      setMessage('Please enter your name first!');
      return;
    }
    socket.send(JSON.stringify({ 
      type: 'create_game',
      playerName: playerName 
    }));
  };

  const joinGame = () => {
    if (!playerName.trim()) {
      setMessage('Please enter your name first!');
      return;
    }
    if (socket && joinGameId) {
      socket.send(JSON.stringify({
        type: 'join_game',
        gameId: joinGameId,
        playerName: playerName
      }));
    }
  };

  const makeMove = (choice) => {
    if (gameState.playerHand[choice] > 0 && socket && gameState.status === 'playing') {
      const updatedHand = {...gameState.playerHand};
      updatedHand[choice]--;
      
      setGameState(prev => ({
        ...prev,
        playerChoice: choice,
        playerHand: updatedHand,
        status: 'waiting'
      }));

      socket.send(JSON.stringify({
        type: 'make_move',
        gameId: gameState.gameId,
        move: choice
      }));
    }
  };

  const CardComponent = ({ type, count, onClick, disabled }) => (
    <div 
      onClick={() => !disabled && count > 0 && onClick(type)}
      className={`
        relative w-24 h-36 rounded-lg ${
          disabled || count === 0 
            ? 'bg-gray-700 cursor-not-allowed' 
            : 'bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 cursor-pointer'
        }
        transform transition-all duration-200 hover:scale-105
        flex flex-col items-center justify-center border-4 border-white/10
      `}
    >
      <div className="text-4xl mb-2">{cardIcons[type]}</div>
      <div className="text-sm capitalize">{type}</div>
      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
        {count}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 flex">
      {/* Move History Sidebar */}
      <div className="w-64 bg-purple-900/50 backdrop-blur-sm p-4 rounded-lg mr-4 hidden lg:block">
        <h2 className="text-xl font-bold mb-4 text-white">Move History</h2>
        <div className="space-y-2 max-h-[calc(100vh-150px)] overflow-y-auto">
          {gameState.moveHistory.map((move, index) => (
            <div 
              key={index}
              className={`p-2 rounded text-sm ${
                move.result === 'win' 
                  ? 'bg-green-500/20 border border-green-500/30' 
                  : move.result === 'lose'
                    ? 'bg-red-500/20 border border-red-500/30'
                    : 'bg-gray-500/20 border border-gray-500/30'
              } text-white`}
            >
              <div className="font-bold">Round {move.round}</div>
              <div>{gameState.playerName}: {move.playerMove}</div>
              <div>{gameState.opponentName}: {move.opponentMove}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1">
        <div className="max-w-3xl mx-auto bg-purple-900/50 backdrop-blur-sm rounded-lg p-6">
          <h1 className="text-3xl font-bold text-center mb-6 text-white">
            Rock Paper Scissors
          </h1>
          
          {message && (
            <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4 mb-6 text-center text-white">
              {message}
            </div>
          )}

          {gameState.status === 'initial' && (
            <div className="space-y-4">
              <div className="mb-4">
                <label className="block text-white mb-2">Your Name:</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-white/10 border border-purple-500/30 text-white px-4 py-2 rounded"
                />
              </div>
              <button 
                onClick={createGame}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded transition"
              >
                Create New Game
              </button>
              <div className="flex gap-2">
                <input
                  value={joinGameId}
                  onChange={(e) => setJoinGameId(e.target.value)}
                  placeholder="Enter Game ID"
                  className="flex-1 bg-white/10 border border-purple-500/30 text-white px-4 py-2 rounded"
                />
                <button 
                  onClick={joinGame}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded transition"
                >
                  Join Game
                </button>
              </div>
            </div>
          )}

          {gameState.status !== 'initial' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center text-white">
                <div className="text-xl">Round: {gameState.round}/10</div>
                <div className="text-xl">
                  {gameState.playerName} {gameState.playerScore} - {gameState.opponentScore} {gameState.opponentName}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8">
                <div>
                  <h2 className="text-xl font-bold mb-4 text-white">Your Cards</h2>
                  <div className="flex flex-wrap gap-4 justify-center">
                    {['rock', 'paper', 'scissors'].map((type) => (
                      <CardComponent
                        key={type}
                        type={type}
                        count={gameState.playerHand[type]}
                        onClick={makeMove}
                        disabled={gameState.status === 'waiting'}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
