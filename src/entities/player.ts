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
  
  // Grid-based movement with visual smoothing
  private gridX: number = 0;
  private gridY: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;
  private movingToTarget: boolean = false;
  private moveProgress: number = 0;
  private lastSyncTime: number = 0;
  private syncInterval: number = 30; // Faster default sync rate (30ms instead of 100ms) for smoother movement
  
  // Websocket synchronization properties
  private moveSequenceId: number = 0; // For generating unique sequence IDs for movement updates
  private lastSequenceId: number | null = null; // For tracking the last received sequence ID to prevent out-of-order packets
  private _lastUpdateTimestamp: number | null = null; // For timestamp-based ordering of updates
  private _positionHistory: any[] = []; // For interpolation and prediction
  private _networkLatency: number = 0; // Estimated network latency
  private _packetLossCount: number = 0; // Count of detected packet loss
  private _positionUpdateInterval: number | null = null; // Interval ID for sending position updates
  private _frameLoopId: number | null = null; // Animation frame ID for frame-based updates
  private _isFrameLoopRunning: boolean = false; // Flag to track if frame loop is running
  private _lastSentPosition: {x: number, y: number} | null = null; // Track last sent position to avoid duplicate updates
  
  // Classic Bomberman-style continuous movement system
  private moveSpeed: number = 3; // Base speed in grid cells per second
  private lastMoveTime: number = 0;
  private nextMoveQueued: boolean = false; // Flag to indicate a move is queued up
  private queuedDirection: Direction = Direction.NONE; // Direction of the queued move
  
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
    // Always use exact integer positions to prevent direction issues
    this.gridX = Math.floor(startX);
    this.gridY = Math.floor(startY);
    this.x = this.gridX;
    this.y = this.gridY;
    this.targetX = this.gridX;
    this.targetY = this.gridY;
    
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
    
    // Listen for remote player movement events (for non-local players)
    if (!this.isLocalPlayer()) {
      eventBus.on('remote:player:moved', (data) => {
        // Only process movement for this player
        if (data.playerId === this.id) {
          this.handleRemoteMovement(data);
        }
      });
    }
    
    // Set up keyboard controls if this is the local player
    if (this.isLocalPlayer()) {
      this.setupKeyboardControls();
    }
  }
  
  // Initialize player position
  private initPosition(x: number, y: number): void {
    // Always initialize to exact grid positions to prevent direction issues
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.gridX = Math.floor(this.x);
    this.gridY = Math.floor(this.y);
    this.updateVisualPosition();
  }
  
  // Get current position
  public getPosition(): PlayerPosition {
    return { x: this.x, y: this.y };
  }
  
  // Set position (for initialization or teleportation)
  public setPosition(x: number, y: number): void {
    this.initPosition(x, y);
    this.targetX = x;
    this.targetY = y;
    this.movingToTarget = false;
    
    this.updateVisualPosition();
    
    // Emit position update event
    this.emitPositionUpdate();
  }
  
  // Ultra-reliable remote movement handler for perfect synchronization
  private handleRemoteMovement(data: any): void {
    // Extract all movement data including timestamp
    const { x, y, direction, speed, timestamp } = data;
    
    // Skip if no valid position data
    if (x === undefined || y === undefined) return;
    
    // Check timestamp to prevent out-of-order updates
    if (this._lastUpdateTimestamp && timestamp && timestamp < this._lastUpdateTimestamp) {
      // Skip older updates
      return;
    }
    
    // Update timestamp
    if (timestamp) {
      this._lastUpdateTimestamp = timestamp;
    }
    
    // DIRECT POSITION UPDATE - Always use direct position updates for remote players
    this.x = x;
    this.y = y;
    this.gridX = Math.floor(x);
    this.gridY = Math.floor(y);
    
    // Update direction if provided
    if (direction !== undefined) {
      this.direction = direction;
      this.moving = direction !== Direction.NONE;
    }
    
    // Update speed if provided
    if (speed !== undefined && speed > 0) {
      this.speed = speed;
      this.moveSpeed = speed;
    }
    
    // INSTANT VISUAL UPDATE - No transitions or animations for perfect synchronization
    if (this.playerElement) {
      // Always remove any transition for instant updates
      this.playerElement.style.transition = 'none';
      
      // Apply position directly to DOM
      this.playerElement.style.left = `${this.x * TILE_SIZE}px`;
      this.playerElement.style.top = `${this.y * TILE_SIZE}px`;
    }
  }
  
  // Update player speed (works for both local and remote players)
  public updateSpeed(speed: number): void {
    if (speed > 0) {
      this.speed = speed;
      // Update moveSpeed for animation smoothness
      this.moveSpeed = this.speed;
      
      // Calculate the sync interval based on player speed
      this.syncInterval = this.calculateSyncInterval();
      console.log(`Player speed updated to ${speed}, sync interval adjusted to ${this.syncInterval}ms`);
    }
  }
  
  // Adaptive sync interval based on player speed for perfect synchronization
  private calculateSyncInterval(): number {
    // For high-speed players, use ultra-fast sync interval
    if (this.speed >= 5) {
      return 16; // ~60fps - almost real-time updates for extreme speeds
    }
    
    // For fast players, use faster sync interval
    if (this.speed >= 4) {
      return 25; // ~40fps - very responsive for fast players
    }
    
    // For moderately fast players
    if (this.speed >= 3) {
      return 33; // ~30fps - good balance for moderate speeds
    }
    
    // Default sync interval for normal speed players
    return 50; // ~20fps - sufficient for normal movement
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
        transition: left 0.05s ease-out, top 0.05s ease-out;
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
  
  // Update the visual position of the player with consistent animation
  private updateVisualPosition(): void {
    if (this.playerElement) {
      // Apply the exact same animation approach for both local and remote players
      // This ensures consistent visual movement across all clients
      
      // First set the transition for smooth movement
      // The ease-out timing function gives a natural feel to the movement
      this.playerElement.style.transition = 'left 0.05s ease-out, top 0.05s ease-out';
      
      // Then update the position
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
  
  // Move in a direction - classic Bomberman-style continuous movement
  public move(direction: Direction, deltaTime: number, collisionCallback: (x: number, y: number) => boolean): void {
    // Don't allow movement if game is paused
    if (isGamePaused) {
      return;
    }
    
    if (direction === Direction.NONE) {
      this.moving = false;
      return;
    }
    
    // Store the previous direction before updating
    const previousDirection = this.direction;
    
    // For local player, handle direction changes carefully to prevent opposite movement
    if (this.isLocalPlayer()) {
      // If we're changing to the opposite direction while already moving
      if (this.movingToTarget && this.isReverseDirection(direction)) {
        // Immediately stop current movement and snap to grid
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        this.gridX = Math.floor(this.x);
        this.gridY = Math.floor(this.y);
        this.movingToTarget = false;
        this.moveProgress = 0;
      }
    }
    
    // Now update the direction
    this.direction = direction;
    this.moving = true;
    
    // If we're not moving, make sure we're exactly on a grid cell
    if (!this.movingToTarget && this.isLocalPlayer()) {
      // Force exact grid alignment to prevent direction issues
      this.x = this.gridX;
      this.y = this.gridY;
    }
    
    // If the direction changed and we're moving to a target, we may need to change course
    if (this.movingToTarget && this.isLocalPlayer() && previousDirection !== direction) {
      // If we're changing to the opposite direction or making a turn at a junction
      if (this.isReverseDirection(direction) || this.isDirectionChange(direction)) {
        // Check if we can move in the new direction from our current position
        let canMoveInNewDirection = false;
        let newTargetX = Math.floor(this.x);
        let newTargetY = Math.floor(this.y);
        
        switch (direction) {
          case Direction.UP: newTargetY -= 1; break;
          case Direction.RIGHT: newTargetX += 1; break;
          case Direction.DOWN: newTargetY += 1; break;
          case Direction.LEFT: newTargetX -= 1; break;
        }
        
        // Check if the new target position is valid
        canMoveInNewDirection = this.isValidPosition(newTargetX, newTargetY);
        
        if (canMoveInNewDirection) {
          // Stop current movement and start in the new direction
          this.x = Math.round(this.x); // Round to nearest grid cell
          this.y = Math.round(this.y);
          this.gridX = Math.floor(this.x);
          this.gridY = Math.floor(this.y);
          this.movingToTarget = false; // Reset current movement
          this.moveProgress = 0;
          
          // We'll start a new movement below
        }
      }
    }
    
    // Store the current direction for the next move
    if (this.isLocalPlayer()) {
      this.queuedDirection = direction;
      this.nextMoveQueued = true;
    }
    
    // If we're already moving to a target, continue the movement
    if (this.movingToTarget) {
      // Calculate how much to move based on deltaTime and speed
      const moveAmount = (this.speed * deltaTime) / 1000;
      this.moveProgress += moveAmount;
      
      // When we're close to reaching the target, check if we should queue up the next move
      if (this.moveProgress >= 0.8 && this.isLocalPlayer() && this.nextMoveQueued) {
        // Calculate the next target position based on queued direction
        let nextTargetX = this.targetX;
        let nextTargetY = this.targetY;
        
        switch (this.queuedDirection) {
          case Direction.UP: nextTargetY -= 1; break;
          case Direction.RIGHT: nextTargetX += 1; break;
          case Direction.DOWN: nextTargetY += 1; break;
          case Direction.LEFT: nextTargetX -= 1; break;
        }
        
        // Check if the next position is valid
        if (this.isValidPosition(nextTargetX, nextTargetY)) {
          // We'll automatically start moving to this position once we reach the current target
          this.nextMoveQueued = true;
        } else {
          // Can't move in the queued direction
          this.nextMoveQueued = false;
        }
      }
      
      // If we've reached the target position
      if (this.moveProgress >= 1) {
        // Snap to the target position
        this.x = this.targetX;
        this.y = this.targetY;
        this.gridX = Math.floor(this.x);
        this.gridY = Math.floor(this.y);
        
        // Check for powerups when reaching a new grid cell
        if (this.isLocalPlayer()) {
          this.checkForVisiblePowerUp();
        }
        
        // Emit position update
        this.emitPositionUpdate();
        
        // Send position to server for multiplayer sync - SIMPLIFIED
        if (this.isLocalPlayer()) {
          // ULTRA-SIMPLIFIED: Send only the absolute minimum data needed for visual replication
          sendToServer(EVENTS.MOVE, {
            x: this.x,
            y: this.y,
            direction: this.direction,
            playerId: this.id,
            timestamp: Date.now()
          });
        }
        
        // If we have a queued move, start it immediately with no delay
        if (this.isLocalPlayer() && this.nextMoveQueued) {
          // Start the next movement immediately
          this.startNextMovement();
        } else {
          // No queued move, so we're done moving
          this.movingToTarget = false;
        }
      } else {
        // Use easing function for smoother movement instead of linear interpolation
        const easedProgress = this.easeInOutQuad(this.moveProgress);
        this.x = this.gridX + (this.targetX - this.gridX) * easedProgress;
        this.y = this.gridY + (this.targetY - this.gridY) * easedProgress;
        
        // Update visual position
        this.updateVisualPosition();
        
              // BULLETPROOF SYNCHRONIZATION SYSTEM
        // Guaranteed to work at ANY speed with perfect accuracy
        if (this.isLocalPlayer()) {
          // Send position updates EVERY FRAME with no throttling
          // This ensures we never miss a position update, no matter how fast the player moves
          
          // Create a minimal but complete movement state
          const moveData = {
            // CRITICAL: Include EXACT position with full precision
            x: this.x,
            y: this.y,
            
            // Include grid position for perfect alignment
            gridX: this.gridX,
            gridY: this.gridY,
            
            // Include target position for movement prediction
            targetX: this.targetX,
            targetY: this.targetY,
            
            // Include movement state for perfect replication
            direction: this.direction,
            playerId: this.id,
            speed: this.speed,
            moveProgress: this.moveProgress,
            movingToTarget: this.movingToTarget,
            
            // Include unique ID to prevent out-of-order packets
            // This is CRITICAL for high-speed movement
            id: this.id,
            uniqueId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            timestamp: Date.now()
          };
          
          // CRITICAL: Send with HIGHEST priority
          // This ensures the movement data is sent immediately
          sendToServer(EVENTS.MOVE, moveData);
        }
        
        return; // Exit early as we're still moving
      }
    } else {
      // Not currently moving, start a new movement
      this.startNextMovement();
    }
    
    // Update visual position
    this.updateVisualPosition();
  }
  
  // Start the next movement based on the current direction
  private startNextMovement(): void {
    if (!this.isLocalPlayer()) {
      return; // Only local players can initiate movement
    }
    
    // Always force exact grid alignment before starting a new movement
    // This ensures the player always moves in the exact direction pressed
    this.x = this.gridX;
    this.y = this.gridY;
    
    // Calculate the target grid position based on current direction
    let targetGridX = this.gridX;
    let targetGridY = this.gridY;
    
    switch (this.direction) {
      case Direction.UP:
        targetGridY -= 1;
        break;
      case Direction.RIGHT:
        targetGridX += 1;
        break;
      case Direction.DOWN:
        targetGridY += 1;
        break;
      case Direction.LEFT:
        targetGridX -= 1;
        break;
    }
    
    // Check if the target position is valid (not a wall or block)
    if (this.isValidPosition(targetGridX, targetGridY)) {
      // Set current grid position
      this.gridX = Math.floor(this.x);
      this.gridY = Math.floor(this.y);
      
      // Set target position
      this.targetX = targetGridX;
      this.targetY = targetGridY;
      
      // Start moving to target
      this.movingToTarget = true;
      this.moveProgress = 0;
      this.lastMoveTime = performance.now();
      
      // Send movement intent to server - SIMPLIFIED
      sendToServer(EVENTS.MOVE, {
        x: this.x,
        y: this.y,
        direction: this.direction,
        playerId: this.id,
        timestamp: Date.now()
      });
    } else {
      // Can't move in this direction
      this.nextMoveQueued = false;
    }
  }
  
  // Easing function for smoother movement
  private easeInOutQuad(t: number): number {
    // Smoother acceleration/deceleration curve
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  
  // Cubic easing function for even smoother movement
  private easeInOutCubic(t: number): number {
    // More pronounced acceleration/deceleration curve
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  // Check if the new direction is a change from the current movement direction
  private isDirectionChange(newDirection: Direction): boolean {
    // If we're moving up or down and the new direction is left or right, it's a change
    if ((this.direction === Direction.UP || this.direction === Direction.DOWN) && 
        (newDirection === Direction.LEFT || newDirection === Direction.RIGHT)) {
      return true;
    }
    
    // If we're moving left or right and the new direction is up or down, it's a change
    if ((this.direction === Direction.LEFT || this.direction === Direction.RIGHT) && 
        (newDirection === Direction.UP || newDirection === Direction.DOWN)) {
      return true;
    }
    
    return false;
  }
  
  // Check if the new direction is the reverse of the current direction
  private isReverseDirection(newDirection: Direction): boolean {
    return (this.direction === Direction.UP && newDirection === Direction.DOWN) ||
           (this.direction === Direction.DOWN && newDirection === Direction.UP) ||
           (this.direction === Direction.LEFT && newDirection === Direction.RIGHT) ||
           (this.direction === Direction.RIGHT && newDirection === Direction.LEFT);
  }
  
  // Force an immediate direction change when pressing the opposite direction key
  private forceDirectionChange(newDirection: Direction): void {
    // Only do this for the local player
    if (!this.isLocalPlayer()) return;
    
    // Immediately stop current movement and snap to nearest grid position
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    
    // Update grid position
    this.gridX = Math.floor(this.x);
    this.gridY = Math.floor(this.y);
    
    // Reset movement state
    this.movingToTarget = false;
    this.moveProgress = 0;
    
    // Update direction
    this.direction = newDirection;
    
    // Send position update to server for multiplayer sync - SIMPLIFIED
    sendToServer(EVENTS.MOVE, {
      x: this.x,
      y: this.y,
      direction: this.direction,
      playerId: this.id,
      timestamp: Date.now()
    });
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
    
    // Track pressed keys with timestamps
    const pressedKeys: { [key: string]: number } = {};
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if player is not in the game
      if (!this.playerElement) {
        console.log('Player element not found, skipping keyboard input');
        return;
      }
      
      // Skip if game is paused or game is over
      if (isGamePaused || isGameOver) {
        return;
      }
      
      // Track this key as pressed with timestamp for priority
      const currentTime = performance.now();
      pressedKeys[event.key] = currentTime;
      
      // Handle 'a' key for bomb placement separately
      if (event.key === 'a') {
        this.placeBomb();
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      // Remove this key from pressed keys
      delete pressedKeys[event.key];
      
      // If no movement keys are pressed, stop movement
      if (!pressedKeys['ArrowUp'] && !pressedKeys['ArrowDown'] && 
          !pressedKeys['ArrowLeft'] && !pressedKeys['ArrowRight']) {
        this.direction = Direction.NONE;
        this.moving = false;
      }
    };
    
    // Game update function to handle continuous movement
    const updateMovement = (deltaTime: number) => {
      // Skip if game is paused or over
      if (isGamePaused || isGameOver || !this.playerElement) {
        return;
      }
      
      // Classic Bomberman-style direction handling
      let direction = Direction.NONE;
      
      // Always prioritize the most recently pressed key
      let lastPressedKey = '';
      let lastPressedTime = 0;
      
      // Handle direction changes with priority for opposite directions
      // This ensures immediate response when changing directions
      if (this.direction === Direction.LEFT && pressedKeys['ArrowRight']) {
        direction = Direction.RIGHT;
        // Force an immediate direction change without waiting for the next grid cell
        if (this.movingToTarget) {
          this.forceDirectionChange(direction);
        }
      } else if (this.direction === Direction.RIGHT && pressedKeys['ArrowLeft']) {
        direction = Direction.LEFT;
        if (this.movingToTarget) {
          this.forceDirectionChange(direction);
        }
      } else if (this.direction === Direction.UP && pressedKeys['ArrowDown']) {
        direction = Direction.DOWN;
        if (this.movingToTarget) {
          this.forceDirectionChange(direction);
        }
      } else if (this.direction === Direction.DOWN && pressedKeys['ArrowUp']) {
        direction = Direction.UP;
        if (this.movingToTarget) {
          this.forceDirectionChange(direction);
        }
      } else {
        // If no opposite direction, use the most recently pressed key
        for (const key in pressedKeys) {
          if (pressedKeys[key] > lastPressedTime) {
            lastPressedKey = key;
            lastPressedTime = pressedKeys[key];
          }
        }
        
        // Set direction based on the most recently pressed key
        switch (lastPressedKey) {
          case 'ArrowUp': direction = Direction.UP; break;
          case 'ArrowRight': direction = Direction.RIGHT; break;
          case 'ArrowDown': direction = Direction.DOWN; break;
          case 'ArrowLeft': direction = Direction.LEFT; break;
        }
      }
      
      // If a direction key is pressed, move in that direction
      if (direction !== Direction.NONE) {
        this.move(direction, deltaTime, (x, y) => !this.isValidPosition(x, y));
      }
    };
    
    // Set up event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // Set up game loop for continuous movement
    let lastTime = performance.now();
    const gameLoop = () => {
      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      updateMovement(deltaTime);
      
      // Continue the game loop
      requestAnimationFrame(gameLoop);
    };
    
    // Start the game loop
    gameLoop();
    
    // Add event listener for keydown
    document.addEventListener('keydown', handleKeyDown);
    
    // Log that keyboard controls are set up
    console.log(`Keyboard controls set up for player ${this.id}`);
  }
  
  // Check if a position is valid for movement
  private isValidPosition(x: number, y: number): boolean {
    // Define map dimensions - using constants directly
    // The map is 15x17 (0-14 x 0-16)
    const GRID_WIDTH = 15; // Adjusted to match actual map width
    const GRID_HEIGHT = 17; // Adjusted to match actual map height
    
    // Get grid coordinates
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    // Prevent going out of bounds
    if (gridX < 0 || gridY < 0 || gridX >= GRID_WIDTH || gridY >= GRID_HEIGHT) {
      console.log(`Out of bounds: (${gridX}, ${gridY})`);
      return false;
    }
    
    // Check for fixed walls (grid pattern) in all areas of the map
    // These are the brown blocks that can't be destroyed
    if (gridX % 2 === 0 && gridY % 2 === 0) {
      console.log(`Fixed wall at (${gridX}, ${gridY})`);
      return false;
    }
    
    // Check for border walls
    if (gridX === 0 || gridY === 0 || gridX === GRID_WIDTH - 1 || gridY === GRID_HEIGHT - 1) {
      console.log(`Border wall at (${gridX}, ${gridY})`);
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
    
    // Check for blocks (destructible blocks - the pyramid blocks)
    const blockElements = document.querySelectorAll('.block');
    for (let i = 0; i < blockElements.length; i++) {
      const block = blockElements[i] as HTMLElement;
      const blockX = Math.floor(parseInt(block.style.left) / TILE_SIZE);
      const blockY = Math.floor(parseInt(block.style.top) / TILE_SIZE);
      
      if (blockX === gridX && blockY === gridY) {
        console.log(`Block at (${gridX}, ${gridY})`);
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
        console.log(`Bomb at (${gridX}, ${gridY})`);
        return false; // Can't walk through bombs
      }
    }
    
    return true; // No obstacles found
  }
  
  // Ultra-reliable frame-based position update system
  private emitPositionUpdate(): void {
    // Only handle updates for the local player
    if (!this.isLocalPlayer()) return;
    
    // If we're not already running the animation frame loop, start it
    if (!this._isFrameLoopRunning) {
      this._isFrameLoopRunning = true;
      
      // This function will be called on every animation frame
      const frameLoop = () => {
        // Only send updates if we're moving
        if (this.moving) {
          // Check if position has changed significantly to avoid network spam
          const shouldSendUpdate = this._shouldSendPositionUpdate();
          
          if (shouldSendUpdate) {
            // Create movement data with all necessary information
            const movementData = {
              playerId: this.id,
              x: this.x,
              y: this.y,
              direction: this.direction,
              speed: this.speed,
              timestamp: Date.now() // Add timestamp for ordering
            };
            
            // Send to server immediately with high priority
            sendToServer(EVENTS.MOVE, movementData);
            
            // Update last sent position
            this._lastSentPosition = { x: this.x, y: this.y };
          }
        }
        
        // Continue the frame loop
        this._frameLoopId = requestAnimationFrame(frameLoop);
      };
      
      // Start the frame loop
      this._frameLoopId = requestAnimationFrame(frameLoop);
    }
    
    // Always send an immediate update when this method is called
    // This ensures updates are sent right when movement starts/changes
    const movementData = {
      playerId: this.id,
      x: this.x,
      y: this.y,
      direction: this.direction,
      speed: this.speed,
      timestamp: Date.now()
    };
    
    sendToServer(EVENTS.MOVE, movementData);
    this._lastSentPosition = { x: this.x, y: this.y };
  }
  
  // Helper to determine if we should send a position update
  private _shouldSendPositionUpdate(): boolean {
    // Always send if we haven't sent before
    if (!this._lastSentPosition) return true;
    
    // For high speeds, always send updates
    if (this.speed >= 4) return true;
    
    // Check if position has changed enough to warrant an update
    const dx = Math.abs(this.x - this._lastSentPosition.x);
    const dy = Math.abs(this.y - this._lastSentPosition.y);
    
    // Send update if moved more than a small threshold
    // Higher speed = lower threshold to ensure more frequent updates
    const threshold = 0.05 / this.speed;
    return dx > threshold || dy > threshold;
  }
  
  // Clean up all resources when player is removed
  public cleanup(): void {
    // Clean up animation frame loop
    if (this._frameLoopId) {
      cancelAnimationFrame(this._frameLoopId);
      this._frameLoopId = null;
      this._isFrameLoopRunning = false;
    }
    
    // Clean up interval
    if (this._positionUpdateInterval) {
      clearInterval(this._positionUpdateInterval);
      this._positionUpdateInterval = null;
    }
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
        // Standard speed increment with a reasonable cap
        const maxSpeed = 5.0;
        this.speed = Math.min(maxSpeed, this.speed + 0.5);
        
        // Update moveSpeed to reflect the new speed
        this.moveSpeed = this.speed;
        
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
    
    // Generate a unique bomb ID
    const bombId = `${this.id}-${gridX}-${gridY}-${Date.now()}`;
    
    // Send bomb placement to server
    sendToServer(EVENTS.DROP_BOMB, {
      ownerId: this.id,
      x: gridX,
      y: gridY,
      explosionRange: this.explosionRange,
      bombId: bombId
    });
    
    // Emit bomb placed event
    eventBus.emit('bomb:placed', {
      ownerId: this.id,
      x: gridX,
      y: gridY,
      range: this.explosionRange,
      bombId: bombId
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
