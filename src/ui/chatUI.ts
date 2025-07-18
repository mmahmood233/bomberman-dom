// Chat UI rendering
import { h, render } from '../../framework/dom';
import { eventBus } from '../../framework/events';
import { ChatEventData } from '../multiplayer/events';
import { sendChatMessage, initChat, formatMessageTime, addSystemMessage, getChatHistory } from '../multiplayer/chat';
import { getPlayerId } from '../main';

// UI elements
let chatContainer: HTMLElement | null = null;
let messagesContainer: HTMLElement | null = null;
let chatInput: HTMLInputElement | null = null;
let chatToggleButton: HTMLElement | null = null;

// Chat UI state
let isChatVisible = false;
let isMinimized = false;
let isInitialized = false;

// Initialize chat UI
export function initChatUI(parentContainer: HTMLElement): void {
  // Prevent multiple initializations
  if (isInitialized || document.getElementById('chat-container')) {
    console.log('Chat UI already initialized, skipping');
    return;
  }
  
  // Check if we're on the login screen by looking for the nickname input
  const nicknameInput = document.querySelector('input[placeholder="Enter your nickname"]');
  
  // Don't initialize chat UI on login screen
  if (nicknameInput) {
    console.log('On login screen, not initializing chat UI');
    return;
  }
  
  // Mark as initialized only if we're not on the login screen
  isInitialized = true;
  // Initialize chat logic with player nickname
  // This should be called after player has set their nickname
  const playerNickname = localStorage.getItem('playerNickname') || 'Player';
  initChat(playerNickname);
  
  // Create chat container using the framework's h function
  const chatContainerVNode = h('div', {
    id: 'chat-container',
    class: 'chat-container',
    style: `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 350px;
      height: 350px;
      background-color: rgba(74, 66, 51, 0.9);
      border: 3px solid #d4af37;
      border-radius: 8px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(212, 175, 55, 0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s ease;
      z-index: 1000;
      background-image: url('https://www.transparenttextures.com/patterns/papyrus.png');
      background-blend-mode: overlay;
      display: none;
    `
  }, []);
  
  // Render the chat container
  chatContainer = render(chatContainerVNode) as HTMLElement;
  
  // Create chat title using the framework's h function
  const chatTitleVNode = h('div', {
    style: `
      font-weight: bold;
      font-size: 18px;
      font-family: 'Papyrus', 'Copperplate', fantasy;
      color: #d4af37;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
      letter-spacing: 2px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
    `
  }, ['☥ GAME CHAT ☥']);
  
  // Create minimize button using the framework's h function
  const minimizeButtonVNode = h('button', {
    style: `
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
    `,
    onclick: toggleMinimize,
    onmouseover: (e: Event) => {
      const el = e.target as HTMLElement;
      el.style.color = '#f5e7c1';
      el.style.borderColor = '#f5e7c1';
      el.style.boxShadow = '0 0 5px rgba(212, 175, 55, 0.5)';
      el.style.animation = 'glowPulse 1.5s infinite';
    },
    onmouseout: (e: Event) => {
      const el = e.target as HTMLElement;
      el.style.color = '#d4af37';
      el.style.borderColor = '#d4af37';
      el.style.boxShadow = 'none';
      el.style.animation = 'none';
    }
  }, ['−']);
  
  // Create chat header using the framework's h function
  const chatHeaderVNode = h('div', {
    class: 'chat-header',
    style: `
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
    `
  }, [
    // Add grip icon for visual dragging cue
    h('div', {
      style: `
        font-size: 22px;
        color: #d4af37;
        margin-right: 10px;
        display: flex;
        align-items: center;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        animation: glowPulse 3s infinite;
      `
    }, ['☥']),
    chatTitleVNode,
    minimizeButtonVNode
  ]);
  
  // Render the chat header
  const chatHeader = render(chatHeaderVNode) as HTMLElement;
  
  // Create messages container using the framework's h function
  const messagesContainerVNode = h('div', {
    class: 'chat-messages',
    style: `
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
    `
  }, []);
  
  // Render the messages container
  messagesContainer = render(messagesContainerVNode) as HTMLElement;
  
  // Add custom scrollbar styles using the framework's h function
  const styleVNode = h('style', {}, [
    `
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
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes glowPulse {
      0% { text-shadow: 0 0 5px rgba(212, 175, 55, 0.5); }
      50% { text-shadow: 0 0 15px rgba(212, 175, 55, 0.8); }
      100% { text-shadow: 0 0 5px rgba(212, 175, 55, 0.5); }
    }
    `
  ]);
  
  // Render and append the style
  document.head.appendChild(render(styleVNode) as HTMLElement);
  
  // Create chat input using the framework's h function
  const chatInputVNode = h('input', {
    class: 'chat-input',
    type: 'text',
    placeholder: 'Write on papyrus... ✍',
    style: `
      flex: 1;
      padding: 8px 12px;
      border: 2px solid rgba(212, 175, 55, 0.5);
      border-radius: 4px;
      background-color: rgba(74, 66, 51, 0.6);
      color: #f5e7c1;
      outline: none;
      transition: all 0.3s ease;
      font-family: 'Papyrus', 'Copperplate', fantasy;
      margin-right: 8px;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
    `,
    onfocus: (e: Event) => {
      (e.target as HTMLElement).style.borderColor = '#d4af37';
      (e.target as HTMLElement).style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 8px rgba(212, 175, 55, 0.6)';
    },
    onblur: (e: Event) => {
      (e.target as HTMLElement).style.borderColor = 'rgba(212, 175, 55, 0.5)';
      (e.target as HTMLElement).style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.2)';
    },
    onkeydown: handleInputKeydown
  }, []);
  
  // Create send button using the framework's h function
  const sendButtonVNode = h('button', {
    class: 'chat-send-button',
    style: `
      padding: 8px 16px;
      background: linear-gradient(to bottom, #d4af37, #b38728);
      color: #4a4233;
      border: 1px solid #8B7513;
      border-radius: 20px;
      cursor: pointer;
      font-family: 'Papyrus', 'Copperplate', fantasy;
      font-weight: bold;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    `,
    onclick: handleSendClick,
    onmouseover: (e: Event) => {
      const el = e.target as HTMLElement;
      el.style.background = 'linear-gradient(to bottom, #f5e7c1, #d4af37)';
      el.style.boxShadow = '0 0 8px rgba(212, 175, 55, 0.6)';
    },
    onmouseout: (e: Event) => {
      const el = e.target as HTMLElement;
      el.style.background = 'linear-gradient(to bottom, #d4af37, #b38728)';
      el.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    },
    onmousedown: (e: Event) => {
      (e.target as HTMLElement).style.transform = 'scale(0.95)';
    },
    onmouseup: (e: Event) => {
      (e.target as HTMLElement).style.transform = 'scale(1)';
    }
  }, ['Send ☥']);
  
  // Create chat input container using the framework's h function
  const chatInputContainerVNode = h('div', {
    class: 'chat-input-container',
    style: `
      display: flex;
      padding: 10px;
      background: linear-gradient(to bottom, #4a4233, #5c5243);
      border-top: 2px solid #d4af37;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    `
  }, [chatInputVNode, sendButtonVNode]);
  
  // Render the input container
  const inputContainer = render(chatInputContainerVNode) as HTMLElement;
  
  // Store reference to the rendered chat input
  chatInput = inputContainer.querySelector('input') as HTMLInputElement;
  
  // Create chat toggle button (always visible)
  // First, remove any existing chat buttons to prevent duplicates
  const existingButton = document.querySelector('.chat-toggle');
  if (existingButton) {
    existingButton.remove();
  }
  
  // Only create chat toggle button if not on login screen
  // Create chat toggle button using the framework's h function
  const chatToggleButtonVNode = h('button', {
    class: 'chat-toggle',
    id: 'chat-toggle-button', // Add an ID for easier selection
    style: `
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
      display: none !important; /* Hidden by default, will be shown after joining lobby */
      font-family: 'Papyrus', 'Copperplate', fantasy !important;
      font-size: 14px !important;
      text-transform: uppercase !important;
      letter-spacing: 1px !important;
    `,
    onmouseover: (e: Event) => {
      const el = e.target as HTMLElement;
      el.style.background = 'linear-gradient(to bottom, #f5e7c1, #d4af37)';
      el.style.boxShadow = '0 0 10px rgba(212, 175, 55, 0.5)';
    },
    onmouseout: (e: Event) => {
      const el = e.target as HTMLElement;
      el.style.background = 'linear-gradient(to bottom, #d4af37, #b38728)';
      el.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.3)';
    },
    onmousedown: (e: Event) => {
      (e.target as HTMLElement).style.transform = 'scale(0.95)';
    },
    onmouseup: (e: Event) => {
      (e.target as HTMLElement).style.transform = 'scale(1)';
    },
    onclick: toggleChat
  }, ['☥ Chat']);
  
  // Render the chat toggle button
  chatToggleButton = render(chatToggleButtonVNode) as HTMLElement;
  
  // Assemble the chat components if container exists
  if (chatContainer) {
    // Render the chat header if not already done
    const chatHeader = document.querySelector('.chat-header') as HTMLElement;
    if (chatHeader && messagesContainer && inputContainer) {
      // Assemble the chat components
      chatContainer.appendChild(chatHeader);
      chatContainer.appendChild(messagesContainer);
      chatContainer.appendChild(inputContainer);
      
      // Add chat container and toggle button to parent container
      document.body.appendChild(chatContainer);
      document.body.appendChild(chatToggleButton);
    }
  }
  
  // Listen for chat messages
  eventBus.on('chat:updated', (data: { history: ChatEventData[] }) => {
    if (data.history.length > 0) {
      // Only add the most recent message
      addMessageToUI(data.history[0]);
    }
  });
  
  // Make chat draggable
  if (chatContainer && chatHeader) {
    makeDraggable(chatContainer, chatHeader);
  }
  
  // Load chat history
  loadChatHistory();
  
  // Add a welcome message
  addSystemMessage('Welcome to Bomberman Chat! ☥ May the gods favor your battles! ☥');
  
  // Apply Egyptian theme to chat UI
  eventBus.emit('chat:initialized');
}

