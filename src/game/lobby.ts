// Lobby system for player login and waiting room
import { eventBus } from '../../framework/events';
import { h, render } from '../../framework/dom';
import { Store } from '../../framework/state';
import { sendToServer, isConnectedToServer, getSocket } from '../multiplayer/socket';
import { EVENTS, LobbyData, PlayerData } from '../multiplayer/events';
import { getPlayerId } from '../main';
import { initChatUI } from '../ui/chatUI';

// Player state store
export const playerStore = new Store({
  players: [] as PlayerData[],
  currentPlayer: null as PlayerData | null,
  gameState: 'login' as 'login' | 'waiting' | 'countdown' | 'playing',
  lobbyData: null as LobbyData | null,
  maxPlayers: 4
});

// Available player colors
const PLAYER_COLORS = [
  '#f44336', // Red
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#FFC107'  // Yellow
];

// Timer variables
let lobbyTimerInterval: number | null = null;
let countdownTimerInterval: number | null = null;

// Store the current countdown value globally
let currentCountdown: number | null = null;

// Set up the game countdown event listener
eventBus.on('game:countdown', (data: { seconds: number }) => {
  console.log('Game countdown update received:', data);
  
  // Store the current countdown value
  currentCountdown = data.seconds;
  
  // Update all countdown elements on the page
  updateAllCountdownElements();
});

// Function to update all countdown elements with the current value
function updateAllCountdownElements() {
  if (currentCountdown === null) return;
  
  // Find all countdown elements
  const countdownElements = document.querySelectorAll('.game-countdown, #game-countdown');
  
  // If no elements found and we have a countdown, create a global floating one
  if (countdownElements.length === 0 && currentCountdown !== null) {
    createGlobalCountdownElement();
    return;
  }
  
  // Update all found elements
  countdownElements.forEach(element => {
    if (element instanceof HTMLElement) {
      updateCountdownElement(element);
    }
  });
}

// Function to create a global floating countdown element
function createGlobalCountdownElement() {
  // Create a floating countdown element using the framework's h function
  const floatingCountdownVNode = h('div', {
    id: 'floating-countdown',
    class: 'game-countdown',
    style: `
      position: fixed;
      top: 20px;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 2rem;
      font-weight: bold;
      color: #FF5252;
      z-index: 9999;
      background-color: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 5px;
      margin: 0 auto;
      width: fit-content;
    `
  }, []);
  
  // Render and add to the document
  const floatingCountdown = render(floatingCountdownVNode) as HTMLElement;
  document.body.appendChild(floatingCountdown);
  
  // Update the element
  updateCountdownElement(floatingCountdown);
}

