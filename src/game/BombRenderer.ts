// Bomb visual representation and rendering
import { h, render, VNode } from '../../framework/dom';
import { Bomb } from '../entities/bomb';
import { eventBus } from '../../framework/events';

// Import TILE_SIZE constant
const TILE_SIZE = 40; // Tile size in pixels

export class BombRenderer {
  private explosionElements: Map<string, { 
    element: HTMLElement, 
    timestamp: number 
  }> = new Map();
  private explosionDuration: number = 1000; // Explosion effect lasts 1 second

  // Track which bombs we've already animated to prevent duplicates
  private animatedBombs: Set<string> = new Set();
  
  constructor(private gameContainer: HTMLElement) {
    // Listen for bomb explosion events
    eventBus.on('bomb:explode', this.handleBombExplosion.bind(this));
    
    // Listen for bomb thrown events - primary method
    eventBus.on('bomb:thrown', this.handleBombThrown.bind(this));
    
    // Listen for bomb:placed events as a fallback - only if bomb:thrown wasn't received
    eventBus.on('bomb:placed', this.handleBombPlaced.bind(this));
    
    // Also listen for DOM events as backup - only for bomb:thrown
    window.addEventListener('bomb:thrown', (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        console.log('Received DOM bomb:thrown event:', customEvent.detail);
        this.handleBombThrown(customEvent.detail);
      }
    });
    
    // We don't need both DOM event listeners - removing this one
    // window.addEventListener('bomb:placed', (e: Event) => {
    //   const customEvent = e as CustomEvent;
    //   if (customEvent.detail) {
    //     console.log('Received DOM bomb:placed event:', customEvent.detail);
    //     this.handleBombPlaced(customEvent.detail);
    //   }
    // });

    // Set up animation loop for bomb countdown visualization
    this.startAnimationLoop();
    
