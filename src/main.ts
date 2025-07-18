// Main entry point for Bomberman DOM game - Central backend for multiplayer functionality
import { initGame } from './game/init';
import { connectToServer, disconnectFromServer, sendToServer, getSocketId, isConnectedToServer, getSocket } from './multiplayer/socket';
import { initChat, addSystemMessage } from './multiplayer/chat';
import { initChatUI } from './ui/chatUI';
import { eventBus } from '../framework/events';
import { h, render } from '../framework/dom';
import { EVENTS, MoveEventData, DropBombEventData, CollectPowerupEventData } from './multiplayer/events';
import { Direction } from './entities/player';
import { TILE_SIZE } from './game/constants';
import { initLobby } from './game/lobby';
import { initEgyptTheme } from './ui/egyptTheme';

// Import Egyptian theme CSS
import './styles/egypt.css';

// Egyptian chat theme CSS is loaded via a link element in the document head
// This is done in the DOMContentLoaded event below

// Connection state
let isConnected = false;
let playerId: string | null = null;
let socket: any = null;

document.addEventListener('DOMContentLoaded', () => {
  // Load Egyptian chat theme CSS
  const linkElement = document.createElement('link');
  linkElement.rel = 'stylesheet';
  linkElement.href = '/egyptian-chat-theme.css';
  document.head.appendChild(linkElement);
  
  // Initialize Egyptian theme
  initEgyptTheme(document.body);
  
  // Clear any existing content to prevent old styles from appearing
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '';
    
    // Apply base styles to body using the framework's approach
    const bodyStyleVNode = h('style', {}, [
      `
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        width: 100vw;
        height: 100vh;
        background-color: #f5e7c9; /* Egyptian theme background color */
      }
      `
    ]);
    
    // Render and append the body styles
    document.head.appendChild(render(bodyStyleVNode) as HTMLElement);
    
    // Create app container with styles using the framework's h function
    const appContainerVNode = h('div', {
      id: 'app-container',
      style: `
        width: 100vw;
        height: 100vh;
        position: relative;
        overflow: hidden;
        background-color: #f5e7c9; /* Egyptian theme background color */
      `
    }, []);
    
    // Render the app container
    const renderedAppContainer = render(appContainerVNode) as HTMLElement;
    
    // Replace the app's content with the rendered container
    app.innerHTML = '';
    app.appendChild(renderedAppContainer);
    
    // Initialize the game immediately (skipping the old lobby)
    initGame();
    
    // Initialize the lobby directly from here
    // This ensures only one lobby is shown
    initLobby(app);
    
    // Initialize Egyptian Pyramid theme
    initEgyptTheme(app);
    
    // Remove any existing chat buttons that might be showing
    const existingButton = document.querySelector('.chat-toggle');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Chat UI will be initialized after player enters nickname
  }
  
  // Listen for player login to initialize multiplayer
  eventBus.on('player:login', (data: { nickname: string }) => {
    // Initialize multiplayer when player logs in
    initializeMultiplayer(data.nickname);
  });
});

