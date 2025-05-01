// Bomberman Game Server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Create Socket.IO server with CORS enabled
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your domain
    methods: ['GET', 'POST']
  }
});

// Game state
const gameState = {
  players: {},
  bombs: {},
  powerups: {},
  gameInProgress: false
};

// Lobby state
const lobbyState = {
  players: [],
  maxPlayers: 4,
  gameInProgress: false
};

// Player colors for visual identification
const playerColors = [
  '#FF5252', // Red
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#FFC107'  // Yellow
];

// Player connection handler
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Get nickname from query parameters
  const nickname = socket.handshake.query.nickname || 'Player';
  
  // Handle player joining the lobby
  socket.on('join_lobby', (data) => {
    console.log(`Player ${socket.id} (${nickname}) joining lobby`);
    
    // Check if player is already in lobby
    const existingPlayer = lobbyState.players.find(p => p.id === socket.id);
    if (existingPlayer) {
      console.log(`Player ${socket.id} already in lobby`);
      return;
    }
    
    // Check if lobby is full
    if (lobbyState.players.length >= lobbyState.maxPlayers) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }
    
    // Check if game is in progress
    if (lobbyState.gameInProgress) {
      socket.emit('error', { message: 'Game is already in progress' });
      return;
    }
    
    // Assign player color and player number
    const playerIndex = lobbyState.players.length;
    const playerColor = playerColors[playerIndex % playerColors.length];
    const playerNumber = playerIndex + 1; // Player numbers start from 1
    
    // Add player to lobby
    lobbyState.players.push({
      id: socket.id,
      nickname,
      isReady: false,
      color: playerColor,
      playerNumber: playerNumber
    });
    
    // Add player to game state for when game starts
    gameState.players[socket.id] = {
      id: socket.id,
      nickname,
      x: 0,
      y: 0,
      lives: 3,
      stats: {
        speed: 3,
        bombCapacity: 1,
        explosionRange: 1
      },
      isAlive: true,
      score: 0,
      color: playerColor,
      playerNumber: playerNumber
    };
    
    // Send player their own player number
    socket.emit('player:number', { playerNumber });
    
    // Send updated lobby state to all clients
    io.emit('lobby_update', { lobby: lobbyState });
    
    // Broadcast player joined event
    io.emit('player:joined', {
      id: socket.id,
      nickname,
      timestamp: Date.now()
    });
    
    // Check if we have 4 players - if so, start the countdown automatically
    if (lobbyState.players.length === 4) {
      console.log('4 players have joined! Starting game countdown automatically...');
      
      // Set all players as ready
      lobbyState.players.forEach(player => {
        player.isReady = true;
      });
      
      // Send updated lobby state to all clients
      io.emit('lobby_update', { lobby: lobbyState });
      
      // Start the countdown
      startGameCountdown();
    }
  });
  
  // Handle player ready status change
  socket.on('player_ready', (data) => {
    console.log(`Player ${socket.id} ready status: ${data.isReady}`);
    
    // Find player in lobby
    const playerIndex = lobbyState.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      console.log(`Player ${socket.id} not found in lobby`);
      return;
    }
    
    // Update player ready status
    lobbyState.players[playerIndex].isReady = data.isReady;
    
    // Send updated lobby state to all clients
    io.emit('lobby_update', { lobby: lobbyState });
    
    // Check if all players are ready to start the game
    checkGameStart();
  });
  
  // Send current game state to new player
  socket.emit('game:state', {
    gameId: 'game1',
    state: gameState.gameInProgress ? 'playing' : 'waiting',
    players: Object.values(gameState.players),
    bombs: Object.values(gameState.bombs),
    powerups: Object.values(gameState.powerups)
  });
  
  // Handle player join event
  socket.on('join', (data) => {
    console.log(`Player ${socket.id} joined as ${data.nickname}`);
    
    // Update nickname if provided
    if (data.nickname && gameState.players[socket.id]) {
      gameState.players[socket.id].nickname = data.nickname;
    }
  });
  
  // Handle chat messages
  socket.on('chat', (data) => {
    console.log(`Chat message from ${data.nickname}: ${data.message}`);
    
    // Find the player's number from the lobby
    let playerNumber = 0;
    const playerInLobby = lobbyState.players.find(p => p.id === socket.id);
    if (playerInLobby && playerInLobby.playerNumber) {
      playerNumber = playerInLobby.playerNumber;
    }
    
    // Create the message data with the server's timestamp if not provided
    const chatMessage = {
      playerId: socket.id,
      nickname: data.nickname,
      message: data.message,
      timestamp: data.timestamp || Date.now(),
      playerNumber: playerNumber
    };
    
    console.log(`Broadcasting chat message from Player ${playerNumber} (${data.nickname}):`, chatMessage);
    
    // Broadcast the message to all clients (including sender)
    io.emit('chat', chatMessage);
  });
  
  // Also handle messages sent with the EVENTS.CHAT event name
  socket.on('CHAT', (data) => {
    console.log(`CHAT event message from ${data.nickname}: ${data.message}`);
    
    // Find the player's number from the lobby
    let playerNumber = 0;
    const playerInLobby = lobbyState.players.find(p => p.id === socket.id);
    if (playerInLobby && playerInLobby.playerNumber) {
      playerNumber = playerInLobby.playerNumber;
    }
    
    // Create the message data
    const chatMessage = {
      playerId: socket.id,
      nickname: data.nickname,
      message: data.message,
      timestamp: data.timestamp || Date.now(),
      playerNumber: playerNumber
    };
    
    console.log(`Broadcasting CHAT event from Player ${playerNumber} (${data.nickname}):`, chatMessage);
    
    // Broadcast to all clients
    io.emit('chat', chatMessage);
  });
  
  // Handle player movement
  socket.on('move', (data) => {
    if (!gameState.players[socket.id]) return;
    
    // Update player position
    gameState.players[socket.id].x = data.x;
    gameState.players[socket.id].y = data.y;
    gameState.players[socket.id].direction = data.direction;
    
    // Broadcast movement to all players including the sender
    // This ensures consistent state across all clients
    io.emit('move', {
      playerId: socket.id,
      x: data.x,
      y: data.y,
      direction: data.direction,
      nickname: gameState.players[socket.id].nickname
    });
  });
  
  // Handle bomb placement
  socket.on('drop_bomb', (data) => {
    if (!gameState.players[socket.id]) return;
    
    // Create unique bomb ID
    const bombId = `bomb_${socket.id}_${Date.now()}`;
    
    // Add bomb to game state
    gameState.bombs[bombId] = {
      id: bombId,
      ownerId: socket.id,
      x: data.x,
      y: data.y,
      explosionRange: data.explosionRange || gameState.players[socket.id].stats.explosionRange,
      timeRemaining: 2000 // 2 seconds
    };
    
    // Broadcast bomb placement to all players including the sender
    // This ensures consistent state across all clients
    io.emit('drop_bomb', {
      bombId,
      playerId: socket.id,
      x: data.x,
      explosionRange: gameState.bombs[bombId].explosionRange,
      nickname: gameState.players[socket.id].nickname
    });
    
    // Set timeout for bomb explosion
    setTimeout(() => {
      // Remove bomb from game state
      delete gameState.bombs[bombId];
      
      // Broadcast bomb explosion with complete and consistent data
      console.log('Server broadcasting bomb explosion:', {
        bombId,
        ownerId: socket.id,
        x: data.x,
        y: data.y,
        explosionRange: data.explosionRange || gameState.players[socket.id].stats.explosionRange
      });
      
      io.emit('bomb:explode', {
        bombId,
        ownerId: socket.id,
        x: data.x,
        y: data.y,
        explosionRange: data.explosionRange || gameState.players[socket.id].stats.explosionRange,
        nickname: gameState.players[socket.id].nickname
      });
    }, 2000);
  });
  
  // Handle block destruction event
  socket.on('block:destroyed', (data) => {
    console.log(`Player ${socket.id} destroyed a block at (${data.x}, ${data.y})`);
    
    // Broadcast block destruction to all players
    io.emit('block:destroyed', {
      x: data.x,
      y: data.y,
      type: data.type,
      playerId: socket.id
    });
    
    // Determine if a power-up should spawn (5% chance - reduced to make powerups more rare)
    const POWERUP_CHANCE = 0.02;
    if (Math.random() < POWERUP_CHANCE) {
      // Determine power-up type with weighted probability
      // Bomb: 40%, Flame: 30%, Speed: 30%
      const typeRoll = Math.random();
      let selectedType;
      
      if (typeRoll < 0.4) {
        selectedType = 'BOMB';
      } else if (typeRoll < 0.7) {
        selectedType = 'FLAME';
      } else {
        selectedType = 'SPEED';
      }
      
      console.log(`Server spawning a ${selectedType} power-up at (${data.x}, ${data.y})`);
      
      // Broadcast power-up spawn to all players
      io.emit('powerup:spawned', {
        x: data.x,
        y: data.y,
        type: selectedType,
        timestamp: Date.now(),
        playerId: socket.id
      });
    }
  });
  
  // Handle power-up collection
  socket.on('collect_powerup', (data) => {
    console.log('Player collected powerup:', data);
    
    // Check if we have the required data
    if (!gameState.players[socket.id] || !data.x || !data.y) {
      console.log('Missing required data for powerup collection');
      return;
    }
    
    // Get the powerup type from the data or use a default
    const powerupType = data.powerupType || 'bomb';
    
    // Apply power-up effect to player
    switch (powerupType.toLowerCase()) {
      case 'bomb':
        gameState.players[socket.id].stats.bombCapacity += 1;
        break;
      case 'flame':
        gameState.players[socket.id].stats.explosionRange += 1;
        break;
      case 'speed':
        gameState.players[socket.id].stats.speed += 1;
        break;
    }
    
    // Broadcast power-up collection to all players
    io.emit('powerup:collected', {
      playerId: socket.id,
      type: powerupType,
      x: data.x,
      y: data.y,
      timestamp: Date.now()
    });
    
    console.log(`Broadcast powerup collection at (${data.x}, ${data.y}) by player ${socket.id}`);
  });
  
  // Handle chat messages
  socket.on('chat', (data) => {
    // Broadcast chat message to all players
    io.emit('chat', {
      playerId: socket.id,
      nickname: gameState.players[socket.id]?.nickname || 'Unknown',
      message: data.message,
      timestamp: Date.now()
    });
  });
  
  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Get player nickname before removing
    const playerNickname = gameState.players[socket.id]?.nickname || 'Unknown';
    
    // Remove player from game state
    delete gameState.players[socket.id];
    
    // Remove player from lobby
    const playerIndex = lobbyState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      lobbyState.players.splice(playerIndex, 1);
      
      // Send updated lobby state to all clients
      io.emit('lobby_update', { lobby: lobbyState });
    }
    
    // Broadcast player left event
    io.emit('player:left', {
      id: socket.id,
      nickname: playerNickname,
      timestamp: Date.now()
    });
  });
  
  // Handle end game request
  socket.on('end_game', () => {
    console.log(`Player ${socket.id} requested to end the game`);
    
    // Reset lobby state
    lobbyState.gameInProgress = false;
    
    // Reset all players' ready status
    lobbyState.players.forEach(player => {
      player.isReady = false;
    });
    
    // Send updated lobby state to all clients
    io.emit('lobby_update', { lobby: lobbyState });
    
    // Broadcast game ended event
    io.emit('game:ended', {
      reason: 'Player requested to end the game',
      timestamp: Date.now()
    });
  });
  
  // Handle player leaving lobby
  socket.on('leave_lobby', () => {
    // Remove player from lobby
    const playerIndex = lobbyState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      lobbyState.players.splice(playerIndex, 1);
      
      // Send updated lobby state to all clients
      io.emit('lobby_update', { lobby: lobbyState });
    }
  });
  
  // Handle player ready state toggle
  socket.on('player_ready', (data) => {
    // Update player ready state in lobby
    const playerIndex = lobbyState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      lobbyState.players[playerIndex].isReady = data.isReady;
      
      // Send updated lobby state to all clients
      io.emit('lobby_update', { lobby: lobbyState });
    }
  });
  
  // Handle direct game start request (from single player or countdown timer)
  socket.on('start_game', (data) => {
    console.log(`Player ${socket.id} requested to start the game directly`, data);
    
    // Check if this is a single player game request
    const isSinglePlayerMode = data && data.singlePlayer === true;
    
    // Make sure we have at least 2 players for multiplayer games
    if (lobbyState.players.length < 2 && !isSinglePlayerMode) {
      socket.emit('error', { message: 'Need at least 2 players to start a multiplayer game' });
      return;
    }
    
    // Start the game immediately
    startGame(isSinglePlayerMode);
  });
});

