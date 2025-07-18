// Game initialization logic
import { generateMap, resetMap } from './map';
import { initRenderer, renderMap, getMapContainer } from './renderer';
import { eventBus } from '../../framework/events';
import { h, render } from '../../framework/dom';
import { clearPowerUps, PowerUp, PowerUpType, getActivePowerUps } from './powerups';
import { init as initHUD, resetPowerUps } from '../ui/hud';
import { initLobby, playerStore } from './lobby';
import { Player } from '../entities/player';
import { PlayerController } from './PlayerController';
import { PlayerRenderer } from './PlayerRenderer';
import { BombSystem } from './BombSystem';
import { BombManager } from './BombManager';
import { BombController } from './BombController';
// import { addTestPlayer } from './test-player';
import { PLAYER_STARTING_POSITIONS } from './map';
import { TILE_SIZE } from './constants';

// Store player instances globally for access by event handlers
declare global {
  interface Window {
    playerInstances: Player[];
  }
}

// Map data storage
let currentMapData: any = null;

// Initialize player instances array
window.playerInstances = window.playerInstances || [];

// Function to create player directly with framework's h and render functions
function createPlayerDirectly(container: HTMLElement, id: string, nickname: string, x: number, y: number): void {
  console.log(`Creating player with framework: ${nickname} at ${x},${y}`);
  
  // Determine player number based on existing players
  const existingPlayers = document.querySelectorAll('.player').length;
  const playerNumber = existingPlayers + 1;
  
  // Player character images based on player number
  const playerImages = [
    '/img/IK.png',  // Player 1
    '/img/MMD.png', // Player 2
    '/img/WA.png',  // Player 3
    '/img/MG.png'   // Player 4
  ];
  const imageIndex = (playerNumber - 1) % playerImages.length;
  const playerImage = playerImages[imageIndex];
  
  // Create name tag content
  const nameTagText = id === localStorage.getItem('playerId') ? `${nickname} (You)` : nickname;
  
  // Create name tag using h function
  const nameTagVNode = h('div', {
    style: `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 12px;
      white-space: nowrap;
    `
  }, [nameTagText]);
  
  // Create player element using h function
  const playerVNode = h('div', {
    class: 'player',
    id: `player-${id}`,
    style: `
      position: absolute;
      left: ${x * TILE_SIZE}px;
      top: ${y * TILE_SIZE}px;
      width: ${TILE_SIZE}px;
      height: ${TILE_SIZE}px;
      background-image: url(${playerImage});
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      background-color: transparent;
      z-index: 1000;
      box-sizing: border-box;
    `
  }, [nameTagVNode]);
  
  // Render the player element
  const renderedPlayer = render(playerVNode) as HTMLElement;
  
  // Add to container
  container.appendChild(renderedPlayer);
  console.log(`Player element added to container`);
}

