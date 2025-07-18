/**
 * Enhanced Egyptian Theme for Chat UI
 * This script applies additional Egyptian styling to the chat UI elements
 * when they appear in the game.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Function to apply enhanced Egyptian styling to chat UI
  const enhanceChatUI = () => {
    // Style the chat container
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.style.backgroundColor = 'rgba(74, 66, 51, 0.95)';
      chatContainer.style.backgroundImage = "url('https://www.transparenttextures.com/patterns/papyrus-dark.png')";
      chatContainer.style.backgroundBlendMode = 'overlay';
      chatContainer.style.border = '3px solid #d4af37';
      chatContainer.style.borderRadius = '8px';
      chatContainer.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.6)';
      
      // Add hieroglyphic decorations to the corners
      const style = document.createElement('style');
      style.textContent = `
        #chat-container::before,
        #chat-container::after {
          content: '☥';
          position: absolute;
          color: #d4af37;
          opacity: 0.3;
          font-size: 24px;
        }
        #chat-container::before {
          top: 5px;
          right: 10px;
        }
        #chat-container::after {
          bottom: 5px;
          left: 10px;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Style the chat header
    const chatHeader = document.querySelector('.chat-header');
    if (chatHeader) {
      chatHeader.style.background = 'linear-gradient(to right, #4a4233, #5a5243, #4a4233)';
      chatHeader.style.backgroundImage = "url('https://www.transparenttextures.com/patterns/papyrus-dark.png')";
      chatHeader.style.backgroundBlendMode = 'overlay';
      chatHeader.style.borderBottom = '2px solid #d4af37';
      chatHeader.style.borderRadius = '8px 8px 0 0';
      chatHeader.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      
      // Style the header title
      const headerTitle = chatHeader.querySelector('div');
      if (headerTitle && !headerTitle.textContent.includes('☥')) {
        headerTitle.textContent = '☥ GAME CHAT ☥';
        headerTitle.style.color = '#f5e7c1'; // Lighter gold color for better visibility
        headerTitle.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
        headerTitle.style.fontWeight = 'bold';
        headerTitle.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.5), 0 0 5px rgba(212, 175, 55, 0.5)';
        headerTitle.style.letterSpacing = '2px';
      }
    }
    
    // Style the chat input
    const chatInput = document.querySelector('.chat-input');
    if (chatInput) {
      chatInput.setAttribute('placeholder', 'Inscribe your hieroglyphs... ☥');
      chatInput.style.border = '2px solid #d4af37';
      chatInput.style.backgroundColor = 'rgba(74, 66, 51, 0.8)';
      chatInput.style.backgroundImage = "url('https://www.transparenttextures.com/patterns/papyrus.png')";
      chatInput.style.backgroundBlendMode = 'overlay';
      chatInput.style.color = '#d4af37';
      chatInput.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
      chatInput.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.4)';
      chatInput.style.borderRadius = '4px';
      chatInput.style.padding = '10px 15px';
    }
    
    // Style the send button
    const sendButton = document.querySelector('.chat-send-button');
    if (sendButton) {
      sendButton.textContent = 'Send ☥';
      sendButton.style.background = 'linear-gradient(to bottom, #f5e7c1, #d4af37)';
      sendButton.style.color = '#4a4233';
      sendButton.style.border = '2px solid #8B7513';
      sendButton.style.borderRadius = '8px';
      sendButton.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
      sendButton.style.fontWeight = 'bold';
      sendButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.5), 0 0 5px rgba(212, 175, 55, 0.3)';
      sendButton.style.textShadow = '0 1px 1px rgba(255, 255, 255, 0.3)';
      sendButton.style.padding = '10px 18px';
      
      // Add hover effect
      sendButton.addEventListener('mouseover', () => {
        sendButton.style.background = 'linear-gradient(to bottom, #f5e7c1, #d4af37)';
        sendButton.style.boxShadow = '0 0 8px rgba(212, 175, 55, 0.6)';
      });
      
      sendButton.addEventListener('mouseout', () => {
        sendButton.style.background = 'linear-gradient(to bottom, #d4af37, #b38728)';
        sendButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.5)';
      });
    }
    
    // Style the chat input container
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer) {
      chatInputContainer.style.background = 'linear-gradient(to bottom, #4a4233, #5c5243)';
      chatInputContainer.style.backgroundImage = "url('https://www.transparenttextures.com/patterns/papyrus-dark.png')";
      chatInputContainer.style.backgroundBlendMode = 'overlay';
      chatInputContainer.style.borderTop = '2px solid #d4af37';
      chatInputContainer.style.borderBottomLeftRadius = '8px';
      chatInputContainer.style.borderBottomRightRadius = '8px';
      chatInputContainer.style.padding = '12px';
      chatInputContainer.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    }
    
    // Style the chat messages container
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
      chatMessages.style.backgroundColor = 'rgba(74, 66, 51, 0.6)';
      chatMessages.style.backgroundImage = "url('https://www.transparenttextures.com/patterns/papyrus.png')";
      chatMessages.style.backgroundBlendMode = 'overlay';
      chatMessages.style.padding = '15px';
      
      // Add custom scrollbar styling
      const scrollbarStyle = document.createElement('style');
      scrollbarStyle.textContent = `
        .chat-messages::-webkit-scrollbar {
          width: 10px;
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
      `;
      document.head.appendChild(scrollbarStyle);
    }
  };

  // Apply styling initially after a delay to ensure elements are loaded
  setTimeout(enhanceChatUI, 1000);
  
  // Set up a mutation observer to detect when chat UI elements appear
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any chat elements were added
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
          enhanceChatUI();
        }
      }
    });
  });
  
  // Start observing the document body for changes
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also apply styling when the chat toggle button is clicked
  document.addEventListener('click', (event) => {
    if (event.target && (event.target.id === 'chat-toggle-button' || 
        (event.target instanceof HTMLElement && event.target.closest('#chat-toggle-button')))) {
      // Wait a moment for the chat to appear
      setTimeout(enhanceChatUI, 100);
    }
  });
});