// Handle input keydown event (submit on Enter)
function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && chatInput && chatInput.value.trim() !== '') {
    const message = chatInput.value.trim();
    chatInput.value = '';
    
    // Send message
    sendChatMessage(message);
  }
}

// Handle send button click
function handleSendClick(): void {
  if (chatInput && chatInput.value.trim() !== '') {
    const message = chatInput.value.trim();
    chatInput.value = '';
    
    // Send message
    sendChatMessage(message);
  }
}

// Toggle chat visibility
export function toggleChat(): void {
  if (!chatContainer || !chatToggleButton) return;
  
  isChatVisible = !isChatVisible;
  
  // Emit chat toggled event for theme application
  eventBus.emit('chat:toggled', { visible: isChatVisible });
  
  if (isChatVisible) {
    chatContainer.style.display = 'flex';
    chatToggleButton.textContent = '☥ Hide Chat';
    
    // Scroll to bottom of messages
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Focus input
    if (chatInput) {
      chatInput.focus();
    }
  } else {
    chatContainer.style.display = 'none';
    chatToggleButton.textContent = '☥ Chat';
  }
}

// Toggle chat minimize state
function toggleMinimize(): void {
  if (!chatContainer) return;
  
  isMinimized = !isMinimized;
  
  if (isMinimized) {
    chatContainer.style.height = '40px';
    if (messagesContainer) messagesContainer.style.display = 'none';
    const inputContainer = chatContainer.querySelector('.chat-input-container');
    if (inputContainer) (inputContainer as HTMLElement).style.display = 'none';
  } else {
    chatContainer.style.height = '350px';
    if (messagesContainer) messagesContainer.style.display = 'flex';
    const inputContainer = chatContainer.querySelector('.chat-input-container');
    if (inputContainer) (inputContainer as HTMLElement).style.display = 'flex';
  }
}

