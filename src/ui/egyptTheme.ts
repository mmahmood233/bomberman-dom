// Egyptian Pyramid theme UI components
import { eventBus } from '../../framework/events';
import { h, render } from '../../framework/dom';

// Character data using the provided player images
const EGYPTIAN_CHARACTERS = [
  {
    id: 'ik',
    name: 'IK',
    color: '#d4af37',
    description: 'A powerful warrior with exceptional bomb skills.',
    abilities: 'Extra bomb range',
    image: '/img/IK.png'
  },
  {
    id: 'mmd',
    name: 'MMD',
    color: '#e4c49b',
    description: 'A swift explorer with unmatched speed.',
    abilities: 'Faster movement speed',
    image: '/img/MMD.png'
  },
  {
    id: 'wa',
    name: 'WA',
    color: '#4a4233',
    description: 'A tactical genius with explosive expertise.',
    abilities: 'Extra bomb capacity',
    image: '/img/WA.png'
  },
  {
    id: 'mg',
    name: 'MG',
    color: '#7e7053',
    description: 'A master of defense and strategic planning.',
    abilities: 'Extra life point',
    image: '/img/MG.png'
  }
];

// Initialize Egyptian theme
export function initEgyptTheme(container: HTMLElement): void {
  // Add Egyptian background music
  addBackgroundMusic();
  
  // Add Egyptian sound effects
  addSoundEffects();
  
  // Ensure the Egyptian theme CSS is loaded
  ensureEgyptianCssLoaded();
  
  // Check if we're on the login screen
  const nicknameInput = document.querySelector('input[placeholder="Enter your nickname"]');
  const isLoginScreen = !!nicknameInput;
  
  // Don't initialize chat UI on login screen
  if (isLoginScreen) {
    console.log('On login screen, not applying chat theme');
    return;
  }
  
  // Set up event listeners for chat initialization
  eventBus.on('chat:initialized', () => {
    // Apply Egyptian chat styling when chat is initialized
    applyEgyptianChatTheme();
  });
  
  // Add Egyptian character selection to the lobby
  eventBus.on('lobby:show', () => {
    setTimeout(() => {
      const lobbyContainer = document.querySelector('.lobby-container');
      if (lobbyContainer) {
        addCharacterSelection(lobbyContainer as HTMLElement);
      }
    }, 500);
  });
  
  // Apply Egyptian chat theme when chat is toggled
  eventBus.on('chat:toggled', () => {
    setTimeout(applyEgyptianChatTheme, 100);
  });
}

// Global reference to the music element
let backgroundMusic: HTMLAudioElement | null = null;

