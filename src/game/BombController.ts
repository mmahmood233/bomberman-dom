// Bomb controller - handles player input for bomb placement
import { BombManager } from './BombManager';
import { eventBus } from '../../framework/events';

interface PlayerPosition {
  id: string;
  x: number;
  y: number;
}

export class BombController {
  private playerPositions: Map<string, { x: number, y: number }> = new Map();
  private keyStates: Map<string, boolean> = new Map();
  private bombCooldowns: Map<string, number> = new Map();
  private cooldownTime: number = 500; // 500ms cooldown between bomb placements
  
  constructor(private bombManager: BombManager) {
    // Listen for player movement events to track positions
    eventBus.on('player:moved', this.updatePlayerPosition.bind(this));
    
    // Also listen for custom DOM events for testing
    window.addEventListener('player:moved', this.updatePlayerPosition.bind(this));
    
    // Set up keyboard event listeners
    this.setupKeyboardListeners();
  }

  // Update player position when they move
  private updatePlayerPosition(data: PlayerPosition | CustomEvent): void {
    // Handle both direct data and CustomEvent
    const playerData = (data as any).detail ? (data as any).detail : data;
    this.playerPositions.set(playerData.id, { x: playerData.x, y: playerData.y });
  }

  // Set up keyboard event listeners for bomb placement
  private setupKeyboardListeners(): void {
    // Map keys to player numbers
    const keyToPlayerNumber: Record<string, string> = {
      'a': '1',     // A key for player 1
      'Enter': '2', // Enter for player 2
      'r': '3',     // R key for player 3
      '0': '4'      // 0 key for player 4 (numpad)
    };
    
    // Handle keydown events
    window.addEventListener('keydown', (event) => {
      // Check if this key is a bomb placement key
      if (Object.keys(keyToPlayerNumber).includes(event.key)) {
        // Get the local player ID and number from localStorage
        const localPlayerId = localStorage.getItem('playerId');
        const localPlayerNumber = localStorage.getItem('playerNumber');
        
        if (!localPlayerId || !localPlayerNumber) {
          console.warn('Local player ID or number not found in localStorage');
          return;
        }
        
        // Check if the pressed key corresponds to the local player's number
        if (keyToPlayerNumber[event.key] === localPlayerNumber) {
          console.log(`Local player ${localPlayerNumber} (ID: ${localPlayerId}) pressed bomb key`);
          this.keyStates.set(localPlayerId, true);
          this.tryPlaceBomb(localPlayerId);
        }
      }
    });
    
    // Handle keyup events
    window.addEventListener('keyup', (event) => {
      // Check if this key is a bomb placement key
      if (Object.keys(keyToPlayerNumber).includes(event.key)) {
        // Get the local player ID and number from localStorage
        const localPlayerId = localStorage.getItem('playerId');
        const localPlayerNumber = localStorage.getItem('playerNumber');
        
        if (!localPlayerId || !localPlayerNumber) {
          return;
        }
        
        // Check if the released key corresponds to the local player's number
        if (keyToPlayerNumber[event.key] === localPlayerNumber) {
          this.keyStates.set(localPlayerId, false);
        }
      }
    });
  }

  // Try to place a bomb for a player
  private tryPlaceBomb(playerId: string): void {
    // Check if player is on cooldown
    const lastBombTime = this.bombCooldowns.get(playerId) || 0;
    const currentTime = Date.now();
    
    if (currentTime - lastBombTime < this.cooldownTime) {
      return; // Still on cooldown
    }
    
    // Get player position
    const position = this.playerPositions.get(playerId);
    if (!position) {
      console.warn(`No position found for player ${playerId}`);
      return;
    }
    
    // Round position to grid coordinates
    const gridX = Math.floor(position.x);
    const gridY = Math.floor(position.y);
    
    // Check if there's already a bomb at this position
    const allBombs = this.bombManager.getAllBombs();
    const bombAtPosition = allBombs.some(bomb => 
      Math.floor(bomb.x) === gridX && 
      Math.floor(bomb.y) === gridY
    );
    
    if (bombAtPosition) {
      console.log('Cannot place bomb: position already occupied');
      return; // Can't place bomb where one already exists
    }
    
    // Generate a unique bomb ID using coordinates and owner ID
    const bombId = `${playerId}-${gridX}-${gridY}-${Date.now()}`;
    
    // Try to place the bomb
    const success = this.bombManager.placeBomb({
      ownerId: playerId,
      x: gridX,
      y: gridY,
      bombId: bombId
    });
    
    if (success) {
      // Set cooldown for this player
      this.bombCooldowns.set(playerId, currentTime);
      
      // Debug log player position
      console.log(`Player ${playerId} placed bomb at position:`, { gridX, gridY });
      
      // Emit bomb:thrown event with player and bomb positions
      const eventData = {
        ownerId: playerId,
        playerX: position.x,
        playerY: position.y,
        bombX: gridX,
        bombY: gridY,
        bombId: bombId
      };
      
      console.log('Emitting bomb:thrown event with data:', eventData);
      eventBus.emit('bomb:thrown', eventData);
      
      // Play bomb placement sound
      this.playBombPlacementSound();
    }
  }

  // Play sound effect for bomb placement
  private playBombPlacementSound(): void {
    // Create a simple audio effect for bomb placement
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  }

  // Initialize a new player
  public initializePlayer(playerId: string): void {
    this.bombManager.initializePlayer(playerId);
  }

  // Remove a player
  public removePlayer(playerId: string): void {
    this.bombManager.removePlayer(playerId);
    this.playerPositions.delete(playerId);
    this.keyStates.delete(playerId);
    this.bombCooldowns.delete(playerId);
  }
}
