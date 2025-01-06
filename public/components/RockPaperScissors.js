const RockPaperScissors = () => {
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
        setMessage('Share this code with your friend to play!');
        break;

      case 'game_started':
        setGameState(prev => ({
          ...prev,
          status: 'playing',
          opponentName: data.opponentName || 'Player 2',
          playerHand: prev.playerHand.rock === 0 ? generateHand() : prev.playerHand // Generate hand only if player doesn't have cards
        }));
        setMessage('Game started! Pick your card!');
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

        setMessage(isTie ? "It's a tie!" : isWinner ? '🎉 You win! 🎉' : 'Opponent wins!');
        break;

      case 'player_disconnected':
        setMessage('Opponent left the game. Start a new game!');
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
        relative w-40 h-56 rounded-2xl ${
          disabled || count === 0 
            ? 'bg-gray-300 cursor-not-allowed' 
            : 'bg-gradient-to-br from-pink-400 to-orange-400 hover:from-pink-300 hover:to-orange-300 cursor-pointer'
        }
        transform transition-all duration-200 hover:scale-105
        flex flex-col items-center justify-center border-8 ${
          disabled || count === 0 
            ? 'border-gray-200' 
            : 'border-yellow-300'
        }
        shadow-xl
      `}
    >
      <div className="text-6xl mb-4">{cardIcons[type]}</div>
      <div className="text-xl capitalize font-bold text-white">{type}</div>
      <div className="absolute -top-4 -right-4 w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold border-4 border-yellow-300 shadow-lg">
        {count}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 flex bg-gradient-to-b from-blue-400 to-purple-400">
      {/* Move History Sidebar */}
      <div className="w-80 bg-white/90 backdrop-blur-sm p-6 rounded-2xl mr-6 hidden lg:block shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-blue-600">Move History</h2>
        <div className="space-y-3 max-h-[calc(100vh-150px)] overflow-y-auto">
          {gameState.moveHistory.map((move, index) => (
            <div 
              key={index}
              className={`p-3 rounded-xl text-base ${
                move.result === 'win' 
                  ? 'bg-green-100 border-2 border-green-300' 
                  : move.result === 'lose'
                    ? 'bg-pink-100 border-2 border-pink-300'
                    : 'bg-yellow-100 border-2 border-yellow-300'
              }`}
            >
              <div className="font-bold text-blue-600">Round {move.round}</div>
              <div>{gameState.playerName}: {move.playerMove}</div>
              <div>{gameState.opponentName}: {move.opponentMove}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
          <h1 className="text-4xl font-bold text-center mb-8 text-blue-600">
            Rock Paper Scissors
          </h1>
          
          {message && (
            <div className="bg-blue-100 border-2 border-blue-300 rounded-xl p-4 mb-6 text-center text-blue-600 text-lg">
              {message}
            </div>
          )}

          {/* Game Code Display */}
          {gameState.status === 'waiting' && (
            <div className="bg-yellow-100 border-2 border-yellow-300 rounded-xl p-6 mb-8 text-center">
              <h3 className="text-2xl font-bold text-yellow-600 mb-2">Your Game Code:</h3>
              <div className="text-4xl font-bold text-yellow-500 font-mono mb-4">
                {gameState.gameId}
              </div>
              <p className="text-yellow-600">Share this code with your friend to start playing!</p>
            </div>
          )}

          {gameState.status === 'initial' && (
            <div className="space-y-6">
              <div className="mb-6">
                <label className="block text-blue-600 text-xl mb-3 font-bold">Your Name:</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-blue-50 border-2 border-blue-300 text-blue-600 px-6 py-3 rounded-xl text-xl"
                />
              </div>
              <button 
                onClick={createGame}
                className="w-full bg-green-500 hover:bg-green-400 text-white text-xl font-bold py-4 px-8 rounded-xl transition shadow-lg"
              >
                Create New Game
              </button>
              <div className="flex gap-4">
                <input
                  value={joinGameId}
                  onChange={(e) => setJoinGameId(e.target.value)}
                  placeholder="Enter Game Code"
                  className="flex-1 bg-blue-50 border-2 border-blue-300 text-blue-600 px-6 py-3 rounded-xl text-xl"
                />
                <button 
                  onClick={joinGame}
                  className="bg-pink-500 hover:bg-pink-400 text-white text-xl font-bold py-4 px-8 rounded-xl transition shadow-lg"
                >
                  Join Game
                </button>
              </div>
            </div>
          )}

          {gameState.status !== 'initial' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <div className="text-2xl font-bold text-blue-600">Round: {gameState.round}/10</div>
                <div className="text-2xl font-bold text-blue-600">
                  {gameState.playerName} {gameState.playerScore} - {gameState.opponentScore} {gameState.opponentName}
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-6 text-blue-600">Your Cards</h2>
                <div className="flex flex-wrap gap-6 justify-center">
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
          )}
        </div>
      </div>
    </div>
  );
};