// Initialize the game
export function initGame() {
  const app = document.getElementById('app');
  if (!app) return;
  
  // Clear any existing content to prevent old styles from appearing
  app.innerHTML = '';
  
  // Apply base styles to ensure consistent appearance
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.width = '100vw';
  document.body.style.height = '100vh';
  document.body.style.backgroundColor = '#1a1a1a';
  
  // Make container full-page
  app.style.width = '100vw';
  app.style.height = '100vh';
  app.style.position = 'relative';
  app.style.overflow = 'hidden';
  app.style.backgroundColor = '#1a1a1a';
  
  // Skip the old lobby initialization - we'll handle this in main.ts directly
  // This prevents the brief flash of the old lobby
  
  // Create a controls container (will be hidden initially)
  const controlsContainer = document.createElement('div');
  controlsContainer.id = 'game-controls';
  controlsContainer.style.margin = '10px';
  controlsContainer.style.textAlign = 'center';
  controlsContainer.style.display = 'none'; // Hide initially
  document.body.insertBefore(controlsContainer, app.nextSibling);
  
  // Create a button to generate the map
  const generateButton = document.createElement('button');
  generateButton.textContent = 'Generate Map';
  generateButton.style.margin = '10px';
  generateButton.style.padding = '8px 16px';
  generateButton.style.backgroundColor = '#4CAF50';
  generateButton.style.color = 'white';
  generateButton.style.border = 'none';
  generateButton.style.borderRadius = '4px';
  generateButton.style.cursor = 'pointer';
  generateButton.addEventListener('click', () => {
    startGame(app);
  });
  
  // Create an End Game button
  const endGameButton = document.createElement('button');
  endGameButton.textContent = 'End Game';
  endGameButton.style.margin = '10px';
  endGameButton.style.padding = '8px 16px';
  endGameButton.style.backgroundColor = '#f44336';
  endGameButton.style.color = 'white';
  endGameButton.style.border = 'none';
  endGameButton.style.borderRadius = '4px';
  endGameButton.style.cursor = 'pointer';
  endGameButton.addEventListener('click', () => {
    endGame();
  });
  
  // Create a reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Map';
  resetButton.style.margin = '10px';
  resetButton.style.padding = '8px 16px';
  resetButton.style.backgroundColor = '#f44336';
  resetButton.style.color = 'white';
  resetButton.style.border = 'none';
  resetButton.style.borderRadius = '4px';
  resetButton.style.cursor = 'pointer';
  resetButton.addEventListener('click', () => {
    resetGame(app);
  });
  
  // Add buttons to controls container
  controlsContainer.appendChild(generateButton);
  controlsContainer.appendChild(endGameButton);
  controlsContainer.appendChild(resetButton);
  
  // Listen for game start event (will be triggered by the lobby system)
  eventBus.on('game:start', (data) => {
    // Show controls when game starts
    if (controlsContainer) {
      controlsContainer.style.display = 'flex';
    }
    // Pass the game data to startGame to use the map seed
    startGame(app, data);
  });
  
  // Listen for game reset event
  eventBus.on('game:reset', () => {
    resetGame(app);
  });
  
  // Listen for player respawn event
  eventBus.on('player:respawn', (data: any) => {
    console.log('Respawning player:', data);
    
    // Get map container
    const mapContainerElement = getMapContainer();
    if (!mapContainerElement) {
      console.error('Cannot respawn player: Map container not found');
      return;
    }
    
    // Create player at starting position with full lives
    try {
      const player = new Player(
        data.id,
        data.nickname,
        data.x,
        data.y,
        mapContainerElement
      );
      console.log(`Respawned player ${player.nickname} with full lives`);
    } catch (error) {
      console.error(`Error respawning player ${data.nickname}:`, error);
      
      // Fallback to direct DOM creation if Player class fails
      createPlayerDirectly(mapContainerElement, data.id, data.nickname, data.x, data.y);
    }
  });
  
  // Listen for player disconnection/removal
  eventBus.on('player:remove', (data) => {
    console.log(`Removing player from game: ${data.id}`);
    
    // Find all player elements with this ID and remove them
    const playerElements = document.querySelectorAll(`.player-container[data-player-id="${data.id}"]`);
    playerElements.forEach(element => {
      // Add a fade-out effect before removing
      element.classList.add('player-disconnected');
      
      // Remove after animation completes
      setTimeout(() => {
        element.remove();
      }, 800);
    });
    
    // Also try direct ID-based removal as fallback
    const directPlayerElement = document.getElementById(`player-${data.id}`);
    if (directPlayerElement) {
      directPlayerElement.classList.add('player-disconnected');
      setTimeout(() => {
        directPlayerElement.remove();
      }, 800);
    }
  });
  
  // Create a style element for game-specific styles
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    /* Player disconnection animation */
    .player-disconnected {
      animation: player-disconnect 0.8s forwards;
    }
    
    @keyframes player-disconnect {
      0% {
        transform: translate(-50%, -50%);
        opacity: 1;
      }
      50% {
        transform: translate(-50%, -100%);
        opacity: 0.5;
      }
      100% {
        transform: translate(-50%, -150%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(styleElement);
}

// Start a new game
function startGame(container: HTMLElement, gameData?: any) {
  // Clear main container
  container.innerHTML = '';
  
  // Set full page styles for game container
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.width = '100vw';
  document.body.style.height = '100vh';
  document.body.style.backgroundColor = '#222';
  
  // Make container full-page
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  
  // Initialize renderer first
  initRenderer(container);
  
  // Get player data from the store
  const { players } = playerStore.getState();
  
  // Get the socket ID from the socket connection
  const socketId = localStorage.getItem('socketId');
  console.log(`Current socket ID: ${socketId}`);
  
  // Find the player that matches the socket ID
  const localPlayer = players.find(player => player.id === socketId);
  
  // If we found a matching player, use that as the local player
  if (localPlayer) {
    localStorage.setItem('playerId', localPlayer.id);
    console.log(`Setting local player ID to match socket: ${localPlayer.id}`);
  } else if (players.length > 0) {
    // Fallback: use the first player if no match found
    localStorage.setItem('playerId', players[0].id);
    console.log(`No matching player found, using first player: ${players[0].id}`);
  } else {
    console.error('No players available!');
  }
  
  // Get the current player based on the socket ID
  const currentPlayer = localPlayer || (players.length > 0 ? players[0] : null);
  
  // Double-check that the player ID is set correctly
  if (currentPlayer) {
    // Store the player ID in localStorage
    localStorage.setItem('playerId', currentPlayer.id);
    console.log(`Confirmed player ID in localStorage: ${currentPlayer.id}`);
    
    // Also store in session storage as a backup
    sessionStorage.setItem('playerId', currentPlayer.id);
    console.log(`Also stored in sessionStorage: ${currentPlayer.id}`);
    
    // Store the player number
    if (currentPlayer.playerNumber) {
      localStorage.setItem('playerNumber', currentPlayer.playerNumber.toString());
      console.log(`Stored player number: ${currentPlayer.playerNumber}`);
    }
  } else {
    console.error('No current player found!');
  }
  
  // Create a controls container that won't be cleared
  let controlsContainer = document.getElementById('game-controls');
  if (!controlsContainer) {
    controlsContainer = document.createElement('div');
    controlsContainer.id = 'game-controls';
    controlsContainer.style.position = 'fixed';
    controlsContainer.style.top = '20px';
    controlsContainer.style.right = '20px';
    controlsContainer.style.zIndex = '1000';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.gap = '10px';
    document.body.appendChild(controlsContainer);
  } else {
    // Clear existing controls
    controlsContainer.innerHTML = '';
  }
  
  // Create the reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Map';
  resetButton.style.padding = '10px 20px';
  resetButton.style.backgroundColor = '#f44336';
  resetButton.style.color = 'white';
  resetButton.style.border = 'none';
  resetButton.style.borderRadius = '4px';
  resetButton.style.cursor = 'pointer';
  resetButton.style.fontWeight = 'bold';
  resetButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
  resetButton.style.transition = 'all 0.2s ease';
  resetButton.addEventListener('mouseover', () => {
    resetButton.style.backgroundColor = '#d32f2f';
    resetButton.style.transform = 'translateY(-2px)';
    resetButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
  });
  resetButton.addEventListener('mouseout', () => {
    resetButton.style.backgroundColor = '#f44336';
    resetButton.style.transform = 'translateY(0)';
    resetButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
  });
  resetButton.addEventListener('click', () => {
    resetGame(container);
  });
  
  // Add button to the controls container
  controlsContainer.appendChild(resetButton);
  
  // Create player info display
  const playerInfo = document.createElement('div');
  playerInfo.id = 'player-info';
  playerInfo.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background-color: rgba(126, 112, 83, 0.9);
    color: #f5e7c1;
    padding: 12px 15px;
    border-radius: 8px;
    font-family: 'Papyrus', 'Copperplate', fantasy;
    z-index: 100;
    border: 2px solid #d4af37;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
    min-width: 180px;
    text-align: center;
  `;
  
  if (currentPlayer) {
    const playerNumber = currentPlayer.playerNumber || 1;
    const playerTitle = playerNumber === 1 ? 'Pharaoh' : 
                        playerNumber === 2 ? 'Mummy' : 
                        playerNumber === 3 ? 'Anubis' : 'Sphinx';
    
    playerInfo.innerHTML = `
      <div style="margin-bottom: 8px; font-weight: bold; font-size: 16px; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);">
        You: ${currentPlayer.nickname} (${playerTitle})
      </div>
      <div style="width: 24px; height: 24px; background-color: ${currentPlayer.color}; border-radius: 50%; display: inline-block; border: 2px solid #d4af37;"></div>
    `;
  }
  
  document.body.appendChild(playerInfo);
  
  // Initialize game HUD
  initHUD();
  
  // Initialize powerup system with websocket support
  import('./powerups').then(powerupModule => {
    if (powerupModule.initPowerupSystem) {
      powerupModule.initPowerupSystem();
      console.log('Powerup system initialized with websocket support');
    } else {
      console.error('initPowerupSystem function not found in powerups module');
    }
  }).catch(error => {
    console.error('Failed to initialize powerup system:', error);
  });
  
  // Generate map with seed from server if available
  if (gameData && gameData.mapSeed) {
    console.log(`Using server-provided map seed: ${gameData.mapSeed}`);
    currentMapData = generateMap(gameData.mapSeed);
  } else {
    console.log('No map seed provided, generating random map');
    currentMapData = generateMap();
  }
  
  // Initialize bomb system and player mechanics
  const mapContainer = getMapContainer();
  if (!mapContainer) return;
  
  // Create a bomb system with the map container and grid size
  const bombSystem = new BombSystem(mapContainer, currentMapData.grid.length);
  
  // Get the bomb manager from the bomb system
  const bombManager = bombSystem.getBombManager();
  
  // Start the bomb system
  bombSystem.start();
  
  // Update the bomb system with the current grid
  bombSystem.updateGrid(currentMapData.grid);
  
  // Create real players instead of test player
  console.log('Attempting to create players...');
  console.log('Map container:', mapContainer);
  console.log('Current player:', currentPlayer);
  console.log('All players:', players);
  console.log('Starting positions:', PLAYER_STARTING_POSITIONS);
  
  // Ensure map container exists
  let mapContainerElement = mapContainer;
  if (!mapContainerElement) {
    console.error('Map container is missing! Creating it...');
    const gameArea = document.getElementById('game-area');
    if (gameArea) {
      mapContainerElement = document.createElement('div');
      mapContainerElement.id = 'map-container';
      mapContainerElement.style.position = 'relative';
      mapContainerElement.style.width = `${currentMapData.width * TILE_SIZE}px`;
      mapContainerElement.style.height = `${currentMapData.height * TILE_SIZE}px`;
      gameArea.appendChild(mapContainerElement);
      console.log('Created map container:', mapContainerElement);
    } else {
      console.error('Game area not found! Cannot create map container.');
    }
  }
  
  if (mapContainerElement) {
    // First, create all players using direct DOM approach for reliability
    players.forEach((playerData, index) => {
      // Get player number from player data or use index+1 as fallback
      const playerNumber = playerData.playerNumber || index + 1;
      
      // Check if this is the local player by comparing socket ID
      const isLocalPlayer = playerData.id === localStorage.getItem('playerId');
      
      // If this is the local player, store the player number
      if (isLocalPlayer) {
        localStorage.setItem('playerNumber', playerNumber.toString());
        console.log(`Setting local player number to ${playerNumber}`);
      }
      
      // Use the player's assigned position based on player number
      const posIndex = (playerNumber - 1) % PLAYER_STARTING_POSITIONS.length;
      const pos = PLAYER_STARTING_POSITIONS[posIndex];
      
      console.log(`Creating ${isLocalPlayer ? 'local' : 'remote'} player: ${playerData.nickname} (Player ${playerNumber}) at position: ${pos.x},${pos.y}`);
      
      // Create with direct DOM first to ensure visibility
      createPlayerDirectly(mapContainerElement, playerData.id, playerData.nickname, pos.x, pos.y);
      
      // Then try with Player class for full functionality
      try {
        const player = new Player(
          playerData.id,
          playerData.nickname,
          pos.x,
          pos.y,
          mapContainerElement,
          playerNumber
        );
        console.log(`Created player instance: ${player.nickname} (Player ${playerNumber})`);
        
        // Store player instance in global array for later access
        window.playerInstances.push(player);
      } catch (error) {
        console.error(`Error creating player ${playerData.nickname} with Player class:`, error);
      }
    });
    
    // Verify players are in the DOM after a short delay
    setTimeout(() => {
      const playerElements = document.querySelectorAll('.player');
      console.log(`Found ${playerElements.length} player elements in the DOM`);
      
      if (playerElements.length === 0) {
        console.error('No player elements found in the DOM after creation!');
        
        // Last resort: create a test player directly
        if (currentPlayer) {
          console.log('Creating test player as last resort...');
          createPlayerDirectly(mapContainer, 'test-player', 'Test Player', 1, 1);
        }
      }
    }, 1000);
  } else {
    console.error('Cannot create players: map container is still missing');
  }
  
  // Render map first
  renderMap(currentMapData);
  
  // Emit map ready event with player data
  eventBus.emit('map:ready', { 
    mapData: currentMapData,
    players,
    currentPlayer
  });
  
  // Set up event listeners for remote player movements with enhanced synchronization
  eventBus.on('remote:player:moved', (data) => {
    // Skip if this is the local player's movement
    if (data.playerId === localStorage.getItem('playerId')) {
      return;
    }
    
    // Find the player instance in the global array
    const playerInstance = window.playerInstances?.find(p => p.id === data.playerId);
    
    if (playerInstance) {
      // Use the player's handleRemoteMovement method for proper interpolation
      playerInstance.handleRemoteMovement(data);
    } else {
      // Fallback to direct DOM manipulation if player instance not found
      const playerElement = document.getElementById(`player-${data.playerId}`);
      if (!playerElement) {
        console.error(`Player element not found for ID: ${data.playerId}`);
        return;
      }
      
      // Apply smooth transition for remote player movement
      if (!playerElement.style.transition || playerElement.style.transition === '') {
        playerElement.style.transition = 'left 0.1s linear, top 0.1s linear';
      }
      
      // Update player position with high precision
      playerElement.style.left = `${data.x * TILE_SIZE}px`;
      playerElement.style.top = `${data.y * TILE_SIZE}px`;
      
      console.log(`Updated remote player ${data.playerId} position to ${data.x},${data.y}`);
    }
  });
  
  // Handle remote bomb placements
  eventBus.on('remote:bomb:dropped', (data) => {
    console.log('Remote bomb placement:', data);
    
    // We no longer skip local player bombs to ensure they're visible on all screens
    // Instead, we'll create the bomb DOM element for all bombs received from the server
    
    // Get map container
    const mapContainer = getMapContainer();
    if (!mapContainer) {
      console.error('Map container not found for remote bomb placement');
      return;
    }
    
    // Ensure we have both x and y coordinates
    if (data.x === undefined || data.y === undefined) {
      console.error('Missing coordinates for bomb placement:', data);
      return;
    }
    
    // Create bomb element
    const bomb = document.createElement('div');
    bomb.className = 'bomb';
    bomb.id = data.bombId || `bomb_${Date.now()}`;
    bomb.style.cssText = `
      position: absolute;
      left: ${data.x * TILE_SIZE}px;
      top: ${data.y * TILE_SIZE}px;
      width: ${TILE_SIZE}px;
      height: ${TILE_SIZE}px;
      background-color: black;
      border-radius: 50%;
      z-index: 800;
      animation: bomb-pulse 0.5s infinite alternate;
      border: 2px solid white;
      box-sizing: border-box;
    `;
    
    // Debug info
    console.log(`Creating bomb at position: (${data.x}, ${data.y}) with ID: ${bomb.id}`);
    console.log(`Bomb position in pixels: left=${data.x * TILE_SIZE}px, top=${data.y * TILE_SIZE}px`);
    
    // Add a fuse to make the bomb more visible
    const fuse = document.createElement('div');
    fuse.style.cssText = `
      position: absolute;
      top: -5px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 10px;
      background-color: #FF4500;
      z-index: 801;
    `;
    bomb.appendChild(fuse);
    
    // Add bomb to the container
    mapContainer.appendChild(bomb);
    
    console.log(`Created remote bomb at ${data.x},${data.y} with range ${data.explosionRange}`);
    
    // Get the player number from the data (1-based index)
    // The server sends playerId which is the socket ID, but we need the player number (1, 2, 3, 4)
    const ownerId = data.ownerId || data.playerId;
    console.log(`Bomb owner ID: ${ownerId}`);
    
    // Find all players in the game
    const allPlayers = document.querySelectorAll('.player');
    console.log(`Found ${allPlayers.length} player elements`);
    
    // Log all player elements and their positions for debugging
    allPlayers.forEach((el, index) => {
      const style = window.getComputedStyle(el as HTMLElement);
      const left = parseInt(style.left, 10) || 0;
      const top = parseInt(style.top, 10) || 0;
      console.log(`Player ${index}: id=${el.id}, position=(${left/TILE_SIZE}, ${top/TILE_SIZE})`);
    });
    
    // Default to bomb position (fallback)
    let playerX = data.x;
    let playerY = data.y;
    let playerFound = false;
    
    // Try to find the player by ID first
    let playerElement = document.getElementById(`player-${ownerId}`);
    
    if (playerElement) {
      // Get position from style (player elements use style.left and style.top)
      const style = window.getComputedStyle(playerElement);
      const left = parseInt(style.left, 10) || 0;
      const top = parseInt(style.top, 10) || 0;
      
      // Convert from pixels to grid coordinates
      playerX = left / TILE_SIZE;
      playerY = top / TILE_SIZE;
      playerFound = true;
      console.log(`Found player element by ID at position: (${playerX}, ${playerY})`);
    } 
    // If not found by ID, try to find by player number or position in the DOM
    else {
      // Get the player number from localStorage
      const localPlayerId = localStorage.getItem('playerId');
      const localPlayerNumber = parseInt(localStorage.getItem('playerNumber') || '1');
      
      // Get all player elements as an array for easier processing
      const playerElements = Array.from(allPlayers) as HTMLElement[];
      
      // Sort players by distance to the bomb position
      // This helps ensure we get the most likely player who placed the bomb
      const sortedPlayers = playerElements.sort((a, b) => {
        const aStyle = window.getComputedStyle(a);
        const bStyle = window.getComputedStyle(b);
        
        const aLeft = parseInt(aStyle.left, 10) / TILE_SIZE || 0;
        const aTop = parseInt(aStyle.top, 10) / TILE_SIZE || 0;
        const bLeft = parseInt(bStyle.left, 10) / TILE_SIZE || 0;
        const bTop = parseInt(bStyle.top, 10) / TILE_SIZE || 0;
        
        const aDistance = Math.sqrt(Math.pow(aLeft - data.x, 2) + Math.pow(aTop - data.y, 2));
        const bDistance = Math.sqrt(Math.pow(bLeft - data.x, 2) + Math.pow(bTop - data.y, 2));
        
        return aDistance - bDistance;
      });
      
      // If this is our own bomb, use our own player's position
      if (ownerId === localPlayerId) {
        // Find our player element
        const ourPlayer = document.querySelector(`.player[id$="${localPlayerId}"]`) as HTMLElement;
        if (ourPlayer) {
          const style = window.getComputedStyle(ourPlayer);
          const left = parseInt(style.left, 10) || 0;
          const top = parseInt(style.top, 10) || 0;
          playerX = left / TILE_SIZE;
          playerY = top / TILE_SIZE;
          playerFound = true;
          console.log(`Using local player position: (${playerX}, ${playerY})`);
        }
      } 
      // Otherwise, use the closest player to the bomb position
      else if (sortedPlayers.length > 0) {
        const closestPlayer = sortedPlayers[0];
        const style = window.getComputedStyle(closestPlayer);
        const left = parseInt(style.left, 10) || 0;
        const top = parseInt(style.top, 10) || 0;
        playerX = left / TILE_SIZE;
        playerY = top / TILE_SIZE;
        playerFound = true;
        console.log(`Using closest player to bomb: ${closestPlayer.id} at position (${playerX}, ${playerY})`);
      }
    }
    
    if (!playerFound) {
      console.warn(`No player element found for bomb animation, using bomb position: (${playerX}, ${playerY})`);
    }
    
    // Emit the bomb:thrown event to trigger animation
    eventBus.emit('bomb:thrown', {
      ownerId: ownerId,
      playerX: playerX,
      playerY: playerY,
      bombX: data.x,
      bombY: data.y,
      bombId: data.bombId
    });
    
    // Remove bomb after 2 seconds (matching server timeout)
    setTimeout(() => {
      bomb.remove();
    }, 2000);
  });
  
  // Handle remote bomb explosions
  eventBus.on('remote:bomb:explode', (data) => {
    console.log('Remote bomb explosion:', data);
    
    // We no longer skip local player bomb explosions to ensure they're visible on all screens
    // This ensures consistent explosion rendering across all clients
    
    // Get map container
    const mapContainer = getMapContainer();
    if (!mapContainer) {
      console.error('Map container not found for remote bomb explosion');
      return;
    }
    
    console.log('Creating remote explosion with data:', data);
    
    // ALWAYS create the explosion directly - this is the most reliable approach
    // Create center explosion
    const centerExplosion = document.createElement('div');
    centerExplosion.className = 'explosion center';
    centerExplosion.style.cssText = `
      position: absolute;
      left: ${data.x * TILE_SIZE}px;
      top: ${data.y * TILE_SIZE}px;
      width: ${TILE_SIZE}px;
      height: ${TILE_SIZE}px;
      background-color: yellow;
      border-radius: 50%;
      z-index: 900;
      animation: explosion 0.5s forwards;
    `;
    mapContainer.appendChild(centerExplosion);
    
    // Remove explosion after animation
    setTimeout(() => {
      centerExplosion.remove();
    }, 500);
    
    // Create explosion in four directions
    const directions = [
      { dx: 0, dy: -1, name: 'up' },    // Up
      { dx: 1, dy: 0, name: 'right' },  // Right
      { dx: 0, dy: 1, name: 'down' },   // Down
      { dx: -1, dy: 0, name: 'left' }   // Left
    ];
    
    // For each direction, create explosion blocks up to the radius
    directions.forEach(dir => {
      for (let i = 1; i <= data.explosionRange; i++) {
        const explosionX = data.x + (dir.dx * i);
        const explosionY = data.y + (dir.dy * i);
        
        // Check if this position is valid for explosion
        if (explosionX % 2 === 0 && explosionY % 2 === 0) {
          break; // Wall at even coordinates
        }
        
        // Can't explode through border walls
        if (explosionX === 0 || explosionY === 0 || explosionX === 14 || explosionY === 14) {
          break;
        }
        
        // Create explosion element
        const explosion = document.createElement('div');
        explosion.className = `explosion ${dir.name}`;
        explosion.style.cssText = `
          position: absolute;
          left: ${explosionX * TILE_SIZE}px;
          top: ${explosionY * TILE_SIZE}px;
          width: ${TILE_SIZE}px;
          height: ${TILE_SIZE}px;
          background-color: orange;
          z-index: 40;
          animation: explosion 0.5s forwards;
        `;
        
        mapContainer.appendChild(explosion);
        
        // Remove explosion after animation
        setTimeout(() => {
          explosion.remove();
        }, 500);
      }
    });
    
    // Ensure explosion styles are added to document
    ensureExplosionStyles();
    
    // We don't need to handle block destruction here
    // Block destruction is handled by the 'remote:block:destroyed' event
  });
  
  // We'll handle power-ups using the local logic only, no remote handler needed
  
  // Handle remote block destruction
  eventBus.on('remote:block:destroyed', (data) => {
    console.log('Remote block destruction:', data);
    
    // Skip if this is the local player's block destruction (it will be handled locally)
    if (data.playerId === localStorage.getItem('playerId')) {
      return;
    }
    
    // Get map container
    const mapContainer = getMapContainer();
    if (!mapContainer) {
      console.error('Map container not found for remote block destruction');
      return;
    }
    
    // Find the block at the specified coordinates
    const blocks = Array.from(document.querySelectorAll('.block')).filter(el => {
      const block = el as HTMLElement;
      const blockX = parseInt(block.style.left) / TILE_SIZE;
      const blockY = parseInt(block.style.top) / TILE_SIZE;
      
      return Math.floor(blockX) === data.x && Math.floor(blockY) === data.y;
    });
    
    if (blocks.length > 0) {
      // Process each block at this position
      blocks.forEach(block => {
        const blockEl = block as HTMLElement;
        
        // Animate block destruction
        blockEl.style.animation = 'block-destroy 0.5s forwards';
        
        // Create a green space where the block was
        const greenSpace = document.createElement('div');
        greenSpace.className = 'green-space';
        greenSpace.style.position = 'absolute';
        greenSpace.style.left = blockEl.style.left;
        greenSpace.style.top = blockEl.style.top;
        greenSpace.style.width = `${TILE_SIZE}px`;
        greenSpace.style.height = `${TILE_SIZE}px`;
        greenSpace.style.backgroundColor = '#7ABD7E'; // Green color
        greenSpace.style.zIndex = '5'; // Below player but above background
        
        // // Add green space to the game container
        // if (mapContainer) {
        //   mapContainer.appendChild(greenSpace);
        // }
        
        // Remove block after animation
        setTimeout(() => {
          blockEl.remove();
        }, 500);
      });
    } else {
      console.warn(`No block found at remote destruction coordinates: ${data.x},${data.y}`);
    }
  });
  
  // Ensure explosion styles are added to the document
  function ensureExplosionStyles(): void {
    if (!document.getElementById('explosion-animations')) {
      const style = document.createElement('style');
      style.id = 'explosion-animations';
      style.textContent = `
        @keyframes explosion {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        
        @keyframes block-destroy {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(0); opacity: 0; }
        }
        
        
        
        .explosion {
          pointer-events: none;
        }
        
        
      `;
      document.head.appendChild(style);
    }
  }
  
  console.log('Map generated successfully');
}

// Reset the game
function resetGame(container: HTMLElement) {
  // Clear power-ups
  clearPowerUps();
  
  // Reset power-up HUD
  resetPowerUps();
  
  // Reset map
  currentMapData = resetMap();
  
  // Re-render map
  renderMap(currentMapData);
  
  // Remove all existing players and bombs
  const gameContainer = getMapContainer();
  if (gameContainer) {
    // Remove all players
    const players = gameContainer.querySelectorAll('.player');
    players.forEach(player => player.remove());
    
    // Remove all bombs
    const bombs = gameContainer.querySelectorAll('.bomb');
    bombs.forEach(bomb => bomb.remove());
    
    // Remove all explosions
    const explosions = gameContainer.querySelectorAll('.explosion');
    explosions.forEach(explosion => explosion.remove());
  }
  
  // Respawn players at starting positions
  const playerId = localStorage.getItem('playerId');
  if (playerId) {
    const nickname = localStorage.getItem('playerNickname') || 'Player';
    
    // Emit player respawn event
    eventBus.emit('player:respawn', {
      id: playerId,
      nickname: nickname,
      x: 1, // Starting position
      y: 1,
      lives: 3 // Reset lives to 3
    });
  }
  
  // Emit map reset event
  eventBus.emit('map:reset', { mapData: currentMapData });
  
  console.log('Game reset complete');
}

// Get current map data
export function getCurrentMapData() {
  return currentMapData;
}

import { endCurrentGame } from '../main';

// End the current game and return to lobby
export function endGame() {
  console.log('Ending game...');
  
  // Send end game event to the server
  endCurrentGame();
  
  // Emit end game event to event bus
  eventBus.emit('game:end', {});
  
  // Reset the game state
  resetGame(document.getElementById('app') as HTMLElement);
  
  // Reset player store state
  playerStore.setState({
    gameState: 'login',
    players: [],
    lobbyData: null
  });
  
  // Show the lobby again
  const app = document.getElementById('app');
  if (app) {
    initLobby(app);
  }
  
  // Hide controls
  const controlsContainer = document.getElementById('game-controls');
  if (controlsContainer) {
    controlsContainer.style.display = 'none';
  }
}
