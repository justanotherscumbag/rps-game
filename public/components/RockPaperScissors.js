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

  // Sound effect function using older syntax
  const playSound = (type) => {
    const sounds = {
      move: new Audio('/sounds/move.mp3'),
      win: new Audio('/sounds/win.mp3'),
      lose: new Audio('/sounds/lose.mp3'),
      draw: new Audio('/sounds/draw.mp3')
    };
    if (sounds[type]) {
      sounds[type].play().catch(function(error) {
        console.log('Sound play failed:', error);
      });
    }
  };

  // Generate initial hand
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

  React.useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
      const data = JSON.parse(event.data);
      handleGameMessage(data);
    };

    setSocket(ws);

    return function cleanup() {
      ws.close();
    };
  }, []);

  const handleGameMessage = (data) => {
    switch (data.type) {
      case 'game_created':
        setGameState(function(prev) {
          return {
            ...prev,
            gameId: data.gameId,
            playerId: data.playerId,
            status: 'waiting',
            playerHand: generateHand()
          };
        });
        setMessage('Game created! Share your game ID.');
        break;

      case 'game_started':
        setGameState(function(prev) {
          return {
            ...prev,
            status: 'playing'
          };
        });
        setMessage('Game started! Make your move.');
        playSound('move');
        break;

      case 'waiting_for_move':
        setMessage("Waiting for opponent's move...");
        break;

      case 'game_result':
        const result = data.result;
        const isWinner = result === gameState.playerId;
        const isTie = result === 'tie';
        
        setGameState(function(prev) {
          return {
            ...prev,
            status: 'finished',
            opponentChoice: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
            playerScore: prev.playerScore + (isWinner ? 1 : 0),
            opponentScore: prev.opponentScore + (!isWinner && !isTie ? 1 : 0),
            round: prev.round + 1,
            moveHistory: [...prev.moveHistory, {
              round: prev.round + 1,
              playerMove: prev.playerChoice,
              opponentMove: data.moves[prev.playerId === 'player1' ? 'player2' : 'player1'],
              result: isWinner ? 'win' : isTie ? 'tie' : 'lose'
            }]
          };
        });

        playSound(isWinner ? 'win' : isTie ? 'draw' : 'lose');
        break;
    }
  };

  const createGame = () => {
    if (socket) {
      socket.send(JSON.stringify({ type: 'create_game' }));
    }
  };

  const joinGame = () => {
    if (socket && joinGameId) {
      socket.send(JSON.stringify({
        type: 'join_game',
        gameId: joinGameId
      }));
    }
  };

  const makeMove = (choice) => {
    if (gameState.playerHand[choice] > 0 && socket) {
      const updatedHand = {...gameState.playerHand};
      updatedHand[choice]--;
      
      setGameState(function(prev) {
        return {
          ...prev,
          playerChoice: choice,
          playerHand: updatedHand,
          status: 'waiting_for_opponent'
        };
      });

      socket.send(JSON.stringify({
        type: 'make_move',
        gameId: gameState.gameId,
        move: choice
      }));
      playSound('move');
    }
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto bg-purple-900 bg-opacity-50 rounded-lg p-6 backdrop-blur-sm">
        <h1 className="text-3xl font-bold text-center mb-6 text-white">
          Rock Paper Scissors
        </h1>
        
        {message && (
          <div className="bg-purple-500 bg-opacity-20 border border-purple-500 border-opacity-50 rounded-lg p-4 mb-6 text-center text-white">
            {message}
          </div>
        )}

        {gameState.status === 'initial' && (
          <div className="space-y-4">
            <button 
              onClick={createGame}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
            >
              Create New Game
            </button>
            <div className="flex gap-2">
              <input
                value={joinGameId}
                onChange={function(e) { setJoinGameId(e.target.value); }}
                placeholder="Enter Game ID"
                className="flex-1 bg-white bg-opacity-10 text-white px-4 py-2 rounded"
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
          <div className="text-center text-white">
            <p className="mb-4">Your Game ID: {gameState.gameId}</p>
            <p>Waiting for opponent to join...</p>
          </div>
        )}

        {(gameState.status === 'playing' || gameState.status === 'waiting_for_opponent') && (
          <div className="space-y-6">
            <div className="flex justify-between items-center text-white">
              <div>Round: {gameState.round}/10</div>
              <div>Score: {gameState.playerScore} - {gameState.opponentScore}</div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div>
                <h2 className="text-xl font-bold mb-4 text-white">Your Hand</h2>
                <div className="flex gap-4">
                  {['rock', 'paper', 'scissors'].map(function(type) {
                    return (
                      <button
                        key={type}
                        onClick={function() { makeMove(type); }}
                        disabled={gameState.playerHand[type] === 0 || gameState.status === 'waiting_for_opponent'}
                        className={`relative p-4 rounded ${
                          gameState.playerHand[type] > 0 
                            ? 'bg-purple-600 hover:bg-purple-700' 
                            : 'bg-gray-700'
                        } text-white`}
                      >
                        {type}
                        <span className="absolute -top-2 -right-2 bg-purple-500 rounded-full w-6 h-6 flex items-center justify-center text-sm">
                          {gameState.playerHand[type]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold mb-4 text-white">Move History</h2>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {gameState.moveHistory.map(function(move, index) {
                    return (
                      <div 
                        key={index}
                        className={`p-2 rounded ${
                          move.result === 'win' 
                            ? 'bg-green-500 bg-opacity-20' 
                            : move.result === 'lose'
                              ? 'bg-red-500 bg-opacity-20'
                              : 'bg-gray-500 bg-opacity-20'
                        } text-white`}
                      >
                        Round {move.round}: {move.playerMove} vs {move.opponentMove}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