// Add Egyptian background music
function addBackgroundMusic(): void {
  // Check if music already exists
  if (document.getElementById('egypt-background-music')) {
    backgroundMusic = document.getElementById('egypt-background-music') as HTMLAudioElement;
    return;
  }
  
  // Create audio element for background music
  backgroundMusic = document.createElement('audio');
  backgroundMusic.id = 'egypt-background-music';
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.3;
  
  // Use Egyptian themed music from local file with absolute path
  backgroundMusic.src = '/MP3/wayah.mp3';
  
  // Add to document
  document.body.appendChild(backgroundMusic);
  
  // Add volume control
  const volumeControl = document.createElement('div');
  volumeControl.className = 'volume-control';
  volumeControl.innerHTML = `
    <div class="volume-slider-container">
      <span class="volume-icon">🔊</span>
      <input type="range" id="volume-slider" min="0" max="100" value="30" class="slider">
    </div>
  `;
  
  // Style volume control
  volumeControl.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 1000;
    padding: 10px;
    background-color: rgba(126, 112, 83, 0.8);
    border: 2px solid #d4af37;
    border-radius: 5px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  `;
  
  // Add to document
  setTimeout(() => {
    document.body.appendChild(volumeControl);
    
    // Add event listener for volume slider
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    if (volumeSlider && backgroundMusic) {
      volumeSlider.addEventListener('input', () => {
        const volume = parseInt(volumeSlider.value) / 100;
        backgroundMusic!.volume = volume;
      });
    }
  }, 1000);
  
  // Add styles for volume control
  const style = document.createElement('style');
  style.textContent = `
    .volume-slider-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .volume-icon {
      color: #d4af37;
      font-size: 18px;
    }
    
    .slider {
      -webkit-appearance: none;
      width: 100px;
      height: 8px;
      background: #4a4233;
      outline: none;
      border-radius: 4px;
    }
    
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      background: #d4af37;
      cursor: pointer;
      border-radius: 50%;
    }
    
    .slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: #d4af37;
      cursor: pointer;
      border-radius: 50%;
      border: none;
    }
  `;
  document.head.appendChild(style);
  
  // Set up event listeners for game start and end
  setupMusicEventListeners();
  
  console.log('Egyptian music initialized and ready to play when game starts');
}

// Set up event listeners for game start and end
function setupMusicEventListeners(): void {
  // Listen for game start event
  eventBus.on('game:started', () => {
    console.log('Game started, playing music');
    playMusic();
  });
  
  // Also listen for game:start event (different event name used in some places)
  eventBus.on('game:start', () => {
    console.log('Game start event received, playing music');
    playMusic();
  });
  
  // Listen for game end event
  eventBus.on('game:over', () => {
    console.log('Game over, stopping music');
    stopMusic();
  });
  
  // Listen for game reset event
  eventBus.on('game:reset', () => {
    console.log('Game reset, restarting music');
    playMusic();
  });
  
  // Listen for player joining lobby (to stop music)
  eventBus.on('lobby:show', () => {
    console.log('Returned to lobby, stopping music');
    stopMusic();
  });
  
  // Add a manual trigger for the first interaction
  document.addEventListener('click', handleFirstInteraction, { once: true });
}

// Handle the first user interaction to enable audio
function handleFirstInteraction(): void {
  console.log('First user interaction detected, enabling audio');
  // Create a silent audio context to unlock audio on mobile
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const silentBuffer = audioContext.createBuffer(1, 1, 22050);
  const source = audioContext.createBufferSource();
  source.buffer = silentBuffer;
  source.connect(audioContext.destination);
  source.start();
  
  // If the game is already in progress, start the music
  if (document.querySelector('.game-container')) {
    playMusic();
  }
}

// Play background music
function playMusic(): void {
  if (!backgroundMusic) return;
  
  // Only play if it's not already playing
  if (backgroundMusic.paused) {
    backgroundMusic.play().then(() => {
      console.log('Music started playing successfully');
    }).catch(error => {
      console.error('Error playing music:', error);
      // Try again with user interaction
      const playButton = document.createElement('button');
      playButton.textContent = 'Enable Music';
      playButton.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        padding: 20px;
        background-color: #d4af37;
        color: #4a4233;
        font-family: 'Papyrus', 'Copperplate', fantasy;
        font-size: 20px;
        border: none;
        cursor: pointer;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      `;
      playButton.onclick = () => {
        backgroundMusic?.play();
        playButton.remove();
      };
      document.body.appendChild(playButton);
    });
  }
}

// Stop background music
function stopMusic(): void {
  if (backgroundMusic && !backgroundMusic.paused) {
    backgroundMusic.pause();
  }
}

// Add Egyptian sound effects
function addSoundEffects(): void {
  // Implementation will be added later
  const egyptSounds = {
    explosion: '/MP3/wayah.mp3',
    powerup: '/MP3/wayah.mp3',
    victory: '/MP3/wayah.mp3'
  };
  
  // Create audio elements for each sound
  Object.entries(egyptSounds).forEach(([name, src]) => {
    const sound = document.createElement('audio');
    sound.id = `egypt-sound-${name}`;
    sound.src = src as string;
    sound.preload = 'auto';
    document.body.appendChild(sound);
  });
}

// Ensure the Egyptian theme CSS is loaded
function ensureEgyptianCssLoaded(): void {
  // Check if the Egyptian theme CSS is already loaded
  const existingLink = document.querySelector('link[href="/egyptian-chat-theme.css"]');
  if (!existingLink) {
    console.log('Loading Egyptian chat theme CSS...');
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = '/egyptian-chat-theme.css';
    document.head.appendChild(linkElement);
  } else {
    console.log('Egyptian chat theme CSS already loaded');
  }
}

