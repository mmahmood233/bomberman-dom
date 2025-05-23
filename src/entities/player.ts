// Player entity logic
import { eventBus } from '../../framework/events';
import { h, render } from '../../framework/dom';
import { TILE_SIZE } from '../game/constants';
import { EVENTS } from '../multiplayer/events';
import { sendToServer } from '../multiplayer/socket';
import { maybeSpawnPowerup, PowerUpType, checkAndCollectPowerUp } from '../game/powerups';

// Game state tracking
let isGamePaused = false;
let isGameOver = false;

export enum Direction {
  UP,
  RIGHT,
  DOWN,
  LEFT,
  NONE
}

export interface PlayerPosition {
  x: number;
  y: number;
}

export interface PlayerStats {
  speed: number;
  bombCapacity: number;
  explosionRange: number;
}

// Interface for block destruction
export interface DestroyedBlock {
  x: number;
  y: number;
  type: string;
}

export class Player {
  // Position and movement
  private x: number = 0;
  private y: number = 0;
  private direction: Direction = Direction.NONE;
  private moving: boolean = false;
  private speed: number = 3; // Grid cells per second
  
  // Player state
  private lives: number = 3;
  private invulnerable: boolean = false;
  private invulnerabilityTimer: number | null = null;
  private invulnerabilityDuration: number = 2000; // 2 seconds
  
  // Power-up stats
  private bombCapacity: number = 1;
  private explosionRange: number = 1;
  
  // Visual representation
  private playerElement: HTMLElement | null = null;
  private nameTagElement: HTMLElement | null = null;
  
  // Bomb cooldown
  private bombCooldown: boolean = false;
  private bombCooldownTime: number = 1000; // 1 second cooldown
  
  // Track placed bombs
  private activeBombs: number = 0;
  
  // DOM container reference
  private gameContainer: HTMLElement | null = null;
  
  // Player number (1-4) assigned by the server
  private playerNumber: number = 1;
  
  constructor(
    public id: string, 
    public nickname: string,
    startX: number = 0,
    startY: number = 0,
    container?: HTMLElement,
    playerNum?: number
  ) {
    // Set player number if provided
    if (playerNum) {
      this.playerNumber = playerNum;
    }
    this.x = startX;
    this.y = startY;
    
    // Store container reference if provided
    if (container) {
      this.gameContainer = container;
      this.createPlayerElement(container);
    }
    
    // Listen for power-up collection events
    eventBus.on('powerup:applied', this.handlePowerUp.bind(this));
    
    // Listen for stat update events
    eventBus.on('stat:updated', this.handleStatUpdate.bind(this));
    
    // Listen for hit events from explosions
    eventBus.on('player:hit', this.handleHit.bind(this));
    
    // Listen for game pause/resume events
    eventBus.on('game:pause', () => {
      isGamePaused = true;
    });
    
    eventBus.on('game:resume', () => {
      isGamePaused = false;
    });
    
    // Listen for game over events
    eventBus.on('game:end', () => {
      isGameOver = true;
    });
    
    eventBus.on('game:over', () => {
      isGameOver = true;
    });
    
    eventBus.on('game:reset', () => {
      isGameOver = false;
    });
    
    // Set up keyboard controls if this is the local player
    if (this.isLocalPlayer()) {
      this.setupKeyboardControls();
    }
  }
  
  // Get current position
  public getPosition(): PlayerPosition {
    return { x: this.x, y: this.y };
  }
  
  // Set position (for initialization or teleportation)
  public setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    
    // Update visual position
    this.updateVisualPosition();
    