// Function to update a single countdown element
function updateCountdownElement(element: HTMLElement) {
  if (currentCountdown === null) return;
  
  // Update the countdown text
  element.textContent = `Game starts in ${currentCountdown} seconds if no more players join`;
  element.style.color = '#FF5252';
  element.style.fontWeight = 'bold';
  
  // Make it more visible with a pulsing animation
  element.style.animation = 'pulse 1s infinite';
  
  // Add the CSS animation if it doesn't exist
  if (!document.getElementById('countdown-animation')) {
    const style = document.createElement('style');
    style.id = 'countdown-animation';
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize the lobby
export function initLobby(container: HTMLElement): void {
  // Render the login screen
  renderLoginScreen(container);
  
  // Listen for lobby updates from server
  eventBus.on('lobby_update', (data: { lobby: LobbyData }) => {
    console.log('Received lobby update:', data);
    
    // Get previous player count
    const previousPlayerCount = playerStore.getState().players.length;
    
    // Update lobby state
    playerStore.setState({
      players: data.lobby.players,
      lobbyData: data.lobby
    });
    
    // Only update the waiting room if we're already in it AND we have players
    // This prevents the brief flash of the empty waiting room
    if (playerStore.getState().gameState === 'waiting' && data.lobby.players.length > 0) {
      renderWaitingRoom(container);
    }
  });
  
  // Listen for game start event
  eventBus.on('game:started', (data) => {
    console.log('Game started:', data);
    
    // Clear any countdown timer
    if (countdownTimerInterval) {
      clearInterval(countdownTimerInterval);
      countdownTimerInterval = null;
    }
    
    // Update game state
    playerStore.setState({
      gameState: 'playing'
    });
    
    // Ensure the chat button is visible during the game
    ensureChatButtonVisible();
    
    // Emit game start event
    eventBus.emit('game:start', data);
  });
  
  // Ensure chat button is visible when needed
  ensureChatButtonVisible();
  
  // Listen for error messages
  eventBus.on('error', (data: { message: string }) => {
    // Show error message
    showErrorMessage(data.message);
  });
}

// Render the login screen
function renderLoginScreen(container: HTMLElement): void {
  // Clear container
  container.innerHTML = '';
  
  // Remove any existing chat buttons or containers
  const existingButton = document.querySelector('.chat-toggle');
  if (existingButton) {
    existingButton.remove();
  }
  
  const existingContainer = document.getElementById('chat-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  // Ensure body has full-page styles
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.width = '100vw';
  document.body.style.height = '100vh';
  document.body.style.backgroundColor = '#1a1a1a';
  
  // Make container full-page
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  
  // Create login container
  const loginContainer = document.createElement('div');
  loginContainer.className = 'login-container';
  loginContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background-image: url('/img/MapBack.png');
    background-size: cover;
    background-position: center;
    color: #f5f5f5;
    font-family: 'Papyrus', 'Copperplate', fantasy;
  `;
  
  // Create title
  const title = document.createElement('h1');
  title.textContent = 'Bomberman';
  title.style.cssText = `
    font-size: 3rem;
    margin-bottom: 2rem;
    color: #d4af37;
    text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    font-family: 'Papyrus', 'Copperplate', fantasy;
  `;
  
  // Create nickname input
  const inputContainer = document.createElement('div');
  inputContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 2rem;
    width: 100%;
    max-width: 400px;
    background-color: rgba(126, 112, 83, 0.8);
    padding: 20px;
    border: 4px solid #d4af37;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  `;
  
  const inputLabel = document.createElement('label');
  inputLabel.textContent = 'Enter your nickname:';
  inputLabel.style.cssText = `
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
    align-self: flex-start;
    color: #d4af37;
    font-family: 'Papyrus', 'Copperplate', fantasy;
    font-weight: bold;
  `;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Nickname';
  input.style.cssText = `
    width: 100%;
    padding: 1rem;
    font-size: 1.2rem;
    border: 2px solid #d4af37;
    border-radius: 4px;
    background-color: rgba(74, 66, 51, 0.9);
    color: #f5f5f5;
    margin-bottom: 1rem;
    font-family: 'Papyrus', 'Copperplate', fantasy;
  `;
  
  // Create join button
  const joinButton = document.createElement('button');
  joinButton.textContent = 'Join Game';
  joinButton.style.cssText = `
    padding: 1rem 2rem;
    font-size: 1.2rem;
    background-color: #d4af37;
    color: #4a4233;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    font-family: 'Papyrus', 'Copperplate', fantasy;
    font-weight: bold;
    transition: all 0.2s;
    box-shadow: 0 3px 5px rgba(0, 0, 0, 0.3);
  `;
  
  joinButton.addEventListener('click', () => {
    const nickname = input.value.trim();
    if (nickname) {
      joinGame(nickname, container);
    } else {
      alert('Please enter a nickname');
    }
  });
  
  // Add enter key support
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const nickname = input.value.trim();
      if (nickname) {
        joinGame(nickname, container);
      } else {
        alert('Please enter a nickname');
      }
    }
  });
  
  // Add elements to the DOM
  inputContainer.appendChild(inputLabel);
  inputContainer.appendChild(input);
  inputContainer.appendChild(joinButton);
  
  loginContainer.appendChild(title);
  loginContainer.appendChild(inputContainer);
  
  container.appendChild(loginContainer);
  
  // Focus the input
  input.focus();
}