// Make the chat toggle button visible with Egyptian styling
function showChatToggleButton(): void {
  console.log('Showing chat toggle button with Egyptian styling...');
  
  // Check if we're on the login screen by looking for the nickname input
  const nicknameInput = document.querySelector('input[placeholder="Enter your nickname"]');
  if (nicknameInput) {
    console.log('On login screen, removing chat button');
    
    // Remove any existing chat toggle button
    const chatToggleButton = document.getElementById('chat-toggle-button');
    if (chatToggleButton) {
      chatToggleButton.remove();
    }
    return;
  }
  
  const chatToggleButton = document.getElementById('chat-toggle-button');
  if (!chatToggleButton) {
    console.log('Chat toggle button not found');
    return;
  }
  
  // Add Egyptian styling to the button
  chatToggleButton.classList.add('egyptian-theme');
  chatToggleButton.style.setProperty('display', 'block', 'important');
  chatToggleButton.style.setProperty('position', 'fixed', 'important');
  chatToggleButton.style.setProperty('top', '10px', 'important');
  chatToggleButton.style.setProperty('right', '10px', 'important');
  chatToggleButton.style.setProperty('z-index', '9999', 'important');
  
  // Add Egyptian ankh symbol
  if (!chatToggleButton.textContent?.includes('☥')) {
    chatToggleButton.textContent = '☥ Chat';
  }
  
  console.log('Chat toggle button is now visible with Egyptian styling');
}

