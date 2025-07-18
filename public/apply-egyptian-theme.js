/**
 * Egyptian Theme Application Script
 * This script applies Egyptian theme styling to the chat UI elements
 * when the DOM is loaded and when elements are dynamically added.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Wait for chat UI to be initialized
  const applyEgyptianTheme = () => {
    // Apply theme to chat toggle button if it exists
    const chatToggleButton = document.getElementById('chat-toggle-button');
    if (chatToggleButton) {
      if (chatToggleButton.textContent === 'Chat') {
        chatToggleButton.textContent = '☥ Pharaoh Chat';
      } else if (chatToggleButton.textContent === 'Hide Chat') {
        chatToggleButton.textContent = '☥ Hide Papyrus';
      }
      
      // Add gold color and styling
      chatToggleButton.style.color = '#4a4233';
      chatToggleButton.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
      chatToggleButton.style.fontWeight = 'bold';
    }

    // Apply theme to chat container
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      // Add hieroglyphic decorations to chat header
      const chatHeader = chatContainer.querySelector('.chat-header');
      if (chatHeader) {
        const headerTitle = chatHeader.querySelector('div');
          headerTitle.textContent = '☥ GAME CHAT ☥';
          headerTitle.style.color = '#d4af37';
          headerTitle.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
          headerTitle.style.fontWeight = 'bold';
          headerTitle.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.5)';
          headerTitle.style.letterSpacing = '2px';
        
      }

      // Style chat input placeholder and send button
      const chatInput = chatContainer.querySelector('.chat-input');
      if (chatInput) {
        chatInput.placeholder = 'Inscribe your hieroglyphs... ☥';
        chatInput.style.color = '#d4af37';
        chatInput.style.border = '2px solid #d4af37';
        chatInput.style.backgroundColor = 'rgba(74, 66, 51, 0.8)';
        chatInput.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.4)';
      }
      
      // Style send button
      const sendButton = chatContainer.querySelector('.chat-send-button');
      if (sendButton) {
        sendButton.textContent = 'Send ☥';
        sendButton.style.background = 'linear-gradient(to bottom, #d4af37, #b38728)';
        sendButton.style.color = '#4a4233';
        sendButton.style.border = '2px solid #8B7513';
        sendButton.style.borderRadius = '8px';
        sendButton.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
        sendButton.style.fontWeight = 'bold';
        sendButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.5)';
        sendButton.style.textShadow = '0 1px 1px rgba(255, 255, 255, 0.3)';
      }
    }
  };

  // Apply theme initially after a short delay
  setTimeout(applyEgyptianTheme, 1000);

  // Set up a mutation observer to watch for chat UI changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any added nodes are chat-related
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            if (element.id === 'chat-container' || 
                element.id === 'chat-toggle-button' ||
                element.classList?.contains('chat-message')) {
              // Apply Egyptian theme to new elements
              setTimeout(applyEgyptianTheme, 100);
            }
          }
        });
      }
    });
  });

  // Start observing the document body for changes
  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for specific game events that might affect the chat UI
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'chat:toggled') {
      setTimeout(applyEgyptianTheme, 100);
    }
  });
});
