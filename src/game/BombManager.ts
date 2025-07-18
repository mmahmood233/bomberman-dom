// Bomb management system
import { Bomb, ExplosionCoordinates } from '../entities/bomb';
import { eventBus } from '../../framework/events';

interface BombPlacementOptions {
  ownerId: string;
  x: number;
  y: number;
  explosionRange?: number;
  bombId?: string; // Unique identifier for the bomb
}

interface PlayerBombStats {
  maxBombs: number;
  activeBombs: number;
  explosionRange: number;
}

export class BombManager {
  private bombs: Map<string, Bomb[]> = new Map();
  private playerStats: Map<string, PlayerBombStats> = new Map();
  
  constructor() {
    // Listen for bomb explosion events
    eventBus.on('bomb:explode', this.handleBombExplosion.bind(this));
  }

  // Initialize a player's bomb stats
  public initializePlayer(playerId: string): void {
    this.playerStats.set(playerId, {
      maxBombs: 1, // Default: player can place 1 bomb at a time
      activeBombs: 0,
      explosionRange: 1 // Default explosion range
    });
    
    this.bombs.set(playerId, []);
  }

  // Remove a player from tracking (when they disconnect or die)
  public removePlayer(playerId: string): void {
    // Clear all active bombs from this player
    const playerBombs = this.bombs.get(playerId) || [];
    playerBombs.forEach(bomb => bomb.cancelCountdown());
    
    this.bombs.delete(playerId);
    this.playerStats.delete(playerId);
  }

  // Place a bomb if the player hasn't reached their limit
  public placeBomb({ ownerId, x, y, explosionRange, bombId }: BombPlacementOptions): boolean {
    const playerStats = this.playerStats.get(ownerId);
    if (!playerStats) return false;
    
    // Check if player has reached their bomb limit
    if (playerStats.activeBombs >= playerStats.maxBombs) {
      return false;
    }
    
    // Create a new bomb and add it to the player's active bombs
    const bomb = new Bomb(
      ownerId, 
      x, 
      y, 
      explosionRange || playerStats.explosionRange,
      bombId
    );
    
    const playerBombs = this.bombs.get(ownerId) || [];
    playerBombs.push(bomb);
    this.bombs.set(ownerId, playerBombs);
    
    // Update player's active bomb count
    playerStats.activeBombs++;
    this.playerStats.set(ownerId, playerStats);
    
    // Emit event for bomb placement
    const bombPlacedData = { ownerId, x, y, bombId: bomb.id };
    console.log('Emitting bomb:placed event:', bombPlacedData);
    eventBus.emit('bomb:placed', bombPlacedData);
    
    // Also dispatch a DOM event for better compatibility
    const customEvent = new CustomEvent('bomb:placed', { detail: bombPlacedData });
    window.dispatchEvent(customEvent);
    
    return true;
  }

  // Handle bomb explosion event
  private handleBombExplosion(data: { 
    ownerId: string, 
    origin: ExplosionCoordinates, 
    coordinates: ExplosionCoordinates[] 
  }): void {
    const { ownerId } = data;
    
    // Find and remove the exploded bomb from player's active bombs
    const playerBombs = this.bombs.get(ownerId) || [];
    const bombIndex = playerBombs.findIndex(bomb => 
      bomb.x === data.origin.x && 
      bomb.y === data.origin.y &&
      bomb.hasExploded()
    );
    
    if (bombIndex !== -1) {
      playerBombs.splice(bombIndex, 1);
      this.bombs.set(ownerId, playerBombs);
      
      // Update player's active bomb count
      const playerStats = this.playerStats.get(ownerId);
      if (playerStats) {
        playerStats.activeBombs = Math.max(0, playerStats.activeBombs - 1);
        this.playerStats.set(ownerId, playerStats);
      }
    }
  }

  // Get all active bombs on the map
  public getAllBombs(): Bomb[] {
    const allBombs: Bomb[] = [];
    this.bombs.forEach(playerBombs => {
      allBombs.push(...playerBombs);
    });
    return allBombs;
  }

  // Get bombs placed by a specific player
  public getPlayerBombs(playerId: string): Bomb[] {
    return this.bombs.get(playerId) || [];
  }

  // Upgrade a player's bomb capacity
  public upgradeBombCapacity(playerId: string): void {
    const playerStats = this.playerStats.get(playerId);
    if (playerStats) {
      playerStats.maxBombs += 1;
      this.playerStats.set(playerId, playerStats);
      
      // Emit event for power-up (using a different event name to avoid conflicts)
      eventBus.emit('stat:updated', { 
        playerId, 
        type: 'bombCapacity', 
        value: playerStats.maxBombs 
      });
    }
  }

  // Upgrade a player's explosion range
  public upgradeExplosionRange(playerId: string): void {
    const playerStats = this.playerStats.get(playerId);
    if (playerStats) {
      playerStats.explosionRange += 1;
      this.playerStats.set(playerId, playerStats);
      
      // Emit event for power-up (using a different event name to avoid conflicts)
      eventBus.emit('stat:updated', { 
        playerId, 
        type: 'explosionRange', 
        value: playerStats.explosionRange 
      });
    }
  }

  // Get a player's current bomb stats
  public getPlayerBombStats(playerId: string): PlayerBombStats | undefined {
    return this.playerStats.get(playerId);
  }
}