// Apply Egyptian theme to chat UI
function applyEgyptianChatTheme(): void {
  console.log('Applying Egyptian theme to chat UI...');
  
  // Check if we're on the login screen by looking for the nickname input
  const nicknameInput = document.querySelector('input[placeholder="Enter your nickname"]');
  if (nicknameInput) {
    console.log('On login screen, not applying chat theme');
    return;
  }
  
  // Get chat elements
  const chatContainer = document.getElementById('chat-container');
  const chatHeader = document.querySelector('.chat-header') as HTMLElement | null;
  const chatMessages = document.querySelector('.chat-messages') as HTMLElement | null;
  const chatInput = document.querySelector('.chat-input') as HTMLInputElement | null;
  const sendButton = document.querySelector('.chat-send-button') as HTMLButtonElement | null;
  const chatToggleButton = document.getElementById('chat-toggle-button');
  const minimizeButton = chatHeader?.querySelector('button') as HTMLButtonElement | null;
  const chatInputContainer = document.querySelector('.chat-input-container') as HTMLElement | null;
  
  // Ensure the Egyptian theme CSS is loaded
  ensureEgyptianCssLoaded();
  
  if (!chatContainer) {
    console.log('Chat container not found, Egyptian theme not applied');
    return;
  }
  
  console.log('Chat container found, applying Egyptian theme...');
  
  // Apply Egyptian styling to chat container
  // Instead of setting inline styles, add a class that will use the CSS from egyptian-chat-theme.css
  const chatContainerEl = chatContainer as HTMLElement;
  chatContainerEl.classList.add('egyptian-theme');
  
  // Force display to be visible if the chat is supposed to be shown
  if (chatContainerEl.style.display === 'none') {
    console.log('Making chat container visible');
    // Use setTimeout to ensure this happens after any other display changes
    setTimeout(() => {
      chatContainerEl.style.setProperty('display', 'flex', 'important');
    }, 100);
  }
  
  // Apply Egyptian styling to chat header
  if (chatHeader) {
    (chatHeader as HTMLElement).setAttribute('style', `
      padding: 10px 15px;
      background: linear-gradient(to right, #4a4233, #5c5243, #4a4233);
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #d4af37;
      user-select: none;
      position: relative;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      background-image: url('https://www.transparenttextures.com/patterns/papyrus-dark.png');
      background-blend-mode: overlay;
    `);
    
    // Add hieroglyphic decoration to header
    let headerDecoration = chatHeader.querySelector('.header-decoration') as HTMLElement;
    if (!headerDecoration) {
      headerDecoration = document.createElement('div');
      headerDecoration.className = 'header-decoration';
      headerDecoration.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(to right, transparent, #d4af37, transparent);
      `;
      chatHeader.appendChild(headerDecoration);
    }
    
    // Update header title if it exists
    const headerTitle = chatHeader.querySelector('div') as HTMLElement;
    if (headerTitle) {
      headerTitle.textContent = '☥ GAME CHAT ☥';
      headerTitle.style.cssText = `
        font-weight: bold;
        font-size: 18px;
        color: #d4af37;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
        font-family: 'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy;
        letter-spacing: 2px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
    }
    
    // Style the chat header background
    chatHeader.style.cssText = `
      background: linear-gradient(to right, #4a4233, #5a5243, #4a4233);
      background-image: url('https://www.transparenttextures.com/patterns/papyrus-dark.png');
      background-blend-mode: overlay;
      border-bottom: 2px solid #d4af37;
      border-radius: 8px 8px 0 0;
      padding: 10px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    
    // Style the minimize button
    if (minimizeButton) {
      (minimizeButton as HTMLElement).style.cssText = `
        background: none;
        border: 2px solid #d4af37;
        border-radius: 4px;
        color: #d4af37;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        transition: all 0.2s ease;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
        margin-left: 10px;
      `;
      
      // Add hover effect to minimize button
      minimizeButton.addEventListener('mouseover', () => {
        const btnEl = minimizeButton as HTMLElement;
        btnEl.style.color = '#f5e7c1';
        btnEl.style.borderColor = '#f5e7c1';
        btnEl.style.boxShadow = '0 0 5px rgba(212, 175, 55, 0.5)';
        btnEl.style.animation = 'glowPulse 1.5s infinite';
      });
      
      minimizeButton.addEventListener('mouseout', () => {
        const btnEl = minimizeButton as HTMLElement;
        btnEl.style.color = '#d4af37';
        btnEl.style.borderColor = '#d4af37';
        btnEl.style.boxShadow = 'none';
        btnEl.style.animation = 'none';
      });
    }
  }
  
  // Apply Egyptian styling to messages container
  if (chatMessages) {
    (chatMessages as HTMLElement).setAttribute('style', `
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background-color: rgba(74, 66, 51, 0.4);
      background-image: url('https://www.transparenttextures.com/patterns/papyrus.png');
      background-blend-mode: overlay;
      box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.2);
      border-left: 1px solid rgba(212, 175, 55, 0.3);
      border-right: 1px solid rgba(212, 175, 55, 0.3);
    `);
    
    // Style scrollbar
    const scrollbarStyleId = 'egyptian-scrollbar-style';
    let scrollbarStyle = document.getElementById(scrollbarStyleId);
    
    if (!scrollbarStyle) {
      scrollbarStyle = document.createElement('style');
      scrollbarStyle.id = scrollbarStyleId;
      scrollbarStyle.textContent = `
        .chat-messages::-webkit-scrollbar {
          width: 8px;
        }
        .chat-messages::-webkit-scrollbar-track {
          background: rgba(74, 66, 51, 0.3);
          border-radius: 4px;
        }
        .chat-messages::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #d4af37, #b38728);
          border-radius: 4px;
          border: 1px solid #8B7513;
        }
        .chat-messages::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #f5e7c1, #d4af37);
        }
        @keyframes glowPulse {
          0% { text-shadow: 0 0 5px rgba(212, 175, 55, 0.5); }
          50% { text-shadow: 0 0 15px rgba(212, 175, 55, 0.8); }
          100% { text-shadow: 0 0 5px rgba(212, 175, 55, 0.5); }
        }
      `;
      document.head.appendChild(scrollbarStyle);
    }
    
    // Style existing messages
    const messages = chatMessages.querySelectorAll('.chat-message');
    messages.forEach((message) => {
      styleEgyptianMessage(message as HTMLElement);
    });
  }
  
  // Apply Egyptian styling to chat input
  if (chatInput) {
    (chatInput as HTMLElement).setAttribute('style', `
      flex: 1;
      padding: 10px 15px;
      border: 2px solid #d4af37;
      border-radius: 4px;
      background-color: rgba(74, 66, 51, 0.8);
      color: #d4af37;
      outline: none;
      transition: all 0.3s ease;
      font-family: 'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy;
      margin-right: 10px;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
      font-size: 16px;
      background-image: url('https://www.transparenttextures.com/patterns/papyrus.png');
      background-blend-mode: overlay;
    `);
    
    // Update placeholder
    if (chatInput instanceof HTMLInputElement) {
      chatInput.placeholder = 'Inscribe your hieroglyphs... ☥';
    }
    
    // Add focus and blur effects
    chatInput.addEventListener('focus', () => {
      const inputEl = chatInput as HTMLElement;
      inputEl.style.borderColor = '#d4af37';
      inputEl.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 8px rgba(212, 175, 55, 0.6)';
    });
    
    chatInput.addEventListener('blur', () => {
      const inputEl = chatInput as HTMLElement;
      inputEl.style.borderColor = 'rgba(212, 175, 55, 0.5)';
      inputEl.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.2)';
    });
  }
  
  // Apply Egyptian styling to chat input container
  if (chatInputContainer) {
    (chatInputContainer as HTMLElement).setAttribute('style', `
      display: flex;
      padding: 12px;
      background: linear-gradient(to bottom, #4a4233, #5c5243);
      background-image: url('https://www.transparenttextures.com/patterns/papyrus-dark.png');
      background-blend-mode: overlay;
      border-top: 2px solid #d4af37;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    `);
  }
  
  // Apply Egyptian styling to send button
  if (sendButton) {
    (sendButton as HTMLElement).setAttribute('style', `
      padding: 10px 18px;
      background: linear-gradient(to bottom, #d4af37, #b38728);
      color: #4a4233;
      border: 2px solid #8B7513;
      border-radius: 8px;
      cursor: pointer;
      font-family: 'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy;
      font-weight: bold;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      text-shadow: 0 1px 1px rgba(255, 255, 255, 0.3);
      position: relative;
      overflow: hidden;
    `);
    
    // Update button text
    if (sendButton) {
      sendButton.textContent = 'Send ☥';
    }
    
    // Add hover effect
    sendButton.addEventListener('mouseover', () => {
      const btnEl = sendButton as HTMLElement;
      btnEl.style.background = 'linear-gradient(to bottom, #f5e7c1, #d4af37)';
      btnEl.style.boxShadow = '0 0 8px rgba(212, 175, 55, 0.6)';
    });
    
    sendButton.addEventListener('mouseout', () => {
      const btnEl = sendButton as HTMLElement;
      btnEl.style.background = 'linear-gradient(to bottom, #d4af37, #b38728)';
      btnEl.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    });
    
    sendButton.addEventListener('mousedown', () => {
      const btnEl = sendButton as HTMLElement;
      btnEl.style.transform = 'scale(0.95)';
    });
    
    sendButton.addEventListener('mouseup', () => {
      const btnEl = sendButton as HTMLElement;
      btnEl.style.transform = 'scale(1)';
    });
  }
  
  // Apply Egyptian styling to chat toggle button
  if (chatToggleButton) {
    (chatToggleButton as HTMLElement).setAttribute('style', `
      position: fixed !important;
      top: 10px !important;
      right: 10px !important;
      padding: 8px 15px !important;
      background: linear-gradient(to bottom, #d4af37, #b38728) !important;
      color: #4a4233 !important;
      border: 2px solid #8B7513 !important;
      border-radius: 20px !important;
      cursor: pointer !important;
      font-weight: bold !important;
      z-index: 9999 !important;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3) !important;
      transition: all 0.3s ease !important;
      display: block !important;
      font-family: 'Papyrus', 'Copperplate', fantasy !important;
      font-size: 14px !important;
      text-transform: uppercase !important;
      letter-spacing: 1px !important;
    `);
    
    // Update button text
    if ((chatContainer as HTMLElement).style.display === 'flex') {
      chatToggleButton.textContent = '☥ Hide Chat';
    } else {
      chatToggleButton.textContent = '☥ Chat';
    }
    
    // Add hover effect
    chatToggleButton.addEventListener('mouseover', () => {
      const btnEl = chatToggleButton as HTMLElement;
      btnEl.style.background = 'linear-gradient(to bottom, #f5e7c1, #d4af37) !important';
      btnEl.style.boxShadow = '0 0 10px rgba(212, 175, 55, 0.5) !important';
    });
    
    chatToggleButton.addEventListener('mouseout', () => {
      const btnEl = chatToggleButton as HTMLElement;
      btnEl.style.background = 'linear-gradient(to bottom, #d4af37, #b38728) !important';
      btnEl.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.3) !important';
    });
    
    chatToggleButton.addEventListener('mousedown', () => {
      const btnEl = chatToggleButton as HTMLElement;
      btnEl.style.transform = 'scale(0.95) !important';
    });
    
    chatToggleButton.addEventListener('mouseup', () => {
      const btnEl = chatToggleButton as HTMLElement;
      btnEl.style.transform = 'scale(1) !important';
    });
  }
  
  // Hook into game events to play sounds
  eventBus.on('block:destroyed', () => {
    const sound = document.getElementById('egypt-sound-explosion') as HTMLAudioElement;
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.error('Error playing sound:', e));
    }
  });
  
  eventBus.on('powerup:collected', () => {
    const sound = document.getElementById('egypt-sound-powerup') as HTMLAudioElement;
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.error('Error playing sound:', e));
    }
  });
  
  eventBus.on('game:over', () => {
    const sound = document.getElementById('egypt-sound-victory') as HTMLAudioElement;
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.error('Error playing sound:', e));
    }
  });
}

