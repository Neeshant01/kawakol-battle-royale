import { io, Socket } from 'socket.io-client';

export class SocketClient {
  public socket: Socket;
  public id: string | null = null;
  public onInit: (data: any) => void = () => {};
  public onPlayerJoined: (player: any) => void = () => {};
  public onPlayerMoved: (data: any) => void = () => {};
  public onPlayerLeft: (id: string) => void = () => {};
  public onPlayerHit: (data: any) => void = () => {};
  public onPlayerKilled: (data: any) => void = () => {};
  public onLootPickedUp: (data: any) => void = () => {};
  public onZoneUpdate: (zone: any) => void = () => {};
  public onMatchStarting: (timer: number) => void = () => {};
  public onMatchStarted: (data: any) => void = () => {};
  public onVoiceSignal: (data: any) => void = () => {};

  constructor() {
    const socketUrl = import.meta.env.VITE_SOCKET_URL;
    this.socket = io(socketUrl || undefined, {
      transports: ['websocket', 'polling'],
      timeout: 3000,
      reconnectionAttempts: 4,
    });

    this.socket.on('init', (data) => {
      this.id = data.id;
      this.onInit(data);
    });

    this.socket.on('playerJoined', (player) => this.onPlayerJoined(player));
    this.socket.on('playerMoved', (data) => this.onPlayerMoved(data));
    this.socket.on('playerLeft', (id) => this.onPlayerLeft(id));
    this.socket.on('playerHit', (data) => this.onPlayerHit(data));
    this.socket.on('playerKilled', (data) => this.onPlayerKilled(data));
    this.socket.on('lootPickedUp', (data) => this.onLootPickedUp(data));
    this.socket.on('zoneUpdate', (zone) => this.onZoneUpdate(zone));
    this.socket.on('matchStarting', (timer) => this.onMatchStarting(timer));
    this.socket.on('matchStarted', (data) => this.onMatchStarted(data));
    this.socket.on('voiceSignal', (data) => this.onVoiceSignal(data));
  }

  public join(name: string) {
    this.socket.emit('join', name);
  }

  public move(data: { x: number; y: number; z: number; rotation: number }) {
    this.socket.emit('move', data);
  }

  public shoot(targetId: string, damage: number) {
    this.socket.emit('shoot', { targetId, damage });
  }

  public pickupLoot(lootId: string) {
    this.socket.emit('pickupLoot', lootId);
  }

  public sendVoiceSignal(targetId: string, signal: any) {
    this.socket.emit('voiceSignal', { targetId, signal });
  }
}