// Join the game with a nickname
function joinGame(nickname: string, container: HTMLElement): void {
  // Validate nickname
  if (!nickname || nickname.trim().length < 2) {
    showErrorMessage('Please enter a valid nickname (at least 2 characters)');
    return;
  }
  
  // Trim the nickname
  const trimmedNickname = nickname.trim();
  
  // Create a promise to check if the nickname is available
  const checkNicknameAvailability = new Promise<boolean>((resolve, reject) => {
    // Flag to track if we've already resolved the promise
    let isResolved = false;
    
    // Set up a one-time error handler for nickname validation
    const errorHandler = (data: { message: string }) => {
      if (data.message.includes('nickname is already taken') && !isResolved) {
        // Mark as resolved
        isResolved = true;
        
        // Show the error message
        showErrorMessage(data.message);
        
        // Remove both handlers
        eventBus.off('error', errorHandler);
        eventBus.off('lobby_update', lobbyUpdateHandler);
        
        // Clear the timeout
        if (timeoutId) clearTimeout(timeoutId);
        
        // Resolve the promise as false (nickname not available)
        resolve(false);
      }
    };
    
    // Set up a one-time handler for lobby update (means nickname was accepted)
    const lobbyUpdateHandler = () => {
      if (!isResolved) {
        // Mark as resolved
        isResolved = true;
        
        // Remove both handlers
        eventBus.off('error', errorHandler);
        eventBus.off('lobby_update', lobbyUpdateHandler);
        
        // Clear the timeout
        if (timeoutId) clearTimeout(timeoutId);
        
        // Resolve the promise
        resolve(true);
      }
    };
    
    // Add the handlers
    eventBus.on('error', errorHandler);
    eventBus.on('lobby_update', lobbyUpdateHandler);
    
    // Emit player login event (this will trigger multiplayer initialization)
    eventBus.emit('player:login', { nickname: trimmedNickname });
    
    // Join the lobby via WebSocket
    sendToServer(EVENTS.JOIN_LOBBY, {});
    
    // Set a timeout to prevent hanging if no response is received
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        // Mark as resolved
        isResolved = true;
        
        // Remove both handlers
        eventBus.off('error', errorHandler);
        eventBus.off('lobby_update', lobbyUpdateHandler);
        
        // Show timeout message and resolve as false
        showErrorMessage('Connection timeout. Please try again.');
        resolve(false);
      }
    }, 5000);
  });
  
  // Wait for the nickname check to complete before proceeding
  checkNicknameAvailability.then(isAvailable => {
    if (isAvailable) {
      // Update player store with waiting state
      playerStore.setState({
        gameState: 'waiting'
      });
      
      // Render waiting room
      renderWaitingRoom(container);
      
      // Create and add the chat button directly
      setTimeout(() => {
        createChatButton();
      }, 1000); // Longer delay to ensure everything is loaded
    }
  });
}

