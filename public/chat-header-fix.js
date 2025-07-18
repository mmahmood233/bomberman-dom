/**
 * Chat Header Text Fix
 * This script specifically targets the chat header text to update its styling
 */

document.addEventListener('DOMContentLoaded', () => {
  // Function to update the chat header text
  const updateChatHeader = () => {
    // Find the chat header text element
    const chatHeaderText = document.querySelector('.chat-header > div');
    if (chatHeaderText) {
      // Change the text to include ankh symbols
        chatHeaderText.textContent = '☥ GAME CHAT ☥';
      
      
      // Apply enhanced styling
      chatHeaderText.style.color = '#f5e7c1';
      chatHeaderText.style.fontFamily = "'Cinzel Decorative', 'Papyrus', 'Copperplate', fantasy";
      chatHeaderText.style.fontWeight = 'bold';
      chatHeaderText.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.5), 0 0 5px rgba(212, 175, 55, 0.5)';
      chatHeaderText.style.letterSpacing = '2px';
    }
  };

  // Try to update immediately in case the chat is already open
  updateChatHeader();
  
  // Set up a mutation observer to watch for when the chat appears
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if the chat header has been added
        const chatHeader = document.querySelector('.chat-header');
        if (chatHeader) {
          updateChatHeader();
        }
      }
    });
  });
  
  // Start observing the document body for changes
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also check when the chat toggle button is clicked
  document.addEventListener('click', (event) => {
    if (event.target && (event.target.id === 'chat-toggle-button' || 
        (event.target instanceof HTMLElement && event.target.closest('#chat-toggle-button')))) {
      // Wait a moment for the chat to appear
      setTimeout(updateChatHeader, 100);
    }
  });
});