    // Add CSS styles for bombs and explosions
    this.addStyles();
  }

  // Render all bombs on the map
  public renderBombs(bombs: Bomb[]): void {
    // Remove any old bomb elements that no longer exist
    this.removeOldBombElements(bombs);
    
    // Render each bomb
    bombs.forEach(bomb => {
      this.renderBomb(bomb);
    });
  }

  // Render a single bomb
  private renderBomb(bomb: Bomb): void {
    const bombId = `bomb-${bomb.ownerId}-${bomb.x}-${bomb.y}`;
    let bombElement = document.getElementById(bombId);
    
    // If the bomb element doesn't exist yet, create it
    if (!bombElement && !bomb.hasExploded()) {
      // Create the bomb element using the framework's h function
      const bombVNode = h('div', {
        id: bombId,
        class: 'bomb',
        style: `
          left: ${bomb.x * 40}px;
          top: ${bomb.y * 40}px;
        `
      }, [
        // Create the timer element
        h('div', {
          class: 'bomb-timer'
        }, [])
      ]);
      
      // Render the bomb element using the framework's render function
      const renderedBomb = render(bombVNode) as HTMLElement;
      
      // Add to the container
      this.gameContainer.appendChild(renderedBomb);
    }
    
    // Update bomb timer visualization if bomb still exists
    if (bombElement && !bomb.hasExploded()) {
      const timerElement = bombElement.querySelector('.bomb-timer') as HTMLElement;
      if (timerElement) {
        const remainingTime = bomb.getRemainingTime();
        const timerPercentage = (remainingTime / 3000) * 100;
        timerElement.style.width = `${timerPercentage}%`;
      }
    }
    
    // We don't want to create animations here - they're triggered by the bomb:thrown event
  }

  // Create a visible bomb throwing animation from player to bomb location
  private createBombThrowAnimation(playerX: number, playerY: number, bombX: number, bombY: number): void {
    console.log('Creating bomb throw animation:', { playerX, playerY, bombX, bombY });
    
    // Calculate the start and end positions for the animation
    const startX = playerX * 40 + 20;
    const startY = playerY * 40 + 20;
    const endX = bombX * 40 + 20;
    const endY = bombY * 40 + 20;
    
    // Calculate direction for animation
    const directionX = endX - startX;
    const directionY = endY - startY;
    
    // Determine primary direction for animation styling
    let primaryDirection = 'right';
    
    if (Math.abs(directionX) > Math.abs(directionY)) {
      // Horizontal movement is predominant
      primaryDirection = directionX > 0 ? 'right' : 'left';
    } else {
      // Vertical movement is predominant
      primaryDirection = directionY > 0 ? 'down' : 'up';
    }
    
    console.log('Primary explosion direction:', primaryDirection);
    console.log('Animation coordinates:', { startX, startY, endX, endY });
    
    // Create a unique ID for this bomb throw animation
    const bombThrowId = `bomb-throw-${Date.now()}`;
    
    // Find player element to ensure animation starts from player's position
    // First try to find by exact position
    const playerSelector = `.player[data-x="${Math.floor(playerX)}"][data-y="${Math.floor(playerY)}"]`;
    const altPlayerSelector = `.player[style*="left: ${Math.floor(startX - 20)}px"][style*="top: ${Math.floor(startY - 20)}px"]`;
    
    console.log('Looking for player element with selectors:', { playerSelector, altPlayerSelector });
    
    // Get all player elements for more robust selection
    const allPlayers = document.querySelectorAll('.player');
    console.log(`Found ${allPlayers.length} total player elements`);
    
    // Get the local player ID from localStorage
    const localPlayerId = localStorage.getItem('playerId');
    
    // Try to find the correct player element using multiple strategies
    let playerElement: HTMLElement | null = null;
    
    // Strategy 1: Try by exact position selectors
    const foundElement = document.querySelector(playerSelector) || document.querySelector(altPlayerSelector);
    if (foundElement) {
      playerElement = foundElement as HTMLElement;
    }
    
    // Strategy 2: Find player by position on the grid
    if (!playerElement) {
      // Get all player elements
      const playerElements = Array.from(allPlayers) as HTMLElement[];
      
      // Sort players by distance to the bomb's starting position
      const sortedPlayers = playerElements.sort((a, b) => {
        const aStyle = window.getComputedStyle(a);
        const bStyle = window.getComputedStyle(b);
        
        const aLeft = parseInt(aStyle.left, 10) / TILE_SIZE || 0;
        const aTop = parseInt(aStyle.top, 10) / TILE_SIZE || 0;
        const bLeft = parseInt(bStyle.left, 10) / TILE_SIZE || 0;
        const bTop = parseInt(bStyle.top, 10) / TILE_SIZE || 0;
        
        const aDistance = Math.sqrt(Math.pow(aLeft - playerX, 2) + Math.pow(aTop - playerY, 2));
        const bDistance = Math.sqrt(Math.pow(bLeft - playerX, 2) + Math.pow(bTop - playerY, 2));
        
        return aDistance - bDistance;
      });
      
      // Use the closest player
      if (sortedPlayers.length > 0) {
        playerElement = sortedPlayers[0];
        console.log('Using closest player element by position:', playerElement.id);
      }
    }
    
    // Strategy 4: Last resort - use any player element
    if (!playerElement && allPlayers.length > 0) {
      playerElement = allPlayers[0] as HTMLElement;
      console.log('Falling back to first player element:', playerElement.id);
    }
    
    console.log('Player element found:', playerElement ? 'Yes' : 'No');
    
    // Adjust starting position if player element is found
    let adjustedStartX = startX;
    let adjustedStartY = startY;
    
    if (playerElement) {
      try {
        const playerRect = playerElement.getBoundingClientRect();
        const gameContainerRect = this.gameContainer.getBoundingClientRect();
        
        // Calculate position relative to game container
        adjustedStartX = playerRect.left - gameContainerRect.left + playerRect.width / 2;
        adjustedStartY = playerRect.top - gameContainerRect.top + playerRect.height / 2;
        console.log('Adjusted start position from player element:', { adjustedStartX, adjustedStartY });
      } catch (error) {
        console.error('Error getting player element position:', error);
        // Fallback - use the center of the player's grid cell
        console.log('Using fallback position for animation start due to error');
      }
    } else {
      // Fallback - use the center of the player's grid cell
      console.log('Using fallback position for animation start - no player element found');
    }
    
    // Create the bomb throw element using virtual DOM with direction-specific styling
    const bombThrowVNode = h('div', {
      id: bombThrowId,
      class: `bomb-throw-animation direction-${primaryDirection}`,
      style: `
        position: absolute;
        left: ${adjustedStartX}px;
        top: ${adjustedStartY}px;
        width: 30px;
        height: 30px;
        z-index: 2000;
        transform: translate(-50%, -50%);
        pointer-events: none;
      `
    }, [
      // Bomb image with rotation animation
      h('img', {
        src: '/img/Bomb.png',
        class: `bomb-image direction-${primaryDirection}`,
        style: `
          position: absolute;
          width: 32px;
          height: 32px;
          filter: drop-shadow(0 0 4px rgba(255, 200, 0, 0.7));
          animation: bombRotation${primaryDirection.charAt(0).toUpperCase() + primaryDirection.slice(1)} 0.8s linear infinite;
        `
      })
    ]);
    
    // Render the bomb throw element
    const renderedBombThrow = render(bombThrowVNode) as HTMLElement;
    
    // Add to the game container
    this.gameContainer.appendChild(renderedBombThrow);
    console.log('Added bomb throw element to game container');
    
    // No sparkle trail - removed as per user request
    
    // Animate the bomb moving from player to target
    const animationDuration = 800; // ms - longer duration for better visibility
    const startTime = Date.now();
    const distanceMultiplier = 1.2; // Reduced from 2 to keep bomb closer to character
    const arcHeight = 40; // Height of the arc for the throw
    const animateFrame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      
      // Use easeOutQuad for smoother deceleration
      const easeOutProgress = 1 - (1 - progress) * (1 - progress);
      
      // Calculate current position based on explosion direction
      let currentX, currentY;
      let arcOffset = 0;
      
      // Add arc trajectory - highest at middle of animation
      if (progress > 0 && progress < 1) {
        // Sin curve for arc trajectory - peak in the middle
        arcOffset = Math.sin(progress * Math.PI) * arcHeight;
      }
      
      // Move in the primary direction of explosion
      switch (primaryDirection) {
        case 'right':
          // Move horizontally to the right
          currentX = adjustedStartX + easeOutProgress * Math.abs(endX - adjustedStartX) * distanceMultiplier;
          currentY = adjustedStartY - arcOffset; // Arc goes upward
          break;
        case 'left':
          // Move horizontally to the left
          currentX = adjustedStartX - easeOutProgress * Math.abs(endX - adjustedStartX) * distanceMultiplier;
          currentY = adjustedStartY - arcOffset; // Arc goes upward
          break;
        case 'down':
          // Move vertically downward
          currentX = adjustedStartX - arcOffset; // Arc goes to the left
          currentY = adjustedStartY + easeOutProgress * Math.abs(endY - adjustedStartY) * distanceMultiplier;
          break;
        case 'up':
          // Move vertically upward
          currentX = adjustedStartX + arcOffset; // Arc goes to the right
          currentY = adjustedStartY - easeOutProgress * Math.abs(endY - adjustedStartY) * distanceMultiplier;
          break;
        default:
          // Fallback to direct path
          currentX = adjustedStartX + (endX - adjustedStartX) * easeOutProgress;
          currentY = adjustedStartY + (endY - adjustedStartY) * easeOutProgress - arcOffset;
      }
      
      // Update bomb position
      if (renderedBombThrow) {
        renderedBombThrow.style.left = `${currentX}px`;
        renderedBombThrow.style.top = `${currentY}px`;
      }
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        // Create landing flash effect at the end of animation
        setTimeout(() => {
          const flashVNode = h('div', {
            id: `flash-${bombThrowId}`,
            class: 'bomb-landing-flash',
            style: `
              position: absolute;
              left: ${endX}px;
              top: ${endY}px;
              width: 40px;
              height: 40px;
              background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,200,0,0.7) 50%, transparent 100%);
              border-radius: 50%;
              transform: translate(-50%, -50%);
              z-index: 998;
              animation: flash 300ms ease-out forwards;
              pointer-events: none;
            `
          }, []);
          
          const renderedFlash = render(flashVNode) as HTMLElement;
          this.gameContainer.appendChild(renderedFlash);
          
          // Remove the bomb throw animation and flash after it completes
          setTimeout(() => {
            if (renderedBombThrow && renderedBombThrow.parentNode) {
              renderedBombThrow.parentNode.removeChild(renderedBombThrow);
            }
            if (renderedFlash && renderedFlash.parentNode) {
              renderedFlash.parentNode.removeChild(renderedFlash);
            }
          }, 300);
        }, 0);
      }
    };
    
    // Start the animation
    requestAnimationFrame(animateFrame);
    console.log('Animation started');
  }

  // Remove bomb elements that no longer exist in the game state
  private removeOldBombElements(currentBombs: Bomb[]): void {
    const bombElements = this.gameContainer.querySelectorAll('.bomb');
    
    bombElements.forEach(element => {
      const bombId = element.id;
      const [_, ownerId, xStr, yStr] = bombId.split('-');
      const x = parseInt(xStr);
      const y = parseInt(yStr);
      
      // Check if this bomb still exists in the current bombs list
      const bombExists = currentBombs.some(bomb => 
        bomb.ownerId === ownerId && 
        bomb.x === x && 
        bomb.y === y &&
        !bomb.hasExploded()
      );
      
      if (!bombExists) {
        element.remove();
      }
    });
  }

  // Handle bomb thrown event - creates a visible animation from player to bomb location
  private handleBombThrown(data: { ownerId: string, playerX: number, playerY: number, bombX: number, bombY: number, bombId?: string }): void {
    console.log('Bomb thrown event received:', data);
    
    // Use provided bombId if available, otherwise generate one
    const bombId = data.bombId || `${data.ownerId}-${data.bombX}-${data.bombY}-${Date.now()}`;
    
    // Check if we've already animated this bomb
    if (this.animatedBombs.has(bombId)) {
      console.log('Skipping duplicate animation for bomb:', bombId);
      return;
    }
    
    // Also check if we've animated a bomb at this position from this owner recently
    // This helps prevent duplicates when bombId is inconsistent
    const positionKey = `${data.ownerId}-${data.bombX}-${data.bombY}`;
    if (this.animatedBombs.has(positionKey)) {
      console.log('Skipping duplicate animation for bomb at position:', positionKey);
      return;
    }
    
    // Mark this bomb as animated using both IDs
    this.animatedBombs.add(bombId);
    this.animatedBombs.add(positionKey);
    
    // Create the animation
    this.createBombThrowAnimation(data.playerX, data.playerY, data.bombX, data.bombY);
    
    // Clean up the tracking after a delay
    setTimeout(() => {
      this.animatedBombs.delete(bombId);
      this.animatedBombs.delete(positionKey);
    }, 3000); // Extended cleanup time to prevent race conditions
  }
  
  // Handle bomb placed event - fallback for when bomb:thrown isn't triggered
  private handleBombPlaced(data: { ownerId: string, x: number, y: number, bombId?: string }): void {
    console.log('Bomb placed event received:', data);
    
    // Use provided bombId if available, otherwise generate one
    const bombId = data.bombId || `${data.ownerId}-${data.x}-${data.y}-${Date.now()}`;
    
    // Check if we've already animated this bomb
    if (this.animatedBombs.has(bombId)) {
      console.log('Skipping duplicate animation for bomb:', bombId);
      return;
    }
    
    // Also check if we've animated a bomb at this position from this owner recently
    // This helps prevent duplicates when bombId is inconsistent
    const positionKey = `${data.ownerId}-${data.x}-${data.y}`;
    if (this.animatedBombs.has(positionKey)) {
      console.log('Skipping duplicate animation for bomb at position:', positionKey);
      return;
    }
    
    // Mark this bomb as animated using both IDs
    this.animatedBombs.add(bombId);
    this.animatedBombs.add(positionKey);
    
    // We need to find the player position since it's not included in the bomb:placed event
    // Player elements have ID format 'player-{id}' based on the player.ts implementation
    console.log('Looking for player element with ID:', `player-${data.ownerId}`);
    
    // Try to find the player element by owner ID
    let playerElement = document.getElementById(`player-${data.ownerId}`);
    
    // If not found, try to find by player number or any other identifier
    if (!playerElement) {
      // Get all player elements
      const allPlayers = document.querySelectorAll('.player');
      console.log(`Found ${allPlayers.length} player elements`);
      
      // Get the local player ID and number
      const localPlayerId = localStorage.getItem('playerId');
      const localPlayerNumber = parseInt(localStorage.getItem('playerNumber') || '1');
      
      // If this is our own bomb, use our own player element
      if (data.ownerId === localPlayerId) {
        playerElement = document.querySelector(`.player[id$="${localPlayerId}"]`) as HTMLElement;
        console.log('Using local player element for our own bomb');
      }
      // Otherwise, try to find the correct remote player
      else {
        // Try each player element to find one that's not the local player
        allPlayers.forEach((el, index) => {
          const elId = el.id;
          console.log(`Player element ${index}: ${elId}`);
          
          // If this is not our player, use it for the remote bomb
          if (elId !== `player-${localPlayerId}`) {
            playerElement = el as HTMLElement;
            console.log(`Using remote player element: ${elId}`);
          }
        });
      }
      
      // Last resort: use any player element
      if (!playerElement && allPlayers.length > 0) {
        playerElement = allPlayers[0] as HTMLElement;
        console.log('Falling back to first player element');
      }
    }
    
    console.log('Found player element:', playerElement);
    
    // Default to bomb position if we can't find player position
    let playerX = data.x;
    let playerY = data.y;
    
    // Try to get player position from DOM if possible
    if (playerElement) {
      // Get position from style (player elements use style.left and style.top)
      const style = window.getComputedStyle(playerElement);
      const left = parseInt(style.left, 10) || 0;
      const top = parseInt(style.top, 10) || 0;
      
      // Convert from pixels to grid coordinates (using TILE_SIZE = 40)
      playerX = left / 40;
      playerY = top / 40;
      
      console.log('Found player position from DOM:', { left, top, playerX, playerY });
    } else {
      console.log('Could not find player element, using bomb position as fallback');
      // If we can't find the player, just animate from a position slightly offset from the bomb
      playerX = data.x - 0.5;
      playerY = data.y - 0.5;
    }
    
    // Create the animation from player to bomb
    this.createBombThrowAnimation(playerX, playerY, data.x, data.y);
    
    // Clean up the tracking after a delay
    setTimeout(() => {
      this.animatedBombs.delete(bombId);
      this.animatedBombs.delete(positionKey);
    }, 3000); // Extended cleanup time to prevent race conditions
  }

  // Handle bomb explosion event
  private handleBombExplosion(data: { 
    ownerId: string, 
    origin: { x: number, y: number }, 
    coordinates: { x: number, y: number }[] 
  }): void {
    // Remove the bomb element
    const bombId = `bomb-${data.ownerId}-${data.origin.x}-${data.origin.y}`;
    const bombElement = document.getElementById(bombId);
    if (bombElement) {
      bombElement.remove();
    }
    
    // Create explosion elements for each affected coordinate
    data.coordinates.forEach(coord => {
      this.createExplosionElement(coord.x, coord.y);
    });
  }

  // Create an explosion element at the specified coordinates
  private createExplosionElement(x: number, y: number): void {
    const explosionId = `explosion-${x}-${y}`;
    
    // Check if there's already an explosion at this location
    if (this.explosionElements.has(explosionId)) {
      // Reset the timestamp to extend the explosion duration
      this.explosionElements.get(explosionId)!.timestamp = Date.now();
      return;
    }
    
    // Create a new explosion element using the framework's h function
    const explosionVNode = h('div', {
      id: explosionId,
      class: 'explosion',
      style: `
        left: ${x * 40}px;
        top: ${y * 40}px;
      `
    }, []);
    
    // Render the explosion element using the framework's render function
    const renderedExplosion = render(explosionVNode) as HTMLElement;
    
    // Add to the container
    this.gameContainer.appendChild(renderedExplosion);
    
    // Add to tracking map with current timestamp
    this.explosionElements.set(explosionId, {
      element: renderedExplosion,
      timestamp: Date.now()
    });
    
    // Emit event for explosion at this coordinate
    eventBus.emit('explosion:created', { x, y });
  }

  // Start animation loop for updating bomb countdown visuals and removing expired explosions
  private startAnimationLoop(): void {
    const updateAnimations = () => {
      // Remove expired explosion elements
      const currentTime = Date.now();
      this.explosionElements.forEach((data, id) => {
        if (currentTime - data.timestamp > this.explosionDuration) {
          data.element.remove();
          this.explosionElements.delete(id);
          
          // Extract coordinates from the ID
          const [_, xStr, yStr] = id.split('-');
          const x = parseInt(xStr);
          const y = parseInt(yStr);
          
          // Emit event for explosion removal
          eventBus.emit('explosion:removed', { x, y });
        }
      });
      
      // Continue the animation loop
      requestAnimationFrame(updateAnimations);
    };
    
    // Start the animation loop
    requestAnimationFrame(updateAnimations);
  }
  
  // Add CSS styles for bombs and explosions
  private addStyles(): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
        100% { transform: scale(1); opacity: 1; }
      }
      
      @keyframes fadeInOut {
        0% { opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { opacity: 0; }
      }
      
      @keyframes flash {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
        50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.2); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
      }
      
      @keyframes bombRotationRight {
        0% { transform: translateY(-50%) rotate(0deg) scale(1); filter: brightness(1); }
        50% { transform: translateY(-50%) rotate(180deg) scale(1.1); filter: brightness(1.2); }
        100% { transform: translateY(-50%) rotate(360deg) scale(1); filter: brightness(1); }
      }
      
      @keyframes bombRotationLeft {
        0% { transform: translateY(-50%) rotate(0deg) scale(1); filter: brightness(1); }
        50% { transform: translateY(-50%) rotate(-180deg) scale(1.1); filter: brightness(1.2); }
        100% { transform: translateY(-50%) rotate(-360deg) scale(1); filter: brightness(1); }
      }
      
      @keyframes bombRotationUp {
        0% { transform: translateX(-50%) rotate(0deg) scale(1); filter: brightness(1); }
        50% { transform: translateX(-50%) rotate(180deg) scale(1.1); filter: brightness(1.2); }
        100% { transform: translateX(-50%) rotate(360deg) scale(1); filter: brightness(1); }
      }
      
      @keyframes bombRotationDown {
        0% { transform: translateX(-50%) rotate(0deg) scale(1); filter: brightness(1); }
        50% { transform: translateX(-50%) rotate(-180deg) scale(1.1); filter: brightness(1.2); }
        100% { transform: translateX(-50%) rotate(-360deg) scale(1); filter: brightness(1); }
      }
      
      .bomb {
        position: absolute;
        width: 32px;
        height: 32px;
        transform: translate(-50%, -50%);
        z-index: 10;
        animation: pulse 1s infinite;
      }
      
      .bomb-timer {
        position: absolute;
        bottom: -5px;
        left: 0;
        width: 100%;
        height: 3px;
        background-color: #ff3300;
        transform-origin: left center;
      }
      
      .explosion {
        position: absolute;
        width: 64px;
        height: 64px;
        transform: translate(-50%, -50%);
        z-index: 20;
        animation: fadeInOut 0.5s forwards;
        background: radial-gradient(circle, rgba(255,255,0,0.8) 0%, rgba(255,0,0,0.8) 70%, rgba(255,0,0,0) 100%);
      }
      
      .bomb-landing-flash {
        position: absolute;
        width: 40px;
        height: 40px;
        background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,200,0,0.7) 50%, transparent 100%);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        z-index: 998;
        animation: flash 300ms ease-out forwards;
        pointer-events: none;
      }
      
      .bomb-image.direction-right {
        right: 0;
        top: 50%;
        transform-origin: center center;
      }
      
      .bomb-image.direction-left {
        left: 0;
        top: 50%;
        transform-origin: center center;
      }
      
      .bomb-image.direction-down {
        bottom: 0;
        left: 50%;
        transform-origin: center center;
      }
      
      .bomb-image.direction-up {
        top: 0;
        left: 50%;
        transform-origin: center center;
      }
    `;
    document.head.appendChild(styleElement);
  }


}