// Render the waiting room
function renderWaitingRoom(container: HTMLElement): void {
  // Get current players
  const { players, lobbyData } = playerStore.getState();
  const currentPlayerId = getPlayerId();
  
  // Clear container
  container.innerHTML = '';
  
  // Create waiting room container
  const waitingRoomContainer = document.createElement('div');
  waitingRoomContainer.className = 'waiting-room';
  waitingRoomContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background-image: url('/img/MapBack.png');
    background-size: cover;
    background-position: center;
    color: #f5f5f5;
    font-family: 'Papyrus', 'Copperplate', fantasy;
  `;
  
  // Create content container with beige background
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    background-color: rgba(255, 243, 224, 0.9);
    padding: 2rem;
    border-radius: 15px;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 80%;
    max-width: 800px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
  `;
  
  // Create title
  const title = document.createElement('h1');
  title.textContent = 'Waiting for Players';
  title.style.cssText = `
    font-size: 3rem;
    margin-bottom: 1rem;
    color: #d4af37;
    text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    font-family: 'Papyrus', 'Copperplate', fantasy;
  `;
  
  // Create player count
  const playerCount = document.createElement('h2');
  playerCount.textContent = `Players: ${players.length} / ${playerStore.getState().maxPlayers}`;
  playerCount.style.cssText = `
    font-size: 1.5rem;
    margin-bottom: 2rem;
    color: #FFC107;
  `;
  
  // Create countdown timer element
  const timerElement = document.createElement('h2');
  timerElement.id = 'game-countdown';
  timerElement.className = 'game-countdown'; // Add the class for consistent updates
  timerElement.style.cssText = `
    font-size: 2rem;
    margin-bottom: 2rem;
    color: #FF5252;
    text-align: center;
  `;
  
  // Set initial text or use current countdown if available
  if (currentCountdown !== null) {
    timerElement.textContent = `Game starts in ${currentCountdown} seconds if no more players join`;
  } else {
    timerElement.textContent = 'Waiting for players...';
  }
  
  // Create player list container
  const playerListContainer = document.createElement('div');
  playerListContainer.style.cssText = `
    width: 80%;
    max-width: 500px;
    margin-bottom: 2rem;
  `;
  
  // Create player list title
  const playerListTitle = document.createElement('h3');
  playerListTitle.textContent = 'Players In Lobby';
  playerListTitle.style.cssText = `
    font-size: 1.5rem;
    margin-bottom: 1rem;
    text-align: center;
    color: black;
  `;
  
  // Create player list
  const playerList = document.createElement('div');
  playerList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  `;
  
  // Add players to list
  players.forEach(player => {
    const playerItem = document.createElement('div');
    playerItem.className = 'player-item';
    playerItem.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background-color: rgba(210, 180, 140, 0.85);
      border: 2px solid #d4af37;
      border-radius: 8px;
      color: #5D4037;
      margin-bottom: 0.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      background-image: linear-gradient(to right, rgba(210, 180, 140, 0.85), rgba(245, 222, 179, 0.85));
    `;
    
    // Player name and color
    const playerInfo = document.createElement('div');
    playerInfo.style.cssText = `
      display: flex;
      align-items: center;
      gap: 0.5rem;
    `;
    
    // Player color indicator
    const colorIndicator = document.createElement('span');
    colorIndicator.style.cssText = `
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: ${player.color};
      border: 2px solid #d4af37;
    `;
    
    // Assign Egyptian title based on player number
    const playerNumber = player.playerNumber || players.indexOf(player) + 1;
    const egyptianTitles = ['Pharaoh', 'Mummy', 'Anubis', 'Sphinx'];
    const egyptianTitle = egyptianTitles[(playerNumber - 1) % egyptianTitles.length];
    
    // Player name
    const playerName = document.createElement('span');
    playerName.style.cssText = `
      font-family: 'Papyrus', 'Copperplate', fantasy;
      font-size: 1.1rem;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    `;
    
    // Set player name with Egyptian title
    if (player.id === currentPlayerId) {
      playerName.textContent = `${egyptianTitle} ${player.nickname} (You)`;
    } else {
      playerName.textContent = `${egyptianTitle} ${player.nickname}`;
    }
    
    playerInfo.appendChild(colorIndicator);
    playerInfo.appendChild(playerName);
    
    // Add character icon on the right
    const characterIcon = document.createElement('div');
    characterIcon.style.cssText = `
      width: 32px;
      height: 32px;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    `;
    
    // Set character icon based on Egyptian title
    switch (egyptianTitle) {
      case 'Pharaoh':
        characterIcon.innerHTML = '👑';
        characterIcon.style.fontSize = '24px';
        break;
      case 'Mummy':
        characterIcon.innerHTML = '🧟';
        characterIcon.style.fontSize = '24px';
        break;
      case 'Anubis':
        characterIcon.innerHTML = '🐺';
        characterIcon.style.fontSize = '24px';
        break;
      case 'Sphinx':
        characterIcon.innerHTML = '🦁';
        characterIcon.style.fontSize = '24px';
        break;
    }
    
    playerItem.appendChild(playerInfo);
    playerItem.appendChild(characterIcon);
    playerList.appendChild(playerItem);
  });
  
  // Add player list to container
  playerListContainer.appendChild(playerListTitle);
  playerListContainer.appendChild(playerList);
  
  // Initialize chat UI if it doesn't exist
  const chatContainer = document.getElementById('chat-container');
  const chatButton = document.querySelector('.chat-toggle');
  
  if (!chatContainer || !chatButton) {
    console.log('Chat UI not found, initializing chat UI');
    const gameContainer = document.getElementById('app');
    if (gameContainer) {
      // Initialize chat UI directly with the top-right button only
      initChatUI(gameContainer);
      
      // Make sure the chat button is visible
      const newChatButton = document.querySelector('.chat-toggle');
      if (newChatButton instanceof HTMLElement) {
        newChatButton.style.display = 'block';
        newChatButton.style.zIndex = '9999';
        newChatButton.style.position = 'fixed';
        newChatButton.style.top = '10px';
        newChatButton.style.right = '10px';
      }
    }
  } else if (chatButton instanceof HTMLElement) {
    // Ensure the chat button is visible
    chatButton.style.display = 'block';
    chatButton.style.zIndex = '9999';
    chatButton.style.position = 'fixed';
    chatButton.style.top = '10px';
    chatButton.style.right = '10px';
  }
  
  // Add elements to container
  contentContainer.appendChild(title);
  contentContainer.appendChild(playerCount);
  contentContainer.appendChild(timerElement);
  contentContainer.appendChild(playerListContainer);
  
  // Add content container to waiting room
  waitingRoomContainer.appendChild(contentContainer);
  
  // Add waiting room to container
  container.appendChild(waitingRoomContainer);
  
  // Check if we should start a timer or show start button
  if (players.length === 1) {
    // Clear any existing timer
    if (lobbyTimerInterval) {
      clearInterval(lobbyTimerInterval);
      lobbyTimerInterval = null;
    }
    
    // Create start button for single player
    const startButton = document.createElement('button');
    startButton.textContent = 'Start Game';
    startButton.className = 'start-game-button';
    startButton.style.cssText = `
      padding: 1rem 2rem;
      font-size: 1.5rem;
      font-weight: bold;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 1rem;
      transition: background-color 0.3s ease;
    `;
    
    // Add hover effect
    startButton.addEventListener('mouseover', () => {
      startButton.style.backgroundColor = '#45a049';
    });
    
    startButton.addEventListener('mouseout', () => {
      startButton.style.backgroundColor = '#4CAF50';
    });
    
    // Add click event to start the game
    startButton.addEventListener('click', () => {
      // Disable button to prevent multiple clicks
      startButton.disabled = true;
      startButton.textContent = 'Starting...';
      startButton.style.backgroundColor = '#999';
      
      // Send start game event to server with singlePlayer flag
      sendToServer(EVENTS.START_GAME, { singlePlayer: true });
      
      // Show starting message
      timerElement.textContent = 'Starting single-player game...';
    });
    
    // Add button to container
    contentContainer.appendChild(startButton);
    
    timerElement.textContent = 'You can start the game now!';
  } else if (players.length >= 2 && players.length < 4) {
    // Start a 20 second timer
    startLobbyTimer(20, timerElement);
  } else if (players.length === 4) {
    // Start a 10 second timer if we have max players
    startLobbyTimer(10, timerElement);
  } else {
    // Clear any existing timer
    if (lobbyTimerInterval) {
      clearInterval(lobbyTimerInterval);
      lobbyTimerInterval = null;
    }
    timerElement.textContent = 'Waiting for more players...';
  }
}

