// Custom multiplayer events (join, move, bomb, etc.)
export const EVENTS = {
  // Connection events
  JOIN: 'join',
  LEAVE: 'leave',
  DISCONNECT: 'disconnect',
  
  // Lobby events
  JOIN_LOBBY: 'join_lobby',
  LEAVE_LOBBY: 'leave_lobby',
  LOBBY_UPDATE: 'lobby_update',
  PLAYER_READY: 'player_ready',
  START_GAME: 'start_game',
  GAME_READY: 'game_ready',
  
  // Game events
  MOVE: 'move',
  DROP_BOMB: 'drop_bomb',
  BOMB_EXPLODE: 'bomb:explode',
  BLOCK_DESTROYED: 'block:destroyed',
  POWERUP_SPAWNED: 'powerup:spawned',
  COLLECT_POWERUP: 'collect_powerup',
  PLAYER_HIT: 'player_hit',
  PLAYER_ELIMINATED: 'player_eliminated',
  GAME_STATE_UPDATE: 'game_state_update',
  GAME_OVER: 'game_over',
  END_GAME: 'end_game',
  
  // Chat events
  CHAT: 'chat',
  
  // Player events
  PLAYER_NUMBER: 'player:number',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left'
};

// Event data interfaces
export interface PowerUpSpawnedEventData {
  x: number;
  y: number;
  type: string;
  timestamp: number;
}

export interface MoveEventData {
  x: number;
  y: number;
  direction: any; // Using 'any' to support both string and Direction enum
  playerId?: string;
}

export interface DropBombEventData {
  x: number;
  y: number;
  explosionRange?: number;
  playerId?: string;
}

export interface CollectPowerupEventData {
  powerupId: string;
  playerId?: string;
  powerupType?: string;
  x?: number;
  y?: number;
}

export interface PlayerData {
  id: string;
  nickname: string;
  isReady: boolean;
  color: string;
  playerNumber: number;
}

export interface LobbyData {
  players: PlayerData[];
  maxPlayers: number;
  gameInProgress: boolean;
}

export interface ChatEventData {
  playerId: string;
  nickname: string;
  message: string;
  timestamp: number;
  playerNumber?: number;
}