// Add character selection to the lobby
function addCharacterSelection(container: HTMLElement): void {
  // Check if character selection already exists
  if (document.getElementById('egypt-character-selection')) return;
  
  // Create character selection container
  const selectionContainer = document.createElement('div');
  selectionContainer.id = 'egypt-character-selection';
  selectionContainer.className = 'egypt-character-selection';
  
  // Add title
  const title = document.createElement('h2');
  title.textContent = 'Choose Your Egyptian Character';
  title.className = 'egypt-selection-title';
  selectionContainer.appendChild(title);
  
  // Add character cards
  const charactersContainer = document.createElement('div');
  charactersContainer.className = 'egypt-characters-container';
  
  // Create character cards
  EGYPTIAN_CHARACTERS.forEach(character => {
    const card = createCharacterCard(character);
    charactersContainer.appendChild(card);
  });
  
  selectionContainer.appendChild(charactersContainer);
  
  // Add selection container to the lobby
  container.appendChild(selectionContainer);
  
  // Add character selection styles
  addCharacterSelectionStyles();
}

// Create a character card
function createCharacterCard(character: any): HTMLElement {
  // Create character card using the framework's h function
  const cardVNode = h('div', {
    class: 'egypt-character-card',
    'data-character-id': character.id,
    style: `border-color: ${character.color};`,
    onclick: () => {
      // Remove selected class from all cards
      document.querySelectorAll('.egypt-character-card').forEach(el => {
        el.classList.remove('selected');
      });
      
      // Add selected class to this card
      const cardElement = document.querySelector(`[data-character-id="${character.id}"]`);
      if (cardElement) {
        cardElement.classList.add('selected');
      }
      
      // Store selected character in localStorage
      localStorage.setItem('selectedCharacter', character.id);
      
      // Emit character selected event
      eventBus.emit('character:selected', { character });
    }
  }, [
    // Character image
    h('img', {
      src: character.image,
      alt: character.name,
      class: 'egypt-character-image'
    }, []),
    
    // Character name
    h('h3', {
      class: 'egypt-character-name',
      style: `color: ${character.color};`
    }, [character.name]),
    
    // Character description
    h('p', {
      class: 'egypt-character-description'
    }, [character.description]),
    
    // Character abilities
    h('p', {
      class: 'egypt-character-abilities'
    }, [`Special: ${character.abilities}`]),
    
    // Select button
    h('button', {
      class: 'egypt-select-button',
      style: `background-color: ${character.color};`
    }, ['Select'])
  ]);
  
  // Render the character card
  return render(cardVNode) as HTMLElement;
}

