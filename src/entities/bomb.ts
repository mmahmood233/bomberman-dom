// Bomb entity logic
import { eventBus } from '../../framework/events';

export interface ExplosionCoordinates {
  x: number;
  y: number;
}

export class Bomb {
  private countdownTime: number = 3000; // 3 seconds
  private explosionRange: number = 1; // Default explosion range
  private exploded: boolean = false;
  private explosionTimer: number | null = null;
  public id: string; // Unique identifier for the bomb
  
  constructor(
    public ownerId: string, 
    public x: number, 
    public y: number,
    explosionRange?: number,
    bombId?: string
  ) {
    // Generate a unique ID if none provided
    this.id = bombId || `${ownerId}-${x}-${y}-${Date.now()}`;
    
    // Set custom explosion range if provided
    if (explosionRange) {
      this.explosionRange = explosionRange;
    }
    
    // Start the countdown as soon as the bomb is created
    this.startCountdown();
  }

  // Start the bomb countdown
  private startCountdown(): void {
    this.explosionTimer = window.setTimeout(() => {
      this.explode();
    }, this.countdownTime);
  }

  // Cancel the explosion timer (useful if bomb is removed before explosion)
  public cancelCountdown(): void {
    if (this.explosionTimer !== null) {
      window.clearTimeout(this.explosionTimer);
      this.explosionTimer = null;
    }
  }

  // Explode the bomb
  private explode(): void {
    if (this.exploded) return; // Prevent multiple explosions
    
    this.exploded = true;
    
    // Calculate explosion coordinates in all four directions
    const explosionCoordinates = this.calculateExplosionCoordinates();
    
    // Emit explosion event with coordinates
    eventBus.emit('bomb:explode', {
      ownerId: this.ownerId,
      origin: { x: this.x, y: this.y },
      coordinates: explosionCoordinates
    });
  }

  // Calculate all coordinates affected by the explosion
  private calculateExplosionCoordinates(): ExplosionCoordinates[] {
    const coordinates: ExplosionCoordinates[] = [];
    
    // Add the bomb's own position
    coordinates.push({ x: this.x, y: this.y });
    
    // Add coordinates in all four directions (up, right, down, left)
    const directions = [
      { dx: 0, dy: -1 }, // up
      { dx: 1, dy: 0 },  // right
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }  // left
    ];
    
    directions.forEach(dir => {
      for (let i = 1; i <= this.explosionRange; i++) {
        coordinates.push({
          x: this.x + (dir.dx * i),
          y: this.y + (dir.dy * i)
        });
      }
    });
    
    return coordinates;
  }

  // Check if the bomb has exploded
  public hasExploded(): boolean {
    return this.exploded;
  }

  // Get remaining time until explosion (in ms)
  public getRemainingTime(): number {
    if (this.exploded || this.explosionTimer === null) return 0;
    
    // Calculate remaining time based on when the timer was started
    const elapsed = Date.now() - (Date.now() - this.countdownTime);
    return Math.max(0, this.countdownTime - elapsed);
  }

  // Force the bomb to explode immediately
  public forceExplode(): void {
    this.cancelCountdown();
    this.explode();
  }
}