// Add a message to the UI
function addMessageToUI(message: ChatEventData): void {
  if (!messagesContainer) return;
  
  // Get current player ID
  const currentPlayerId = getPlayerId();
  const isLocalUser = message.playerId === currentPlayerId || message.playerId === 'system';
  const isSystem = message.playerId === 'system';
  
  // Get player number if available
  let playerNumber = '';
  if (!isSystem) {
    if (isLocalUser) {
      playerNumber = localStorage.getItem('playerNumber') || '';
    } else if (message.playerNumber) {
      playerNumber = message.playerNumber.toString();
    }
  }
  
  // Format player label
  const playerLabel = isSystem ? 'System' : 
    isLocalUser ? `You (P${playerNumber})` : 
    playerNumber ? `${message.nickname} (P${playerNumber})` : message.nickname;
  
  // Format timestamp
  const timestamp = formatMessageTime(message.timestamp);
  
  // Create header with player name and timestamp using h function
  const headerVNode = h('div', {
    style: `
      font-weight: bold;
      color: ${isSystem ? '#d4af37' : isLocalUser ? '#d4af37' : '#d4af37'};
      margin-bottom: 5px;
      text-align: ${isLocalUser ? 'right' : 'left'};
      font-family: 'Papyrus', 'Copperplate', fantasy;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
      letter-spacing: 1px;
    `
  }, [
    playerLabel,
    h('span', {
      style: 'color: rgba(212, 175, 55, 0.7); font-size: 0.8em; margin-left: 8px; font-weight: normal; font-style: italic;'
    }, [timestamp])
  ]);
  
  // Create message content using h function
  const contentVNode = h('div', {
    style: `
      color: #fff;
      text-align: ${isLocalUser ? 'right' : 'left'};
      font-family: 'Papyrus', 'Copperplate', fantasy;
      line-height: 1.4;
      letter-spacing: 0.5px;
    `
  }, [message.message]);
  
  // Create message element using h function
  const messageVNode = h('div', {
    class: 'chat-message',
    style: `
      background-color: ${isSystem ? 'rgba(212, 175, 55, 0.25)' : isLocalUser ? 'rgba(74, 66, 51, 0.6)' : 'rgba(74, 66, 51, 0.4)'};
      padding: 10px 15px;
      border-radius: 8px;
      word-break: break-word;
      max-width: 85%;
      align-self: ${isLocalUser ? 'flex-end' : 'flex-start'};
      margin-left: ${isLocalUser ? 'auto' : '0'};
      margin-right: ${isLocalUser ? '0' : 'auto'};
      position: relative;
      animation: fadeIn 0.3s ease;
      border: 1px solid ${isSystem ? '#d4af37' : isLocalUser ? 'rgba(212, 175, 55, 0.5)' : 'rgba(212, 175, 55, 0.3)'};
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    `
  }, [headerVNode, contentVNode]);
  
  // Render and add message to container
  if (messagesContainer) {
    const messageElement = render(messageVNode) as HTMLElement;
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// Load chat history
function loadChatHistory(): void {
  const history = getChatHistory();
  
  // Add each message to UI
  history.forEach(message => {
    addMessageToUI(message);
  });
}

// Make an element draggable with smooth movement
function makeDraggable(element: HTMLElement, handle: HTMLElement): void {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  // Set cursor style to indicate draggable
  handle.style.cursor = 'move';
  
  handle.onmousedown = dragMouseDown;
  handle.ontouchstart = dragTouchDown;
  
  function dragMouseDown(e: MouseEvent) {
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Add dragging class for visual feedback
    element.classList.add('dragging');
    
    // Stop transitions during drag for smoother movement
    element.style.transition = 'none';
    
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function dragTouchDown(e: TouchEvent) {
    e.preventDefault();
    // Get the touch position at startup
    pos3 = e.touches[0].clientX;
    pos4 = e.touches[0].clientY;
    
    // Add dragging class for visual feedback
    element.classList.add('dragging');
    
    // Stop transitions during drag for smoother movement
    element.style.transition = 'none';
    
    document.ontouchend = closeDragElement;
    document.ontouchmove = elementTouchDrag;
  }
  
  function elementDrag(e: MouseEvent) {
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Set the element's new position
    element.style.top = (element.offsetTop - pos2) + 'px';
    element.style.left = (element.offsetLeft - pos1) + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  function elementTouchDrag(e: TouchEvent) {
    e.preventDefault();
    // Calculate the new touch position
    pos1 = pos3 - e.touches[0].clientX;
    pos2 = pos4 - e.touches[0].clientY;
    pos3 = e.touches[0].clientX;
    pos4 = e.touches[0].clientY;
    
    // Set the element's new position
    element.style.top = (element.offsetTop - pos2) + 'px';
    element.style.left = (element.offsetLeft - pos1) + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  function closeDragElement() {
    // Stop moving when mouse/touch is released
    document.onmouseup = null;
    document.onmousemove = null;
    document.ontouchend = null;
    document.ontouchmove = null;
    
    // Restore transition
    element.style.transition = 'height 0.3s ease';
    
    // Remove dragging class
    element.classList.remove('dragging');
  }
}
