import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { buildWorldLayout } from './src/game/world/layout';

const PORT = 3000;

interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  health: number;
  kills: number;
  weapon: string | null;
  state: 'lobby' | 'jumping' | 'alive' | 'dead';
}

interface Loot {
  id: string;
  type: 'AR' | 'Sniper' | 'SMG' | 'Shotgun' | 'Medkit' | 'Ammo';
  x: number;
  z: number;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const players: Map<string, Player> = new Map();
  const worldLayout = buildWorldLayout();
  const lotsByZone = worldLayout.buildingLots.reduce<Record<string, typeof worldLayout.buildingLots>>((acc, lot) => {
    acc[lot.zoneId] ??= [];
    acc[lot.zoneId].push(lot);
    return acc;
  }, {});
  let loot: Loot[] = [];
  let zone = { x: 100, z: 260, radius: 1650, targetRadius: 1650 };
  let matchState: 'waiting' | 'starting' | 'playing' | 'ended' = 'waiting';
  let matchTimer = 0;

  // Initialize loot
  function spawnLoot() {
    loot = [];
    const types: Loot['type'][] = ['AR', 'Sniper', 'SMG', 'Shotgun', 'Medkit', 'Ammo'];
    const weightedLots = [
      ...(lotsByZone.townCore ?? []),
      ...(lotsByZone.townCore ?? []),
      ...(lotsByZone.townCore ?? []),
      ...(lotsByZone.westVillage ?? []),
      ...(lotsByZone.westVillage ?? []),
      ...(lotsByZone.outerHamlets ?? []),
      ...(lotsByZone.damLake ?? []),
    ];

    for (let i = 0; i < 140; i++) {
      const lot = weightedLots[Math.floor(Math.random() * weightedLots.length)];
      const spread = lot.zoneId === 'townCore' ? 5 : 8;
      loot.push({
        id: uuidv4(),
        type: types[Math.floor(Math.random() * types.length)],
        x: lot.center.x + (Math.random() - 0.5) * spread,
        z: lot.center.z + (Math.random() - 0.5) * spread,
      });
    }
  }

  function pickSpawnPoint() {
    const candidates = [
      ...(lotsByZone.outerHamlets ?? []),
      ...(lotsByZone.westVillage ?? []),
      ...(lotsByZone.centralFields ?? []),
    ];
    const lot = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      x: lot.center.x + (Math.random() - 0.5) * 10,
      z: lot.center.z + (Math.random() - 0.5) * 10,
      y: 12,
    };
  }

  spawnLoot();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (name: string) => {
      const player: Player = {
        id: socket.id,
        name: name || `Player_${socket.id.slice(0, 4)}`,
        x: 0,
        y: 100, // Start high for jumping
        z: 0,
        rotation: 0,
        health: 100,
        kills: 0,
        weapon: null,
        state: 'lobby',
      };
      players.set(socket.id, player);
      
      // If match is already playing, let the new player join immediately
      if (matchState === 'playing') {
        player.state = 'alive';
        const spawn = pickSpawnPoint();
        player.x = spawn.x;
        player.z = spawn.z;
        player.y = spawn.y;
      }

      socket.emit('init', {
        id: socket.id,
        players: Array.from(players.values()),
        loot,
        zone,
        matchState,
        worldBounds: worldLayout.bounds,
        landmarks: worldLayout.landmarks,
      });

      socket.broadcast.emit('playerJoined', player);
    });

    socket.on('move', (data: { x: number; y: number; z: number; rotation: number }) => {
      const player = players.get(socket.id);
      if (player && player.state !== 'dead') {
        player.x = data.x;
        player.y = data.y;
        player.z = data.z;
        player.rotation = data.rotation;
        socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
      }
    });

    socket.on('shoot', (data: { targetId: string; damage: number }) => {
      const shooter = players.get(socket.id);
      const target = players.get(data.targetId);
      
      if (shooter && target && target.state === 'alive') {
        target.health -= data.damage;
        if (target.health <= 0) {
          target.health = 0;
          target.state = 'dead';
          shooter.kills++;
          io.emit('playerKilled', { victimId: target.id, killerId: shooter.id });
        } else {
          io.emit('playerHit', { id: target.id, health: target.health });
        }
      }
    });

    socket.on('pickupLoot', (lootId: string) => {
      const player = players.get(socket.id);
      const lootIndex = loot.findIndex(l => l.id === lootId);
      if (player && lootIndex !== -1) {
        const item = loot[lootIndex];
        // Simple logic: if it's a weapon, equip it
        if (['AR', 'Sniper', 'SMG', 'Shotgun'].includes(item.type)) {
          player.weapon = item.type;
        }
        loot.splice(lootIndex, 1);
        io.emit('lootPickedUp', { lootId, playerId: socket.id, itemType: item.type });
      }
    });

    socket.on('voiceSignal', (data: { targetId: string; signal: any }) => {
      io.to(data.targetId).emit('voiceSignal', { senderId: socket.id, signal: data.signal });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      players.delete(socket.id);
      io.emit('playerLeft', socket.id);
    });
  });

  // Game Loop for Zone
  setInterval(() => {
    if (matchState === 'playing') {
      if (zone.radius > zone.targetRadius) {
        zone.radius -= 0.1;
      } else if (Math.random() < 0.01) {
        zone.targetRadius = Math.max(10, zone.radius * 0.7);
      }

      // Check players in zone
      players.forEach(player => {
        if (player.state === 'alive') {
          const dist = Math.sqrt(Math.pow(player.x - zone.x, 2) + Math.pow(player.z - zone.z, 2));
          if (dist > zone.radius) {
            player.health -= 0.5;
            if (player.health <= 0) {
              player.health = 0;
              player.state = 'dead';
              io.emit('playerKilled', { victimId: player.id, killerId: 'ZONE' });
            } else {
              io.emit('playerHit', { id: player.id, health: player.health });
            }
          }
        }
      });

      io.emit('zoneUpdate', zone);
    }
  }, 1000);

  // Matchmaking logic
  setInterval(() => {
    if (matchState === 'waiting' && players.size >= 1) {
      matchState = 'starting';
      matchTimer = 10;
      io.emit('matchStarting', matchTimer);
    } else if (matchState === 'starting') {
      matchTimer--;
      if (matchTimer <= 0) {
        matchState = 'playing';
        spawnLoot();
        players.forEach(p => {
          p.state = 'alive';
          p.health = 100;
          const spawn = pickSpawnPoint();
          p.x = spawn.x;
          p.z = spawn.z;
          p.y = spawn.y;
        });
        io.emit('matchStarted', { players: Array.from(players.values()), loot, worldBounds: worldLayout.bounds, landmarks: worldLayout.landmarks });
      } else {
        io.emit('matchStarting', matchTimer);
      }
    }
  }, 1000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