// Start a countdown timer for lobby
function startLobbyTimer(seconds: number, element: HTMLElement): void {
  // Clear any existing intervals
  if (lobbyTimerInterval) {
    clearInterval(lobbyTimerInterval);
    lobbyTimerInterval = null;
  }
  
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }
  
  let timeLeft = seconds;
  
  // Update the timer text
  element.textContent = `Game starts in ${timeLeft} seconds if no more players join`;
  
  // Create an interval to update the timer
  lobbyTimerInterval = window.setInterval(() => {
    timeLeft--;
    
    // Update the timer text
    element.textContent = `Game starts in ${timeLeft} seconds if no more players join`;
    
    // Check if the timer has reached zero
    if (timeLeft <= 0) {
      // Clear the interval
      if (lobbyTimerInterval) {
        clearInterval(lobbyTimerInterval);
        lobbyTimerInterval = null;
      }
      
      // Start the game countdown
      startGameCountdown(10, element);
    }
    
    // Check if the player count has changed (more players joined)
    const currentPlayers = playerStore.getState().players;
    if (currentPlayers.length >= 4 || currentPlayers.length < 2) {
      // Clear the interval and reset the timer
      if (lobbyTimerInterval) {
        clearInterval(lobbyTimerInterval);
        lobbyTimerInterval = null;
      }
      element.textContent = '';
    }
  }, 1000);
}

// Start a countdown timer for game start
function startGameCountdown(seconds: number, element: HTMLElement): void {
  // Clear any existing intervals
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }
  
  if (lobbyTimerInterval) {
    clearInterval(lobbyTimerInterval);
    lobbyTimerInterval = null;
  }
  
  let timeLeft = seconds;
  
  // Update the timer text
  element.textContent = `Game starting in ${timeLeft} seconds!`;
  element.style.color = '#FF5252';
  
  // Set game state to countdown
  playerStore.setState({
    gameState: 'countdown'
  });
  
  // Create an interval to update the timer
  countdownTimerInterval = window.setInterval(() => {
    timeLeft--;
    
    // Update the timer text
    element.textContent = `Game starting in ${timeLeft} seconds!`;
    
    // Check if the timer has reached zero
    if (timeLeft <= 0) {
      // Clear the interval
      if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
      }
      
      element.textContent = 'Starting game...';
      
      // Force start the game immediately
      console.log('Final countdown complete, forcing game start');
      sendToServer('start_game', {});
    }
    
    // Check if the player count has changed (more players joined or left)
    const currentPlayers = playerStore.getState().players;
    if (currentPlayers.length >= 4 || currentPlayers.length < 2) {
      // Clear the interval and reset the timer
      if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
      }
      element.textContent = '';
      
      // Re-render the waiting room
      const appContainer = document.getElementById('app');
      if (appContainer) {
        renderWaitingRoom(appContainer);
      }
    }
  }, 1000);
}