function addCharacterSelectionStyles(): void {
  // Check if styles already exist
  if (document.getElementById('egypt-character-selection-styles')) return;
  
  // Create style element using the framework's h function
  const styleVNode = h('style', {
    id: 'egypt-character-selection-styles'
  }, [
    `
    .egypt-character-selection {
      margin-top: 20px;
      text-align: center;
    }
    
    .egypt-selection-title {
      font-family: 'Papyrus', 'Copperplate', fantasy;
      color: #d4af37;
      font-size: 24px;
      margin-bottom: 20px;
      text-shadow: 1px 1px 0 #000;
    }
    
    .egypt-characters-container {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .egypt-character-card {
      background-color: rgba(0, 0, 0, 0.8);
      border: 3px solid #d4af37;
      border-radius: 10px;
      padding: 15px;
      width: 200px;
      text-align: center;
      color: #f5e7c1;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .egypt-character-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
    }
    
    .egypt-character-card.selected {
      transform: scale(1.05);
      box-shadow: 0 0 20px #d4af37;
    }
    
    .egypt-character-image {
      width: 100px;
      height: 100px;
      object-fit: contain;
      margin-bottom: 10px;
      border-radius: 50%;
      background-color: rgba(212, 175, 55, 0.2);
      padding: 10px;
    }
    
    .egypt-character-name {
      font-family: 'Papyrus', 'Copperplate', fantasy;
      margin: 0 0 10px 0;
      font-size: 18px;
      color: #d4af37;
    }
    
    .egypt-character-description {
      font-size: 12px;
      margin-bottom: 10px;
      color: #f5e7c1;
    }
    
    .egypt-character-abilities {
      font-size: 12px;
      font-weight: bold;
      color: #d4af37;
      margin-bottom: 15px;
    }
    
    .egypt-select-button {
      background-color: #d4af37;
      color: #000;
      border: none;
      padding: 8px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-family: 'Papyrus', 'Copperplate', fantasy;
      font-weight: bold;
      transition: background-color 0.2s;
    }
    
    .egypt-select-button:hover {
      background-color: #f5e7c1;
    }
    `
  ]);
  
  // Render the style element
  const renderedStyle = render(styleVNode) as HTMLElement;
  
  // Add to document head
  document.head.appendChild(renderedStyle);
}