// Initialize multiplayer components
async function initializeMultiplayer(nickname: string) {
  try {
    // Store nickname in localStorage for persistence
    localStorage.setItem('playerNickname', nickname);
    
    // Connect to server
    await connectToServer(nickname);
    
    // Set connected state
    isConnected = true;
    playerId = getSocketId();
    socket = getSocket();
    
    // Set up event listeners after socket is initialized
    setupEventListeners();
    
    // Initialize chat with player nickname
    initChat(nickname);
    
    // Initialize chat UI but only after the player joins the game, not on login screen
    const gameContainer = document.getElementById('app');
    if (gameContainer) {
      // We'll initialize the chat UI in the lobby.ts file after the player joins
      // NOT initializing chat UI here to prevent it from appearing on login screen
      console.log('Chat UI will be initialized after joining lobby');
    }
    
    // Add system message
    addSystemMessage(`Connected to game server as ${nickname}`);
    
    // The JOIN_LOBBY event is now sent automatically in the socket.ts file
    // immediately after connection for instant lobby joining
    console.log('Lobby join will happen automatically on connection');
    
    console.log('Multiplayer initialized successfully');
  } catch (error) {
    console.error('Failed to initialize multiplayer:', error);
    // Show error message to user
    const errorMessage = document.createElement('div');
    errorMessage.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(255, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      z-index: 9999;
    `;
    errorMessage.textContent = 'Failed to connect to multiplayer server. Playing in offline mode.';
    document.body.appendChild(errorMessage);
    
    // Remove error message after 5 seconds
    setTimeout(() => {
      if (errorMessage.parentNode) {
        errorMessage.parentNode.removeChild(errorMessage);
      }
    }, 5000);
  }
}

/**
 * Set up event listeners for game events
 */
function setupEventListeners(): void {
  // Make sure socket is initialized
  if (!socket) {
    console.error('Socket is not initialized yet');
    return;
  }
  
  // Listen for lobby updates from server
  socket.on(EVENTS.LOBBY_UPDATE, (data) => {
    // Forward to event bus for lobby UI to handle
    eventBus.emit('lobby_update', data);
  });
  
  // Listen for game start from server
  socket.on(EVENTS.START_GAME, (data) => {
    // Forward to event bus
    eventBus.emit('game:started', data);
  });
  
  // Listen for errors from server
  socket.on('error', (data) => {
    // Forward to event bus
    eventBus.emit('error', data);
  });
  
  // Local player moved - send to server
  eventBus.on('player:moved', (data: { id: string, x: number, y: number }) => {
    // Only send if it's the local player
    if (data.id === playerId) {
      sendPlayerMove(data.x, data.y);
    }
  });
  
  // Local player placed bomb - send to server
  eventBus.on('bomb:placed', (data: { playerId: string, x: number, y: number, range: number }) => {
    // Only send if it's the local player
    if (data.playerId === playerId) {
      sendBombPlaced(data.x, data.y, data.range);
    }
  });
  
  // Local player collected powerup - send to server
  eventBus.on('powerup:collected', (data: { playerId: string, type: string, x: number, y: number }) => {
    // Only send if it's the local player
    if (data.playerId === playerId) {
      sendPowerupCollected(data.type, data.x, data.y);
    }
  });
  
  // Remote player moved - update game state
  eventBus.on('remote:player:moved', (data: MoveEventData) => {
    // Update remote player position
    eventBus.emit('remote:player:update', {
      id: data.playerId,
      x: data.x,
      y: data.y,
      direction: data.direction
    });
  });
  
  // Remote player placed bomb - update game state
  eventBus.on('remote:bomb:dropped', (data: DropBombEventData) => {
    // Create bomb at remote player's position
    eventBus.emit('remote:bomb:create', {
      ownerId: data.playerId,
      x: data.x,
      y: data.y,
      explosionRange: data.explosionRange
    });
  });
  
  // Remote powerup spawned - update game state
  socket.on('powerup:spawned', (data: { x: number, y: number, type: string }) => {
    console.log('Received powerup:spawned event from server:', data);
    // Forward to event bus for powerup system to handle
    eventBus.emit('remote:powerup:spawned', data);
    
    // Also directly call the powerup spawning function to ensure it's created
    import('./game/powerups').then(powerupModule => {
      // Convert server powerup type to local enum
      let powerupType;
      switch (data.type) {
        case 'BOMB':
          powerupType = powerupModule.PowerUpType.BOMB;
          break;
        case 'FLAME':
          powerupType = powerupModule.PowerUpType.FLAME;
          break;
        case 'SPEED':
          powerupType = powerupModule.PowerUpType.SPEED;
          break;
        default:
          powerupType = powerupModule.PowerUpType.BOMB; // Default fallback
      }
      
      // Create a new powerup at the specified location
      const powerup = new powerupModule.PowerUp(data.x, data.y, powerupType);
      
      // Get the map container and render the powerup
      import('./game/renderer').then(rendererModule => {
        const container = rendererModule.getMapContainer();
        if (container) {
          powerup.render(container);
          console.log(`Rendered remote powerup at (${data.x}, ${data.y}) with type ${data.type}`);
        }
      });
    }).catch(error => {
      console.error('Failed to spawn remote powerup:', error);
    });
  });
  
  // Remote powerup collected - update game state
  socket.on('powerup:collected', (data: { powerupId: string, playerId: string, type: string, x: number, y: number }) => {
    console.log('Received powerup:collected event from server:', data);
    // Forward to event bus for powerup system to handle
    eventBus.emit('remote:powerup:collected', data);
    
    // Also directly handle the powerup collection to ensure it's removed
    import('./game/powerups').then(powerupModule => {
      // Find and remove the powerup at this position
      const activePowerUps = powerupModule.getActivePowerUps();
      const powerupIndex = activePowerUps.findIndex(p => p.isAt(data.x, data.y));
      
      if (powerupIndex !== -1) {
        const powerup = activePowerUps[powerupIndex];
        console.log(`Found powerup to collect at (${data.x}, ${data.y})`);
        
        // Collect the powerup
        powerup.collect(data.playerId);
        console.log(`Remote powerup collected by player ${data.playerId}`);
      } else {
        console.log(`No powerup found at position (${data.x}, ${data.y}) to collect`);
        
        // If we didn't find the powerup in the activePowerUps array, try to find it directly in the DOM
        // This is a fallback for cases where the powerup might be in the DOM but not tracked in our array
        const powerupElements = document.querySelectorAll('.powerup');
        console.log(`Searching through ${powerupElements.length} powerup DOM elements`);
        
        powerupElements.forEach((el) => {
          const powerupEl = el as HTMLElement;
          const left = parseInt(powerupEl.style.left) / TILE_SIZE;
          const top = parseInt(powerupEl.style.top) / TILE_SIZE;
          
          if (Math.floor(left) === data.x && Math.floor(top) === data.y) {
            console.log(`Found powerup in DOM at position (${data.x}, ${data.y})`);
            
            // Add collection animation to the powerup
            powerupEl.style.animation = 'powerup-collect 0.5s forwards';
            
            // Remove the powerup element after animation
            setTimeout(() => {
              if (powerupEl.parentNode) {
                powerupEl.parentNode.removeChild(powerupEl);
              }
            }, 500);
          }
        });
      }
    }).catch(error => {
      console.error('Failed to handle remote powerup collection:', error);
    });
  });
  
  // Remote player hit event from server
  socket.on('player:hit', (data: { playerId: string, attackerId: string, timestamp: number }) => {
    console.log('Received player:hit event from server:', data);
    
    // Forward to event bus for player system to handle
    // Only forward if this is not the local player (local player already handled the hit)
    const localPlayerId = localStorage.getItem('playerId');
    
    // We still emit the event for the local player if they were hit by another player
    // This ensures the life count is synchronized properly
    if (data.playerId !== localPlayerId || data.attackerId !== localPlayerId) {
      console.log(`Forwarding remote player hit event: Player ${data.playerId} hit by ${data.attackerId}`);
      eventBus.emit('player:hit', {
        playerId: data.playerId,
        attackerId: data.attackerId
      });
    }
  });
  
  // Player joined event
  eventBus.on('player:joined', (data: { id: string, nickname: string }) => {
    // Add system message
    addSystemMessage(`${data.nickname} joined the game`);
    
    // Add player to game
    eventBus.emit('player:add', {
      id: data.id,
      nickname: data.nickname
    });
  });
  
  // Player left event
  eventBus.on('player:left', (data: { id: string, nickname: string }) => {
    // Add system message
    addSystemMessage(`${data.nickname} left the game`);
    
    // Remove player from game
    eventBus.emit('player:remove', {
      id: data.id
    });
  });
  
  // Game state update
  eventBus.on('game:state:updated', (data) => {
    // Update game state
    eventBus.emit('game:state:update', data);
  });
  
  // Game started
  eventBus.on('game:started', (data) => {
    // Add system message
    addSystemMessage('Game started!');
    
    // Start game
    eventBus.emit('game:start', data);
  });
  
  // Game ended - only triggered when the game is truly over (only one player remains)
  eventBus.on('game:ended', (data) => {
    console.log('Game ended event received:', data);
    
    // Add system message
    if (data.winner) {
      addSystemMessage(`Game over! ${data.winner.nickname} wins!`);
      
      // Check if this is the local player who won
      const isLocalPlayerWinner = data.winner.id === playerId;
      
      // Check if this is a special case where a player won by killing the last opponent
      // but was also eliminated in the process (lastManKill)
      const isLastManKill = data.lastManKill === true;
      
      // Show game won message for the winner and game over for others
      // In lastManKill case, we still want to show the winner even if they died too
      showGameResult(data.winner.nickname, isLocalPlayerWinner, data.lastPlayerStanding || isLastManKill);
    } else {
      addSystemMessage('Game over!');
      
      // Show game over message for everyone
      showGameResult(null, false, false);
    }
    
    // End game and trigger game over state
    eventBus.emit('game:end', data);
    eventBus.emit('game:over', data);
  });
  
  // Handle remote player elimination (from server)
  eventBus.on('remote:player:eliminated', (data) => {
    console.log('Remote player elimination event received from server:', data);
    
    // Forward to player:eliminated to ensure the player is removed from all clients
    // This is especially important for self-elimination cases
    eventBus.emit('player:eliminated', {
      id: data.playerId,
      eliminatedBy: data.attackerId
    });
    
    // No need to show UI here as the server will send game:ended
    // when the game is truly over (only one player remains)
  });
  
  // Function to show game result (win/lose) with appropriate UI using Egyptian theme consistently
  function showGameResult(winnerNickname: string | null, isLocalPlayerWinner: boolean, lastPlayerStanding: boolean): void {
    // Create overlay for game result with Egyptian styling
    const overlay = document.createElement('div');
    overlay.className = 'game-result-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      animation: fade-in 0.5s ease;
      background-image: url('/img/egypt-background.jpg');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `;
    
    // Create message box with Egyptian styling
    const messageBox = document.createElement('div');
    messageBox.className = 'game-over';
    messageBox.style.cssText = `
      background-color: rgba(74, 66, 51, 0.9);
      border: 5px solid #d4af37;
      border-radius: 5px;
      padding: 40px 60px;
      text-align: center;
      max-width: 80%;
      box-shadow: 0 0 30px rgba(212, 175, 55, 0.5);
      position: relative;
    `;
    
    // Add top decoration (Egyptian style)
    const topDecoration = document.createElement('div');
    topDecoration.style.cssText = `
      position: absolute;
      top: 10px;
      left: 0;
      width: 100%;
      text-align: center;
      font-size: 24px;
      color: #d4af37;
    `;
    topDecoration.innerHTML = '&#9778; &#9779; &#9780; &#9781;';
    messageBox.appendChild(topDecoration);
    
    // Add bottom decoration (Egyptian style)
    const bottomDecoration = document.createElement('div');
    bottomDecoration.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 0;
      width: 100%;
      text-align: center;
      font-size: 24px;
      color: #d4af37;
    `;
    bottomDecoration.innerHTML = '&#9779; &#8753; &#8752; &#9779;';
    messageBox.appendChild(bottomDecoration);
    
    // Create message with Egyptian styling
    const message = document.createElement('h1');
    
    if (isLocalPlayerWinner) {
      // Local player won
      message.textContent = lastPlayerStanding ? 
        'YOU WON! LAST PLAYER STANDING!' : 
        'YOU WON THE GAME!';
      message.style.color = '#d4af37'; // Egyptian gold for winner
    } else if (winnerNickname) {
      // Someone else won
      message.textContent = `GAME OVER! ${winnerNickname} WINS!`;
      message.style.color = '#d4af37'; // Egyptian gold for consistency
    } else {
      // No winner (draw)
      message.textContent = 'GAME OVER! NO WINNER!';
      message.style.color = '#d4af37'; // Egyptian gold for consistency
    }
    
    message.style.cssText = `
      font-size: 42px;
      margin: 0 0 20px 0;
      text-shadow: 0 0 10px rgba(245, 231, 193, 0.5);
      font-family: 'Papyrus', 'Copperplate', fantasy;
      text-transform: uppercase;
      letter-spacing: 2px;
      animation: pulse 1.5s infinite alternate;
      color: #d4af37;
    `;
    messageBox.appendChild(message);
    
    // Create hieroglyphic decoration
    const hieroglyphics = document.createElement('div');
    hieroglyphics.style.cssText = `
      font-size: 24px;
      color: #d4af37;
      margin: 15px 0;
    `;
    hieroglyphics.innerHTML = '&#x1330C; &#x13171; &#x131CB; &#x133BC; &#x1337F; &#x1344F;';
    messageBox.appendChild(hieroglyphics);
    
    // Create back to menu button with Egyptian styling
    const backToMenuButton = document.createElement('button');
    backToMenuButton.textContent = 'Back to Menu';
    backToMenuButton.style.cssText = `
      background-color: #d4af37;
      color: #4a4233;
      border: 2px solid #e4c49b;
      padding: 15px 30px;
      font-size: 18px;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 20px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      font-family: 'Papyrus', 'Copperplate', fantasy;
    `;
    
    backToMenuButton.addEventListener('mouseover', () => {
      backToMenuButton.style.transform = 'scale(1.05)';
      backToMenuButton.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
    });
    
    backToMenuButton.addEventListener('mouseout', () => {
      backToMenuButton.style.transform = 'scale(1)';
      backToMenuButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    });
    
    backToMenuButton.addEventListener('click', () => {
      // Remove overlay
      document.body.removeChild(overlay);
      
      // Don't send end_game event to server as the game is already over
      // This prevents changing the winner message for other players
      
      // Just clean up local state
      eventBus.emit('game:cleanup', {});
      
      // Clear any stored player ID to ensure a fresh start
      localStorage.removeItem('playerId');
      localStorage.removeItem('playerNickname');
      
      // Disconnect from the server but don't send end_game event
      // Just close the connection locally
      if (isConnectedToServer()) {
        const socket = getSocket();
        if (socket) {
          socket.disconnect();
        }
      }
      
      // Set connected state to false
      isConnected = false;
      playerId = null;
      
      // Redirect to the start page (nickname entry)
      window.location.href = '/';
      window.location.reload(); // Force a full page reload to clear any lingering state
    });
    
    messageBox.appendChild(backToMenuButton);
    
    // Add message box to overlay
    overlay.appendChild(messageBox);
    
    // Add animations if not already added
    if (!document.getElementById('game-result-animations')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'game-result-animations';
      styleEl.textContent = `
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          100% { transform: scale(1.05); }
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // Add overlay to body
    document.body.appendChild(overlay);
  }
  
  // Socket connection events
  eventBus.on('socket:disconnected', () => {
    isConnected = false;
    addSystemMessage('Disconnected from server. Attempting to reconnect...');
  });
  
  eventBus.on('socket:connected', () => {
    isConnected = true;
    playerId = getSocketId();
    addSystemMessage('Reconnected to server');
  });
  
  eventBus.on('socket:error', (data) => {
    addSystemMessage(`Connection error: ${data.error}`);
  });
}

/**
 * Send player movement to server
 * @param x X coordinate
 * @param y Y coordinate
 * @param direction Movement direction
 */
function sendPlayerMove(x: number, y: number, direction: Direction = Direction.NONE): void {
  if (!isConnected) return;
  
  const moveData: MoveEventData = {
    playerId: playerId || '',
    x,
    y,
    direction
  };
  
  sendToServer(EVENTS.MOVE, moveData);
}

/**
 * Send bomb placement to server
 * @param x X coordinate
 * @param y Y coordinate
 * @param range Explosion range
 */
function sendBombPlaced(x: number, y: number, range: number): void {
  if (!isConnected) return;
  
  const bombData: DropBombEventData = {
    playerId: playerId || '',
    x,
    y,
    explosionRange: range
  };
  
  sendToServer(EVENTS.DROP_BOMB, bombData);
}

/**
 * Send powerup collection to server
 * @param type Powerup type
 * @param x X coordinate
 * @param y Y coordinate
 */
function sendPowerupCollected(type: string, x: number, y: number): void {
  if (!isConnected) return;
  
  const powerupData: CollectPowerupEventData = {
    playerId: playerId || '',
    powerupId: `powerup_${Date.now()}`,
    powerupType: type,
    x,
    y
  };
  
  sendToServer(EVENTS.COLLECT_POWERUP, powerupData);
}

/**
 * Disconnect from multiplayer
 */
function disconnectMultiplayer(): void {
  disconnectFromServer();
  isConnected = false;
  playerId = null;
  
  // Add system message
  addSystemMessage('Disconnected from game server');
}

/**
 * Check if connected to multiplayer
 * @returns Connection status
 */
export function isMultiplayerConnected(): boolean {
  return isConnected;
}

/**
 * Get current player ID
 * @returns Player ID if connected, null otherwise
 */
export function getPlayerId(): string | null {
  return playerId;
}

/**
 * Send end game event to the server
 */
export function endCurrentGame(): void {
  if (!isConnected) return;
  
  console.log('Sending end game request to server');
  sendToServer(EVENTS.END_GAME, {});
}