// Start game function
function startGame(isSinglePlayerMode = false) {
  // Set game in progress
  gameState.gameInProgress = true;
  lobbyState.gameInProgress = true;
  
  // Reset player positions and stats
  Object.values(gameState.players).forEach((player, index) => {
    // Place players in different corners based on their index
    switch (index % 4) {
      case 0: // Top left
        player.x = 1;
        player.y = 1;
        break;
      case 1: // Top right
        player.x = 13;
        player.y = 1;
        break;
      case 2: // Bottom left
        player.x = 1;
        player.y = 13;
        break;
      case 3: // Bottom right
        player.x = 13;
        player.y = 13;
        break;
    }
    
    player.lives = 3;
    player.isAlive = true;
    player.score = 0;
  });
  
  // Clear bombs and powerups
  gameState.bombs = {};
  gameState.powerups = {};
  
  // Generate random powerups
  for (let i = 0; i < 10; i++) {
    const powerupId = `powerup_${Date.now()}_${i}`;
    const powerupTypes = ['bombCapacity', 'explosionRange', 'speed', 'extraLife'];
    const randomType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    
    gameState.powerups[powerupId] = {
      id: powerupId,
      type: randomType,
      x: Math.floor(Math.random() * 10) + 3, // Avoid spawning in corners
      y: Math.floor(Math.random() * 10) + 3  // Avoid spawning in corners
    };
  }
  
  // Generate a random map seed for consistent map generation across clients
  const mapSeed = Math.floor(Math.random() * 1000000);
  
  // Broadcast game started event
  io.emit('game:started', {
    players: Object.values(gameState.players),
    powerups: Object.values(gameState.powerups),
    mapSeed
  });
}