// Update the waiting room UI without recreating it
function updateWaitingRoom(): void {
  // If we're in the waiting state, re-render the waiting room
  if (playerStore.getState().gameState === 'waiting') {
    const appContainer = document.getElementById('app');
    if (appContainer) {
      renderWaitingRoom(appContainer);
    }
  }
}

// Create a complete chat system directly in the lobby
function createChatButton(): void {
  // Remove any existing chat buttons and containers to prevent duplicates
  const existingButton = document.querySelector('.chat-toggle');
  if (existingButton) {
    existingButton.remove();
  }
  
  const existingContainer = document.getElementById('chat-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  // Global message tracking to prevent duplicates
  // Using a module-level variable for message tracking
  // This will persist across the application lifetime
  const globalMessageTracker = (() => {
    // Singleton pattern to ensure only one instance exists
    let instance: Set<string> | null = null;
    
    return {
      getInstance: () => {
        if (!instance) {
          instance = new Set<string>();
        }
        return instance;
      }
    };
  })();
  
  // Simple message tracking to prevent duplicates
  const processedMessages = new Set<string>();
  
  // Remove any existing chat event listeners
  const socket = getSocket();
  if (socket) {
    // Remove socket listeners
    socket.off('chat');
    
    // Set up a direct socket listener for chat messages
    socket.on('chat', (data) => {
      console.log('CHAT MESSAGE RECEIVED:', data);
      
      // IMPORTANT: Skip ALL messages with nickname "You" - these are echoes from the server
      if (data.nickname === 'You') {
        console.log('Skipping message with nickname "You"');
        return;
      }
      
      // Skip our own messages (we already show them locally)
      const currentPlayerId = getPlayerId();
      if (data.playerId === currentPlayerId) {
        console.log('Skipping own message with ID:', data.playerId);
        return;
      }
      
      // Simple message ID
      const messageId = `${data.playerId}-${data.timestamp}`;
      
      // Skip if already processed
      if (processedMessages.has(messageId)) {
        console.log('Skipping already processed message:', messageId);
        return;
      }
      
      // Mark as processed
      processedMessages.add(messageId);
      console.log('Displaying message from', data.nickname);
      
      // Display the message
      const messagesContainer = document.querySelector('.chat-messages');
      if (messagesContainer instanceof HTMLElement) {
        addChatMessage(data.nickname, data.message, messagesContainer, true);
      }
    });
  }
  
  // Create chat container
  const chatContainer = document.createElement('div');
  chatContainer.id = 'chat-container';
  chatContainer.className = 'chat-container';
  chatContainer.style.cssText = `
    position: fixed !important;
    bottom: 80px !important;
    right: 20px !important;
    width: 320px !important;
    height: 350px !important;
    background-color: rgba(0, 0, 0, 0.85) !important;
    border-radius: 8px !important;
    display: flex !important;
    flex-direction: column !important;
    z-index: 1000 !important;
    transition: all 0.3s ease !important;
    display: none !important;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    font-family: 'Arial', sans-serif !important;
  `;
  
  // Create chat header
  const chatHeader = document.createElement('div');
  chatHeader.className = 'chat-header';
  chatHeader.style.cssText = `
    padding: 10px 15px !important;
    background-color: rgba(0, 0, 0, 0.7) !important;
    border-top-left-radius: 8px !important;
    border-top-right-radius: 8px !important;
    cursor: move !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
    user-select: none !important;
  `;
  
  // Create chat title
  const chatTitle = document.createElement('span');
  chatTitle.textContent = '☥ Game Chat ☥';
  chatTitle.style.cssText = `
    font-weight: bold !important;
    font-size: 16px !important;
    color:rgb(255, 254, 254) !important;
    margin: 0 auto !important;
    text-align: center !important;
    font-family: 'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy !important;
  `;
  
  // Create minimize button
  const minimizeButton = document.createElement('button');
  minimizeButton.textContent = '−';
  minimizeButton.style.cssText = `
    background: none !important;
    border: none !important;
    color: #d4af37 !important;
    cursor: pointer !important;
    font-size: 18px !important;
    padding: 0 5px !important;
    transition: color 0.2s !important;
    font-weight: bold !important;
  `;
  
  // Add minimize button functionality
  minimizeButton.addEventListener('click', () => {
    if (messagesContainer.style.display !== 'none') {
      messagesContainer.style.display = 'none';
      inputContainer.style.display = 'none';
      minimizeButton.textContent = '+';
      chatContainer.style.height = 'auto';
    } else {
      messagesContainer.style.display = 'flex';
      inputContainer.style.display = 'flex';
      minimizeButton.textContent = '−';
      chatContainer.style.height = '350px';
    }
  });
  
  // Add title and minimize button to header
  chatHeader.appendChild(chatTitle);
  chatHeader.appendChild(minimizeButton);
  
  // Create messages container
  const messagesContainer = document.createElement('div');
  messagesContainer.className = 'chat-messages';
  messagesContainer.style.cssText = `
    flex: 1 !important;
    overflow-y: auto !important;
    padding: 15px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    scrollbar-width: thin !important;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent !important;
  `;
  
  // Create input container
  const inputContainer = document.createElement('div');
  inputContainer.className = 'chat-input-container';
  inputContainer.style.cssText = `
    display: flex !important;
    padding: 12px !important;
    background-color: rgba(0, 0, 0, 0.6) !important;
    border-bottom-left-radius: 8px !important;
    border-bottom-right-radius: 8px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
  `;
  
  // Create chat input
  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.placeholder = 'Type a message...';
  chatInput.style.cssText = `
    flex: 1 !important;
    padding: 8px 12px !important;
    border-radius: 4px !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    background-color: rgba(255, 255, 255, 0.9) !important;
    font-size: 14px !important;
    transition: border-color 0.3s !important;
    outline: none !important;
  `;
  
  // Create send button
  const sendButton = document.createElement('button');
  sendButton.textContent = 'Send';
  sendButton.style.cssText = `
    margin-left: 8px !important;
    padding: 8px 15px !important;
    border: none !important;
    border-radius: 4px !important;
    background-color: #4CAF50 !important;
    cursor: pointer !important;
    font-weight: bold !important;
    transition: background-color 0.3s, transform 0.2s !important;
  `;
  
  // Add input and button to input container
  inputContainer.appendChild(chatInput);
  inputContainer.appendChild(sendButton);
  
  // Assemble chat container
  chatContainer.appendChild(chatHeader);
  chatContainer.appendChild(messagesContainer);
  chatContainer.appendChild(inputContainer);
  
  // Add chat container to DOM
  document.body.appendChild(chatContainer);
  
  // Add dragging functionality
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  
  chatHeader.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - chatContainer.getBoundingClientRect().left;
    offsetY = e.clientY - chatContainer.getBoundingClientRect().top;
    
    // Add temporary styles during drag
    chatContainer.style.opacity = '0.8';
    chatContainer.style.transition = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    // Keep the chat container within viewport bounds
    const maxX = window.innerWidth - chatContainer.offsetWidth;
    const maxY = window.innerHeight - chatContainer.offsetHeight;
    
    chatContainer.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    chatContainer.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      chatContainer.style.opacity = '1';
      chatContainer.style.transition = 'opacity 0.3s';
    }
  });
  
  // Create a new button
  const chatButton = document.createElement('button');
  chatButton.className = 'chat-toggle';
  chatButton.id = 'chat-toggle-button';
  chatButton.textContent = 'Chat';
  chatButton.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    right: 10px !important;
    padding: 8px 15px !important;
    background-color: #4CAF50 !important;
    border: none !important;
    border-radius: 4px !important;
    cursor: pointer !important;
    font-weight: bold !important;
    z-index: 9999 !important;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3) !important;
    transition: background-color 0.3s !important;
    display: block !important;
    font-family: Arial, sans-serif !important;
    font-size: 14px !important;
  `;
  
  // Add event listeners for chat button
  chatButton.addEventListener('click', () => {
    // Toggle chat visibility
    if (chatContainer.style.display === 'none' || !chatContainer.style.display) {
      chatContainer.style.display = 'flex';
      chatButton.textContent = 'Hide Chat';
      // Focus input when chat is opened
      chatInput.focus();
    } else {
      chatContainer.style.display = 'none';
      chatButton.textContent = 'Chat';
    }
  });
  
  // Add event listener for send button
  sendButton.addEventListener('click', () => {
    sendChatMessage(chatInput.value, messagesContainer);
    chatInput.value = '';
  });
  
  // Add event listener for enter key in input
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage(chatInput.value, messagesContainer);
      chatInput.value = '';
    }
  });
  
  // Add to the DOM
  document.body.appendChild(chatButton);
  console.log('Chat system created and added to DOM');
  
  // Add a welcome message
  addChatMessage('System', 'Welcome to Bomberman Chat! 💬', messagesContainer);
}

// Ensure the chat button is visible
function ensureChatButtonVisible(): void {
  const chatButton = document.querySelector('.chat-toggle');
  if (chatButton instanceof HTMLElement) {
    // Make sure the chat button stays visible
    chatButton.style.display = 'block';
    chatButton.style.zIndex = '9999';
    chatButton.style.position = 'fixed';
    chatButton.style.top = '10px';
    chatButton.style.right = '10px';
    console.log('Chat button visibility enforced in lobby');
  } else {
    console.error('Chat button not found in DOM from lobby');
    // Create a new button directly
    createChatButton();
  }
}

// Global set to track sent message IDs
const sentMessageIds = new Set<string>();

// Module-level flag to track if chat listeners are initialized
// This prevents multiple registrations of event listeners
let chatListenersInitialized = false;

// Send a chat message
function sendChatMessage(message: string, messagesContainer: HTMLElement): void {
  if (!message.trim()) return;
  
  // Get player nickname and ID from store
  const currentPlayer = playerStore.getState().currentPlayer;
  const nickname = currentPlayer?.nickname || 'You';
  const playerId = getPlayerId() || 'local';
  
  // Create chat message data
  const chatData = {
    playerId,
    nickname,
    message: message.trim(),
    timestamp: Date.now()
  };
  
  // Get the socket directly
  const socket = getSocket();
  if (socket && socket.connected) {
    // Send message directly via socket
    socket.emit('chat', chatData);
    console.log('Chat message sent to server:', chatData);
  } else {
    // Fallback to sendToServer which will queue the message
    sendToServer(EVENTS.CHAT, chatData);
    console.log('Chat message queued (socket not connected)');
  }
  
  // Add message to local chat for immediate feedback
  addChatMessage(nickname, message.trim(), messagesContainer);
}

// Add a chat message to the UI
function addChatMessage(sender: string, message: string, messagesContainer: HTMLElement, forceRemote: boolean = false): void {
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';
  
  // Check message type
  const isSystem = sender === 'System';
  
  // Determine if this is a local message
  let isLocalUser = false;
  
  if (forceRemote) {
    // This is explicitly marked as a remote message
    isLocalUser = false;
  } else {
    // For messages we're sending locally
    isLocalUser = true;
  }
  
  messageElement.style.cssText = `
    background-color: ${isSystem ? 'rgba(255, 204, 0, 0.2)' : isLocalUser ? 'rgba(76, 175, 80, 0.2)' : 'rgba(100, 181, 246, 0.2)'};
    padding: 8px 12px;
    border-radius: 6px;
    word-break: break-word;
    max-width: 85%;
    align-self: ${isLocalUser ? 'flex-end' : 'flex-start'};
    margin-left: ${isLocalUser ? 'auto' : '0'};
    margin-right: ${isLocalUser ? '0' : 'auto'};
    position: relative;
    animation: fadeIn 0.3s ease;
  `;
  
  // Format timestamp
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Create message content with text alignment based on sender
  messageElement.innerHTML = `
    <div style="font-weight: bold; color: ${isSystem ? '#ffcc00' : isLocalUser ? '#4CAF50' : '#64B5F6'}; margin-bottom: 3px; text-align: ${isLocalUser ? 'right' : 'left'};">
      ${sender}
      <span style="color: #aaa; font-size: 0.8em; margin-left: 5px; font-weight: normal;">${timestamp}</span>
    </div>
    <div style="color: #fff; text-align: ${isLocalUser ? 'right' : 'left'};">${message}</div>
  `;
  
  // Add message to container
  messagesContainer.appendChild(messageElement);
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show error message
function showErrorMessage(message: string): void {
  // Create error message using the framework's h function
  const errorMessageVNode = h('div', {
    style: `
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
    `
  }, [message]);
  
  // Render and add to the document
  const errorMessage = render(errorMessageVNode) as HTMLElement;
  document.body.appendChild(errorMessage);
  
  // Remove error message after 5 seconds
  setTimeout(() => {
    if (errorMessage.parentNode) {
      errorMessage.parentNode.removeChild(errorMessage);
    }
  }, 5000);
}

// Export for use in other modules
export { renderLoginScreen, renderWaitingRoom };