    // Emit position update event
    this.emitPositionUpdate();
  }
  
  // Remove the player's visual element from the DOM
  public removePlayerElement(): void {
    // Remove player element from DOM if it exists
    if (this.playerElement && this.playerElement.parentNode) {
      // Add a fade-out animation - we'll use direct style updates for the animation
      // as it's more efficient for transitions
      this.playerElement.style.transition = 'opacity 0.5s';
      this.playerElement.style.opacity = '0';
      
      // Remove the element after animation completes
      setTimeout(() => {
        if (this.playerElement && this.playerElement.parentNode) {
          // Use the parent node's removeChild method which is framework-agnostic
          this.playerElement.parentNode.removeChild(this.playerElement);
          this.playerElement = null;
          this.nameTagElement = null;
        }
      }, 500);
    }
  }
  
  // Create the player's visual element
  private createPlayerElement(container: HTMLElement): void {
    console.log(`Creating player element for player ${this.id} (${this.nickname}) at position ${this.x},${this.y}`);
    console.log(`Container:`, container);
    
    // Player character images based on player number
    const playerImages = [
      '/img/IK.png',  // Player 1
      '/img/MMD.png', // Player 2
      '/img/WA.png',  // Player 3
      '/img/MG.png'   // Player 4
    ];
    const imageIndex = (this.playerNumber - 1) % playerImages.length;
    const playerImage = playerImages[imageIndex];
    
    // Create name tag content
    const nameTagText = this.isLocalPlayer() ? `${this.nickname} (You)` : `${this.nickname} (P${this.playerNumber})`;
    
    // Create player element using the framework's h function
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
    
    const playerVNode = h('div', {
      class: 'player',
      id: `player-${this.id}`,
      style: `
        position: absolute;
        left: ${this.x * TILE_SIZE}px;
        top: ${this.y * TILE_SIZE}px;
        width: ${TILE_SIZE}px;
        height: ${TILE_SIZE}px;
        background-image: url(${playerImage});
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        background-color: transparent;
        z-index: 1000;
        box-sizing: border-box;
        transition: left 0.1s, top 0.1s;
      `
    }, [nameTagVNode]);
    
    // Render the player element using the framework's render function
    const renderedPlayer = render(playerVNode) as HTMLElement;
    console.log(`Player element created:`, renderedPlayer);
    
    // Add to container
    container.appendChild(renderedPlayer);
    console.log(`Player element added to container`);
    
    // Store references
    this.playerElement = renderedPlayer;
    this.nameTagElement = renderedPlayer.firstChild as HTMLElement;
    
    // Force a reflow to ensure the player is visible
    void renderedPlayer.offsetWidth;
    
    // Double-check that the player is in the DOM
    setTimeout(() => {
      const playerInDOM = document.getElementById(`player-${this.id}`);
      if (playerInDOM) {
        console.log(`Player ${this.id} is in the DOM`);
      } else {
        console.error(`Player ${this.id} is NOT in the DOM!`);
        // Try adding it again
        if (this.gameContainer) {
          this.gameContainer.appendChild(renderedPlayer);
          console.log(`Attempted to add player element again`);
        }
      }
    }, 500);
    
    // No animations for player characters to keep the original images clean
  }
  
  // Update the visual position of the player
  private updateVisualPosition(): void {
    if (this.playerElement) {
      // For player movement, we'll use direct style updates for performance
      // This is a common optimization even in frameworks
      this.playerElement.style.left = `${this.x * TILE_SIZE}px`;
      this.playerElement.style.top = `${this.y * TILE_SIZE}px`;
    }
  }
  
  // Get current direction
  public getDirection(): Direction {
    return this.direction;
  }
  
  // Set direction (for remote player synchronization)
  public setDirection(direction: Direction): void {
    this.direction = direction;
    this.moving = direction !== Direction.NONE;
  }
  
  // Move in a direction
  public move(direction: Direction, deltaTime: number, collisionCallback: (x: number, y: number) => boolean): void {
    // Don't allow movement if game is paused
    if (isGamePaused) {
      return;
    }
    
    if (direction === Direction.NONE) {
      this.moving = false;
      return;
    }
    
    this.direction = direction;
    this.moving = true;
    
    // Calculate new position based on direction and speed
    let newX = this.x;
    let newY = this.y;
    const distance = this.speed * (deltaTime / 1000); // Convert to seconds
    
    switch (direction) {
      case Direction.UP:
        newY -= distance;
        break;
      case Direction.RIGHT:
        newX += distance;
        break;
      case Direction.DOWN:
        newY += distance;
        break;
      case Direction.LEFT:
        newX -= distance;
        break;
    }
    
    // Check collision at new position
    if (!collisionCallback(newX, newY)) {
      // No collision, update position
      this.x = newX;
      this.y = newY;
      
      // Update visual position
      this.updateVisualPosition();
      
      // Emit position update event
      this.emitPositionUpdate();
    }
  }
  
  // Check if this is the local player
  private isLocalPlayer(): boolean {
    // This would be implemented based on your player ID system
    const storedPlayerId = localStorage.getItem('playerId');
    console.log(`Checking if player ${this.id} is local player. Stored ID: ${storedPlayerId}`);
    return this.id === storedPlayerId;
  }
  
  // Get player number
  public getPlayerNumber(): number {
    return this.playerNumber;
  }
  
  // Set up keyboard controls for the local player
  private setupKeyboardControls(): void {
    console.log(`Setting up keyboard controls for player ${this.id} (isLocalPlayer: ${this.isLocalPlayer()})`);
    
    // Only set up controls for the local player
    if (!this.isLocalPlayer()) {
      console.log(`Not setting up keyboard controls for remote player ${this.id}`);
      return;
    }
    
    const handleKeyDown = (event: KeyboardEvent) => {
      console.log(`Key pressed: ${event.key} for player ${this.id}`);
      
      // Skip if player is not in the game
      if (!this.playerElement) {
        console.log('Player element not found, skipping keyboard input');
        return;
      }
      
      // Skip if game is paused or game is over
      if (isGamePaused || isGameOver) {
        console.log('Game is paused or over, ignoring keyboard input');
        return;
      }
      
      let newX = this.x;
      let newY = this.y;
      const speed = 1; // Full tile movement for better grid alignment
      
      switch (event.key) {
        case 'ArrowUp':
          newY -= speed;
          this.direction = Direction.UP;
          break;
        case 'ArrowRight':
          newX += speed;
          this.direction = Direction.RIGHT;
          break;
        case 'ArrowDown':
          newY += speed;
          this.direction = Direction.DOWN;
          break;
        case 'ArrowLeft':
          newX -= speed;
          this.direction = Direction.LEFT;
          break;
        case ' ': // Spacebar
          this.placeBomb();
          return; // Skip movement for bomb placement
        default:
          return; // Skip for other keys
      }
      
      console.log(`Attempting to move from (${this.x},${this.y}) to (${newX},${newY})`);
      
      // Check if the new position is valid
      if (this.isValidPosition(newX, newY)) {
        this.x = newX;
        this.y = newY;
        this.updateVisualPosition();
        this.emitPositionUpdate();
        console.log(`Moved to (${this.x},${this.y})`);
        
        // Only check for power-ups if we're the local player to avoid duplicate collection
        if (this.isLocalPlayer()) {
          // Instead of automatically collecting, check if there's a visible power-up and collect it manually
          this.checkForVisiblePowerUp();
        }
      } else {
        console.log(`Invalid position: (${newX},${newY})`);
      }
      
      // Send position to server for multiplayer sync
      sendToServer(EVENTS.MOVE, {
        x: this.x,
        y: this.y,
        direction: this.direction
      });
    };
    
    // Add event listener for keydown
    document.addEventListener('keydown', handleKeyDown);
    
    // Log that keyboard controls are set up
    console.log(`Keyboard controls set up for player ${this.id}`);
  }
  
  // Check if a position is valid for movement
  private isValidPosition(x: number, y: number): boolean {
    // Define map dimensions - using constants directly
    // The map is 15x17 (0-14 x 0-16)
    const GRID_WIDTH = 14;
    const GRID_HEIGHT = 16;
    
    // Prevent going out of bounds - allow movement to the full extent of the map
    if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
      return false;
    }
    
    // Get grid coordinates
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    // Check for fixed walls (grid pattern) in all areas of the map
    // Apply this rule to all rows including the bottom rows
    if (gridX % 2 === 0 && gridY % 2 === 0) {
      return false; // Wall at even coordinates
    }
    
    // Check for border walls - only the very edge is a wall
    if (gridX === 0 || gridY === 0) {
      return false;
    }
    
    // Check for green spaces - always allow movement
    const greenSpaces = Array.from(document.querySelectorAll('.green-space')).filter(el => {
      const style = window.getComputedStyle(el);
      const left = parseInt(style.left) / TILE_SIZE;
      const top = parseInt(style.top) / TILE_SIZE;
      return Math.floor(left) === gridX && Math.floor(top) === gridY;
    });
    
    if (greenSpaces.length > 0) {
      return true; // Can walk through green spaces
    }
    
    // Check for blocks (destructible blocks)
    const blockElements = document.querySelectorAll('.block');
    for (let i = 0; i < blockElements.length; i++) {
      const block = blockElements[i] as HTMLElement;
      const blockX = Math.floor(parseInt(block.style.left) / TILE_SIZE);
      const blockY = Math.floor(parseInt(block.style.top) / TILE_SIZE);
      
      if (blockX === gridX && blockY === gridY) {
        return false; // Can't walk through blocks
      }
    }
    
    // Check for bombs
    const bombElements = document.querySelectorAll('.bomb');
    for (let i = 0; i < bombElements.length; i++) {
      const bomb = bombElements[i] as HTMLElement;
      const bombX = Math.floor(parseInt(bomb.style.left) / TILE_SIZE);
      const bombY = Math.floor(parseInt(bomb.style.top) / TILE_SIZE);
      
      if (bombX === gridX && bombY === gridY) {
        return false; // Can't walk through bombs
      }
    }
    
    return true; // No obstacles found
  }
  
  // Emit position update event
  private emitPositionUpdate(): void {
    eventBus.emit('player:moved', {
      id: this.id,
      x: this.x,
      y: this.y
    });
  }
  
  // Handle power-up application (from actual power-up collection)
  private handlePowerUp(data: any): void {
    // Only process if this is for this player
    if (data.playerId !== this.id) return;
    
    // We now only accept power-ups that have a visual verification
    if (!data.source || data.source !== 'visual_verification') {
      console.log(`Ignoring power-up event without visual verification:`, data);
      return;
    }
    
    console.log(`Applying power-up to player ${this.id}:`, data);
    
    // Convert string type to enum if needed
    let powerupType = data.type;
    if (typeof data.type === 'string') {
      switch (data.type.toLowerCase()) {
        case 'bomb':
          powerupType = PowerUpType.BOMB;
          break;
        case 'flame':
          powerupType = PowerUpType.FLAME;
          break;
        case 'speed':
          powerupType = PowerUpType.SPEED;
          break;
      }
    }
    
    // Apply the specific power-up effect based on type
    switch (powerupType) {
      case PowerUpType.BOMB:
        this.bombCapacity += 1;
        console.log(`Increased bomb capacity to ${this.bombCapacity}`);
        break;
      case PowerUpType.FLAME:
        this.explosionRange += 1;
        console.log(`Increased explosion range to ${this.explosionRange}`);
        break;
      case PowerUpType.SPEED:
        this.speed += 0.5;
        console.log(`Increased speed to ${this.speed}`);
        break;
      case 'extraLife':
        this.lives += 1;
        console.log(`Increased lives to ${this.lives}`);
        break;
      default:
        console.log(`Unknown power-up type: ${data.type}`);
        return; // Exit early if unknown type
    }
    
    // Emit stats update event
    this.emitStatsUpdate();
  }
  
  // Check for visible power-ups at the player's position
  private checkForVisiblePowerUp(): void {
    // Get the player's current grid position
    const gridX = Math.floor(this.x);
    const gridY = Math.floor(this.y);
    
    console.log(`Checking for power-ups at position (${gridX}, ${gridY})`);
    
    // Get all power-up elements from the DOM (using the correct class name)
    const powerUpElements = document.querySelectorAll('.powerup');
    console.log(`Found ${powerUpElements.length} power-up elements in the DOM`);
    
    // If no power-up elements exist, exit early
    if (powerUpElements.length === 0) {
      return;
    }
    
    // Check each power-up element to see if it's at our position
    let foundPowerUp = false;
    powerUpElements.forEach((el, index) => {
      const powerUpEl = el as HTMLElement;
      const style = window.getComputedStyle(powerUpEl);
      
      // Get the power-up's position
      const leftPx = parseInt(style.left);
      const topPx = parseInt(style.top);
      const left = leftPx / TILE_SIZE;
      const top = topPx / TILE_SIZE;
      
      console.log(`Power-up #${index}: position (${left.toFixed(2)}, ${top.toFixed(2)}) [${leftPx}px, ${topPx}px], class=${powerUpEl.className}, data-type=${powerUpEl.getAttribute('data-type')}`);
      
      // If the power-up is at our position, collect it
      if (Math.floor(left) === gridX && Math.floor(top) === gridY) {
        console.log(`MATCH FOUND! Power-up at player position`);
        
        // Get the power-up type from the data attribute
        const powerUpType = powerUpEl.getAttribute('data-type');
        console.log(`Power-up type: ${powerUpType}`);
        
        // Skip if we already found a powerup at this position or if the type is missing
        if (foundPowerUp || !powerUpType) {
          return;
        }
        
        // Create a floating notification
        const notification = document.createElement('div');
        notification.className = 'powerup-notification';
        
        // Create icon element based on power-up type
        let iconElement = document.createElement('span');
        
        if (powerUpType === 'bomb') {
          const bombImg = document.createElement('img');
          bombImg.src = '/img/Bomb.png';
          bombImg.style.width = '20px';
          bombImg.style.height = '20px';
          bombImg.style.verticalAlign = 'middle';
          iconElement.appendChild(bombImg);
        } else if (powerUpType === 'flame') {
          iconElement.textContent = '🔥';
        } else if (powerUpType === 'speed') {
          iconElement.textContent = '⚡';
        } else {
          iconElement.textContent = '?';
        }
        
        // Add the icon and text
        notification.appendChild(iconElement);
        notification.appendChild(document.createTextNode(' +1'));
        notification.style.cssText = `
          position: absolute;
          left: ${gridX * TILE_SIZE + TILE_SIZE / 2}px;
          top: ${gridY * TILE_SIZE}px;
          color: white;
          font-weight: bold;
          font-size: 16px;
          text-shadow: 0 0 3px black;
          z-index: 1000;
          pointer-events: none;
          animation: float-up 1.5s forwards;
        `;
        
        // Add float-up animation if it doesn't exist
        if (!document.getElementById('float-up-animation')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'float-up-animation';
          styleEl.textContent = `
            @keyframes float-up {
              0% { transform: translateY(0); opacity: 1; }
              100% { transform: translateY(-50px); opacity: 0; }
            }
          `;
          document.head.appendChild(styleEl);
        }
        
        // Add notification to the DOM
        document.body.appendChild(notification);
        
        // Remove notification after animation
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 1500);
        
        // Remove the power-up element from the DOM
        powerUpEl.remove();
        
        // Mark that we found a powerup to prevent processing multiple powerups at once
        foundPowerUp = true;
        
        // First send to server for websocket synchronization
        // This ensures other players see the powerup disappear immediately
        sendToServer(EVENTS.COLLECT_POWERUP, {
          playerId: this.id,
          powerupId: `powerup_${Date.now()}`,
          powerupType: powerUpType,
          x: gridX,
          y: gridY
        });
        
        // Then emit a power-up applied event with visual verification
        // This is what actually applies the powerup effect to the player
        eventBus.emit('powerup:applied', {
          playerId: this.id,
          type: powerUpType,
          source: 'visual_verification'
        });
        
        // Also emit the collected event for the HUD
        eventBus.emit('powerup:collected', {
          playerId: this.id,
          type: powerUpType,
          position: { x: gridX, y: gridY }
        });
        
        console.log(`Player ${this.id} collected a ${powerUpType} power-up at (${gridX}, ${gridY}) with visual verification`);
      } else {
        console.log(`No match: Player at (${gridX}, ${gridY}), Power-up at (${Math.floor(left)}, ${Math.floor(top)})`);
      }
    });
    
    // If we found and collected a power-up, also call the powerups.ts function to clean up its internal state
    if (foundPowerUp) {
      // This won't actually apply the power-up again, but will clean up the internal state
      checkAndCollectPowerUp(gridX, gridY, this.id);
    }
  }
  
  // Handle stat updates (from other systems)
  private handleStatUpdate(data: any): void {
    // Only process if this is for this player
    if (data.playerId !== this.id) return;
    
    console.log(`Updating player stats for ${this.id}:`, data);
    
    switch (data.type) {
      case 'bombCapacity':
      case PowerUpType.BOMB:
        if (data.value > 0) {
          this.bombCapacity = data.value;
        } else {
          this.bombCapacity += 1;
        }
        console.log(`Set bomb capacity to ${this.bombCapacity}`);
        break;
      case 'explosionRange':
      case PowerUpType.FLAME:
        if (data.value > 0) {
          this.explosionRange = data.value;
        } else {
          this.explosionRange += 1;
        }
        console.log(`Set explosion range to ${this.explosionRange}`);
        break;
      case 'speed':
      case PowerUpType.SPEED:
        if (data.value > 0) {
          this.speed = data.value;
        } else {
          this.speed += 0.5;
        }
        console.log(`Set speed to ${this.speed}`);
        break;
      case 'extraLife':
        this.lives += 1;
        console.log(`Increased lives to ${this.lives}`);
        break;
      default:
        console.log(`Unknown stat update type: ${data.type}`);
    }
    
    // Emit stats update event
    this.emitStatsUpdate();
  }
  
  // Handle being hit by an explosion
  private handleHit(data: any): void {
    // Only process if this is for this player
    if (data.playerId !== this.id) return;
    
    // If player is invulnerable, ignore the hit
    if (this.invulnerable) return;
    
    // Reduce lives
    this.lives -= 1;
    
    console.log(`Player ${this.id} (${this.nickname}) hit by explosion! Lives remaining: ${this.lives}`);
    
    // Visual feedback for being hit
    if (this.playerElement) {
      this.playerElement.classList.add('hit');
      setTimeout(() => {
        if (this.playerElement) {
          this.playerElement.classList.remove('hit');
        }
      }, 500);
    }
    
    // Emit hit event
    eventBus.emit('player:damaged', {
      id: this.id,
      livesRemaining: this.lives
    });
    
    // Always send hit event to server for websocket synchronization
    // This is critical for self-elimination cases too
    console.log(`Sending player_hit event to server: ${this.id} hit by ${data.attackerId || this.id}`);
    sendToServer(EVENTS.PLAYER_HIT, {
      playerId: this.id,
      attackerId: data.attackerId || this.id
    });
    
    // Make player invulnerable temporarily
    this.setInvulnerable();
    
    // Check if player is eliminated
    if (this.lives <= 0) {
      console.log(`Player ${this.id} (${this.nickname}) has been eliminated!`);
      
      // Remove player's visual element immediately
      this.removePlayerElement();
      
      // Emit local event for player elimination
      eventBus.emit('player:eliminated', {
        id: this.id,
        eliminatedBy: data.attackerId || this.id
      });
      
      // Send player elimination to server for websocket synchronization
      // Always send elimination event with explicit attackerId
      sendToServer('player_eliminated', {
        playerId: this.id,
        attackerId: data.attackerId || this.id // Ensure there's always an attackerId, use self-id if none provided
      });
      
      // Force a direct server-side player elimination notification for self-elimination
      if (data.attackerId === this.id) {
        console.log('Self-elimination detected, sending direct elimination notification');
        sendToServer(EVENTS.PLAYER_ELIMINATED, {
          playerId: this.id,
          attackerId: this.id,
          forceBroadcast: true // Special flag to ensure server broadcasts this
        });
      }
    }
  }
  
  // Make player temporarily invulnerable
  private setInvulnerable(): void {
    this.invulnerable = true;
    
    // Clear any existing timer
    if (this.invulnerabilityTimer !== null) {
      window.clearTimeout(this.invulnerabilityTimer);
    }
    
    // Add visual indicator for invulnerability
    if (this.playerElement) {
      this.playerElement.classList.add('invulnerable');
    }
    
    // Set invulnerability timer
    this.invulnerabilityTimer = window.setTimeout(() => {
      this.invulnerable = false;
      this.invulnerabilityTimer = null;
      
      // Remove visual indicator
      if (this.playerElement) {
        this.playerElement.classList.remove('invulnerable');
      }
      
      // Emit invulnerability end event
      eventBus.emit('player:invulnerabilityEnd', { id: this.id });
    }, this.invulnerabilityDuration);
    
    // Emit invulnerability start event
    eventBus.emit('player:invulnerabilityStart', { id: this.id });
  }
  
  // Get player stats
  public getStats(): PlayerStats {
    return {
      speed: this.speed,
      bombCapacity: this.bombCapacity,
      explosionRange: this.explosionRange
    };
  }
  
  // Emit stats update event
  private emitStatsUpdate(): void {
    eventBus.emit('player:statsUpdate', {
      id: this.id,
      stats: this.getStats(),
      lives: this.lives
    });
  }
  
  // Get remaining lives
  public getLives(): number {
    return this.lives;
  }
  
  // Check if player is invulnerable
  public isInvulnerable(): boolean {
    return this.invulnerable;
  }
  
  // Check if player is moving
  public isMoving(): boolean {
    return this.moving;
  }
  
  // Stop movement
  public stopMovement(): void {
    this.moving = false;
    this.direction = Direction.NONE;
  }
  
  // Place a bomb at the player's current position
  public placeBomb(): void {
    // Skip if player is not in the game
    if (!this.playerElement || !this.gameContainer) return;
    
    // Skip if game is paused
    if (isGamePaused) return;
    
    // Check bomb cooldown
    if (this.bombCooldown) return;
    
    // Check if player has reached bomb capacity
    if (this.activeBombs >= this.bombCapacity) return;
    
    // Get the exact player position
    const gridX = Math.floor(this.x);
    const gridY = Math.floor(this.y);
    
    // Check if there's already a bomb at this position
    const existingBombs = document.querySelectorAll('.bomb');
    for (let i = 0; i < existingBombs.length; i++) {
      const bomb = existingBombs[i] as HTMLElement;
      const bombX = Math.floor(parseInt(bomb.style.left) / TILE_SIZE);
      const bombY = Math.floor(parseInt(bomb.style.top) / TILE_SIZE);
      
      if (bombX === gridX && bombY === gridY) {
        return; // Don't place another bomb here
      }
    }
    
    // Create bomb element
    const bomb = document.createElement('div');
    bomb.className = 'bomb';
    bomb.style.cssText = `
      position: absolute;
      left: ${gridX * TILE_SIZE}px;
      top: ${gridY * TILE_SIZE}px;
      width: ${TILE_SIZE}px;
      height: ${TILE_SIZE}px;
      background-color: black;
      border-radius: 50%;
      z-index: 800;
      animation: bomb-pulse 0.5s infinite alternate;
      border: 2px solid white;
      box-sizing: border-box;
    `;
    
    // Add a fuse to make the bomb more visible
    const fuse = document.createElement('div');
    fuse.style.cssText = `
      position: absolute;
      top: -5px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 10px;
      z-index: 801;
    `;
    bomb.appendChild(fuse);
    
    // Add bomb to the container
    this.gameContainer.appendChild(bomb);
    
    // Increment active bombs count
    this.activeBombs++;
    
    // Set bomb cooldown
    this.bombCooldown = true;
    setTimeout(() => {
      this.bombCooldown = false;
    }, this.bombCooldownTime);
    
    // Send bomb placement to server
    sendToServer(EVENTS.DROP_BOMB, {
      x: gridX,
      y: gridY,
      explosionRange: this.explosionRange
    });
    
    // Emit bomb placed event
    eventBus.emit('bomb:placed', {
      playerId: this.id,
      x: gridX,
      y: gridY,
      range: this.explosionRange
    });
    
    // Explode after 2 seconds
    setTimeout(() => {
      // Remove the bomb element
      bomb.remove();
      
      // Decrement active bombs count
      this.activeBombs--;
      
      // Create explosion
      this.createExplosion(gridX, gridY, this.explosionRange);
    }, 2000);
  }
  
  // Create explosion effect - public so it can be used for both local and remote bombs
  public createExplosion(x: number, y: number, radius: number): void {
    if (!this.gameContainer) return;
    
    // Track which blocks have been destroyed to avoid duplicates
    const destroyedBlocks: Set<string> = new Set();
    
    // Create center explosion
    const centerExplosion = document.createElement('div');
    centerExplosion.className = 'explosion center';
    centerExplosion.style.cssText = `
      position: absolute;
      left: ${x * TILE_SIZE}px;
      top: ${y * TILE_SIZE}px;
      width: ${TILE_SIZE}px;
      height: ${TILE_SIZE}px;
      background-color: yellow;
      border-radius: 50%;
      z-index: 900;
      animation: explosion 0.5s forwards;
    `;
    if (this.gameContainer) {
      this.gameContainer.appendChild(centerExplosion);
    }
    
    // Remove explosion after animation
    setTimeout(() => {
      centerExplosion.remove();
    }, 500);
    
    // Destroy block at center if there is one
    this.destroyBlockAt(x, y, destroyedBlocks);
    
    // Check if any player is at the center of the explosion
    this.checkPlayerHit(x, y);
    
    // Check if the local player (this player) is at the center of the explosion
    if (this.isLocalPlayer()) {
      const playerX = Math.floor(this.x);
      const playerY = Math.floor(this.y);
      
      if (playerX === Math.floor(x) && playerY === Math.floor(y)) {
        console.log(`Local player hit by own bomb at center (${x}, ${y})`);
        eventBus.emit('player:hit', {
          playerId: this.id,
          attackerId: this.id
        });
      }
    }
    
    // Create explosion in four directions
    const directions = [
      { dx: 0, dy: -1, name: 'up' },    // Up
      { dx: 1, dy: 0, name: 'right' },  // Right
      { dx: 0, dy: 1, name: 'down' },   // Down
      { dx: -1, dy: 0, name: 'left' }   // Left
    ];
    
    // For each direction, create explosion blocks up to the radius
    directions.forEach(dir => {
      for (let i = 1; i <= radius; i++) {
        const explosionX = x + (dir.dx * i);
        const explosionY = y + (dir.dy * i);
        
        // Check if this position is valid for explosion
        if (!this.isValidExplosionPosition(explosionX, explosionY)) {
          break; // Stop this direction if hit a wall
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
        
        if (this.gameContainer) {
          this.gameContainer.appendChild(explosion);
        }
        
        // Check if there's a block at this position and destroy it
        const wasDestroyed = this.destroyBlockAt(explosionX, explosionY, destroyedBlocks);
        
        // Check if any player is at this position
        this.checkPlayerHit(explosionX, explosionY);
        
        // Check if the local player (this player) is at this position
        if (this.isLocalPlayer()) {
          const playerX = Math.floor(this.x);
          const playerY = Math.floor(this.y);
          
          if (playerX === Math.floor(explosionX) && playerY === Math.floor(explosionY)) {
            console.log(`Local player hit by own bomb explosion at (${explosionX}, ${explosionY})`);
            
            // Emit local hit event
            eventBus.emit('player:hit', {
              playerId: this.id,
              attackerId: this.id
            });
            
            // Also send hit event to server for self-damage
            // This ensures other clients know about self-elimination
            sendToServer(EVENTS.PLAYER_HIT, {
              playerId: this.id,
              attackerId: this.id
            });
          }
        }
        
        // Remove explosion after animation
        setTimeout(() => {
          explosion.remove();
        }, 500);
        
        // If a block was destroyed, stop the explosion in this direction
        if (wasDestroyed) {
          break;
        }
      }
    });
    
    // Add CSS for bomb and explosion animations if not already added
    if (!document.getElementById('bomb-animations')) {
      const style = document.createElement('style');
      style.id = 'bomb-animations';
      style.textContent = `
        @keyframes bomb-pulse {
          0% { transform: scale(1); }
          100% { transform: scale(1.2); background-color: #555; }
        }
        
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
        
        // @keyframes green-space-appear {
        //   0% { transform: scale(0); opacity: 0; }
        //   100% { transform: scale(1); opacity: 1; }
        // }
        
        @keyframes powerup-spawn-indicator {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        
        // .green-space {
        //   animation: green-space-appear 0.3s forwards;
        // }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Check if an explosion can reach this position
  private isValidExplosionPosition(x: number, y: number): boolean {
    // Define map dimensions - using constants directly
    const GRID_WIDTH = 14;
    const GRID_HEIGHT = 16;
    
    // Can't explode outside the map boundaries
    if (x < 0 || y < 0 || x > GRID_WIDTH || y > GRID_HEIGHT) {
      return false;
    }
    
    // Can't explode through fixed walls (grid pattern) in all areas of the map
    // Apply this rule to all rows including the bottom rows
    if (x % 2 === 0 && y % 2 === 0) {
      return false; // Wall at even coordinates
    }
    
    // Can't explode through border walls - only the very edge is a wall
    if (x === 0 || y === 0) {
      return false;
    }
    
    return true;
  }
  
  // Check if any player is at the specified position and trigger hit event
  private checkPlayerHit(x: number, y: number): void {
    // Get all player elements
    const playerElements = document.querySelectorAll('.player');
    
    // Check each player
    playerElements.forEach(playerEl => {
      const player = playerEl as HTMLElement;
      const playerId = player.id.replace('player-', '');
      
      // Get player position
      const playerX = parseInt(player.style.left) / TILE_SIZE;
      const playerY = parseInt(player.style.top) / TILE_SIZE;
      
      // Check if player is at the explosion position (using grid coordinates)
      if (Math.floor(playerX) === Math.floor(x) && Math.floor(playerY) === Math.floor(y)) {
        console.log(`Player ${playerId} is at explosion position (${Math.floor(x)}, ${Math.floor(y)})`);
        
        // Emit hit event
        eventBus.emit('player:hit', {
          playerId: playerId,
          attackerId: this.id
        });
        
        // If this is the local player, also check if we need to emit a hit event for ourselves
        if (playerId === localStorage.getItem('playerId')) {
          console.log(`Local player hit by explosion!`);
        }
      }
    });
  }
  
  // Destroy a block at the specified coordinates
  private destroyBlockAt(x: number, y: number, destroyedBlocks: Set<string>): boolean {
    if (!this.gameContainer) return false;
    
    // Create a key for this position
    const posKey = `${x},${y}`;
    
    // Skip if already destroyed
    if (destroyedBlocks.has(posKey)) {
      return false;
    }
    
    // Find red blocks at this position
    const redBlocks = Array.from(document.querySelectorAll('.block')).filter(el => {
      const style = window.getComputedStyle(el);
      const left = parseInt(style.left) / TILE_SIZE;
      const top = parseInt(style.top) / TILE_SIZE;
      
      return Math.floor(left) === Math.floor(x) && Math.floor(top) === Math.floor(y);
    });
    
    if (redBlocks.length > 0) {
      // Mark as destroyed
      destroyedBlocks.add(posKey);
      
      // Process each red block
      redBlocks.forEach(block => {
        const blockEl = block as HTMLElement;
        
        // Animate block destruction
        blockEl.style.animation = 'block-destroy 0.5s forwards';
        
        // Create an empty space where the block was
        const emptySpace = document.createElement('div');
        emptySpace.className = 'empty-space';
        emptySpace.style.position = 'absolute';
        emptySpace.style.left = blockEl.style.left;
        emptySpace.style.top = blockEl.style.top;
        emptySpace.style.width = `${TILE_SIZE}px`;
        emptySpace.style.height = `${TILE_SIZE}px`;
        emptySpace.style.backgroundColor = 'transparent'; // Transparent background
        emptySpace.style.zIndex = '5'; // Below player but above background
        
        // Add empty space to the game container
        if (this.gameContainer) {
          this.gameContainer.appendChild(emptySpace);
        }
        
        // Remove block after animation
        setTimeout(() => {
          blockEl.remove();
        }, 500);
        
        // Emit block destroyed event locally
        eventBus.emit('block:destroyed', {
          x: Math.floor(x),
          y: Math.floor(y),
          type: 'destructible'
        });
        
        // Only emit WebSocket events if this is the local player
        if (this.isLocalPlayer()) {
          // Send block destruction to server for synchronization
          sendToServer(EVENTS.BLOCK_DESTROYED, {
            x: Math.floor(x),
            y: Math.floor(y),
            type: 'destructible'
          });
        }
        
        // Wait for the block destruction animation to complete before spawning a power-up
        setTimeout(() => {
          // Try to spawn a power-up at this position
          const powerUp = maybeSpawnPowerup(Math.floor(x), Math.floor(y));
          
          // If a power-up was spawned, render it to the game container
          if (powerUp && this.gameContainer) {
            powerUp.render(this.gameContainer);
            console.log(`Power-up spawned: ${powerUp.type} at (${Math.floor(x)}, ${Math.floor(y)})`);
            
            // Add a visual indicator for the power-up spawn
            const spawnIndicator = document.createElement('div');
            spawnIndicator.className = 'powerup-spawn-indicator';
            spawnIndicator.style.cssText = `
              position: absolute;
              left: ${Math.floor(x) * TILE_SIZE}px;
              top: ${Math.floor(y) * TILE_SIZE}px;
              width: ${TILE_SIZE}px;
              height: ${TILE_SIZE}px;
              background-color: transparent;
              border-radius: 50%;
              z-index: 45;
              box-shadow: 0 0 20px white;
              animation: powerup-spawn-indicator 0.5s forwards;
              pointer-events: none;
            `;
            
            if (this.gameContainer) {
              this.gameContainer.appendChild(spawnIndicator);
              
              // Remove indicator after animation
              setTimeout(() => {
                spawnIndicator.remove();
              }, 500);
            }
          }
        }, 400); // Wait for block destruction animation to complete
      });
      
      return true; // Block was destroyed
    }
    
    return false; // No block was destroyed
  }
}