// End game function
function endGame() {
  if (!gameState.gameInProgress) return;
  
  gameState.gameInProgress = false;
  
  // Calculate winner
  const players = Object.values(gameState.players);
  players.sort((a, b) => b.score - a.score);
  
  const winner = players.length > 0 ? players[0] : null;
  
  // Prepare player rankings
  const rankings = players.map((player, index) => ({
    id: player.id,
    nickname: player.nickname,
    score: player.score,
    rank: index + 1
  }));
  
  // Broadcast game end
  io.emit('game:ended', {
    gameId: 'game1',
    winner: winner ? {
      id: winner.id,
      nickname: winner.nickname,
      score: winner.score
    } : undefined,
    players: rankings,
    duration: 0 // Calculate actual duration in a real implementation
  });
}

// Check if all players are ready to start the game
function checkGameStart() {
  if (gameState.gameInProgress || lobbyState.players.length < 2) return;
  
  // Check if all players are ready
  const allReady = lobbyState.players.length > 0 && lobbyState.players.every(p => p.isReady);
  
  if (allReady) {
    console.log('All players ready, starting game countdown...');
    startGameCountdown();
  }
}

// Game countdown timer variable
let gameCountdownTimer = null;

// Start the game countdown (10 seconds)
function startGameCountdown() {
  // Clear any existing countdown
  if (gameCountdownTimer) {
    clearInterval(gameCountdownTimer);
  }
  
  // Set the countdown duration (10 seconds)
  let countdown = 10;
  
  // Broadcast initial countdown message
  io.emit('game:countdown', { seconds: countdown });
  console.log(`Game starting in ${countdown} seconds...`);
  
  // Start the countdown timer
  gameCountdownTimer = setInterval(() => {
    countdown--;
    
    // Broadcast countdown update
    io.emit('game:countdown', { seconds: countdown });
    console.log(`Game starting in ${countdown} seconds...`);
    
    // When countdown reaches 0, start the game
    if (countdown <= 0) {
      clearInterval(gameCountdownTimer);
      gameCountdownTimer = null;
      startGame();
    }
  }, 1000);
}

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../')));

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bomberman game server running on port ${PORT}`);
});