// Style a message with Egyptian theme
function styleEgyptianMessage(messageElement: HTMLElement): void {
  if (!messageElement) return;
  
  // Get message parts
  const header = messageElement.querySelector('div:first-child') as HTMLElement | null;
  const content = messageElement.querySelector('div:last-child') as HTMLElement | null;
  
  // Style message container
  messageElement.style.backgroundColor = 'rgba(74, 66, 51, 0.6)';
  messageElement.style.padding = '10px 15px';
  messageElement.style.borderRadius = '8px';
  messageElement.style.border = '1px solid rgba(212, 175, 55, 0.5)';
  messageElement.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
  messageElement.style.backdropFilter = 'blur(2px)';
  // Use standard CSS property with vendor prefix as a string
  (messageElement.style as any)['-webkit-backdrop-filter'] = 'blur(2px)';
  
  // Style header
  if (header) {
    header.style.color = '#d4af37';
    header.style.fontFamily = "'Papyrus', 'Copperplate', fantasy";
    header.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.3)';
    header.style.letterSpacing = '1px';
    
    // Style timestamp
    const timestamp = header.querySelector('span') as HTMLElement | null;
    if (timestamp) {
      timestamp.style.color = 'rgba(212, 175, 55, 0.7)';
      timestamp.style.fontStyle = 'italic';
      timestamp.style.marginLeft = '8px';
    }
  }
  
  // Style content
  if (content) {
    content.style.fontFamily = "'Papyrus', 'Copperplate', fantasy";
    content.style.lineHeight = '1.4';
    content.style.letterSpacing = '0.5px';
  }
  
  // Add hieroglyphic decoration
  const hieroglyphic = document.createElement('span');
  hieroglyphic.textContent = '☥'; // Using the actual ankh symbol instead of unicode escape
  hieroglyphic.style.position = 'absolute';
  hieroglyphic.style.bottom = '3px';
  hieroglyphic.style.right = '5px';
  hieroglyphic.style.fontSize = '10px';
  hieroglyphic.style.opacity = '0.4';
  hieroglyphic.style.color = '#d4af37';
  
  messageElement.style.position = 'relative';
  messageElement.appendChild(hieroglyphic);
}
