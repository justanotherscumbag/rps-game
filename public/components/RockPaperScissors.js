const RockPaperScissors = () => {
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
  });

  const [socket, setSocket] = React.useState(null);
  const [joinGameId, setJoinGameId] = React.useState('');
  const [message, setMessage] = React.useState(null);
  const [showConfetti, setShowConfetti] = React.useState(false);

  // Sound effects
  const playSound = (type) => {
    const sounds = {
      move: new Audio('/sounds/move.mp3'),
      win: new Audio('/sounds/win.mp3'),
      lose: new Audio('/sounds/lose.mp3'),
      draw: new Audio('/sounds/draw.mp3')
    };
    sounds[type]?.play().catch(() => {});
  };

  // Generate initial hand
  const generateHand = () => {
    const hand = { rock: 0, paper: 0, scissors: 0 };
    const total = 15; // Total cards to distribute
    let remaining = total;
    
    // Randomly distribute cards
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

  // Handle game messages
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
        const initialHand = generateHand();
        setGameState(prev => ({
          ...prev,
          gameId: data.gameId,
          playerId: data.playerId,
          status: 'waiting',
          playerHand: initialHand
        }));
        break;

      case 'game_started':
        setGameState(prev => ({
          ...prev,
          status: 'playing'
        }));
        playSound('move');
        break;

      case 'game_result':
        const result = data.result;
        const isWinner = result === gameState.playerId;
        const isTie = result === 'tie';
        
        // Update hands after move
        const updatedHand = {...gameState.playerHand};
        if (gameState.playerChoice) {
          updatedHand[gameState.playerChoice]--;
        }

        const newRound = gameState.round + 1;
        const canRedraw = newRound === 5;
        
        setGameState(prev => ({
          ...prev,
          opponentChoice: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
          playerHand: updatedHand,
          playerScore: prev.playerScore + (isWinner ? 1 : 0),
          opponentScore: prev.opponentScore + (!isWinner && !isTie ? 1 : 0),
          round: newRound,
          canRedraw,
          moveHistory: [...prev.moveHistory, {
            round: prev.round + 1,
            playerMove: prev.playerChoice,
            opponentMove: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
            result: isWinner ? 'win' : isTie ? 'tie' : 'lose'
          }]
        }));

        playSound(isWinner ? 'win' : isTie ? 'draw' : 'lose');
        if (isWinner) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }
        break;
    }
  };

  const makeMove = (choice) => {
    if (gameState.playerHand[choice] > 0) {
      setGameState(prev => ({ 
        ...prev, 
        playerChoice: choice,
        status: 'waiting_for_opponent'
      }));
      socket.send(JSON.stringify({
        type: 'make_move',
        gameId: gameState.gameId,
        move: choice
      }));
      playSound('move');
    }
  };

  const redrawCards = () => {
    if (gameState.canRedraw) {
      const newHand = generateHand();
      setGameState(prev => ({
        ...prev,
        playerHand: newHand,
        canRedraw: false
      }));
      playSound('draw');
    }
  };

  // Render game board with cards and history
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto bg-black/30 rounded-lg p-6 backdrop-blur-sm">
        <h1 className="text-4xl font-bold text-center mb-6 text-purple-300">
          Rock Paper Scissors Card Game
        </h1>
        
        {/* Game Status Message */}
        {message && (
          <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-4 mb-6 text-center">
            {message}
          </div>
        )}

        {/* Game Setup */}
        {gameState.status === 'initial' && (
          <div className="space-y-4">
            <button 
              onClick={createGame}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Create New Game
            </button>
            <div className="flex gap-2">
              <input
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                placeholder="Enter Game ID"
                className="flex-1 bg-white/10 border border-purple-500/30 text-white px-4 py-2 rounded-lg"
              />
              <button 
                onClick={joinGame}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition"
              >
                Join Game
              </button>
            </div>
          </div>
        )}

        {/* Game Board */}
        {gameState.status !== 'initial' && (
          <div className="space-y-6">
            {/* Score and Round Info */}
            <div className="flex justify-between items-center">
              <div className="text-xl">
                Round: {gameState.round}/10
              </div>
              <div className="text-xl">
                Score: You {gameState.playerScore} - {gameState.opponentScore} Opponent
              </div>
            </div>

            {/* Player's Hand */}
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Your Hand</h2>
                <div className="flex gap-4">
                  {['rock', 'paper', 'scissors'].map(type => (
                    <button
                      key={type}
                      onClick={() => makeMove(type)}
                      disabled={gameState.playerChoice || gameState.playerHand[type] === 0}
                      className={`relative p-4 rounded-lg ${
                        gameState.playerHand[type] > 0 
                          ? 'bg-purple-600 hover:bg-purple-700' 
                          : 'bg-gray-700'
                      } transition`}
                    >
                      <div className="text-2xl mb-2">
                        {type === 'rock' ? '✊' : type === 'paper' ? '✋' : '✌️'}
                      </div>
                      <div className="absolute -top-2 -right-2 bg-purple-500 rounded-full w-6 h-6 flex items-center justify-center">
                        {gameState.playerHand[type]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Move History */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Move History</h2>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {gameState.moveHistory.map((move, index) => (
                    <div 
                      key={index}
                      className={`p-2 rounded ${
                        move.result === 'win' 
                          ? 'bg-green-500/20' 
                          : move.result === 'lose'
                            ? 'bg-red-500/20'
                            : 'bg-gray-500/20'
                      }`}
                    >
                      Round {move.round}: {move.playerMove} vs {move.opponentMove}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Redraw Button */}
            {gameState.canRedraw && (
              <button
                onClick={redrawCards}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg transition"
              >
                Redraw Cards (Available at Round 5)
              </button>
            )}
          </div>
        )}

        {/* Confetti Effect */}
        {showConfetti && <div className="confetti-overlay" />}
      </div>
    </div>
  );
};
