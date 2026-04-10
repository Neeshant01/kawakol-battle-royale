import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Capacitor } from '@capacitor/core';
import { Backpack, Crosshair, Map as MapIcon, Navigation, Shield, Skull, Users, Zap } from 'lucide-react';
import characterPortrait from './assets/nikita-vasilkov-1-main.jpg';
import { GameAudio } from './game/audio';
import { Engine } from './game/Engine';
import { Input } from './game/Input';
import { createOfflineLoot, createOfflineSpawn, createOfflineZone, shrinkOfflineZone, type OfflineLoot } from './game/offlineSession';
import { Player } from './game/Player';
import { RemotePlayer } from './game/RemotePlayer';
import { SocketClient } from './game/SocketClient';
import { World } from './game/World';
import { OfflineBotSystem } from './game/systems/OfflineBotSystem';
import { advanceZonePhase, INITIAL_ZONE_PHASE, zoneDamageForPhase, type ZonePhaseState } from './game/systems/zonePhases';
import { isWeaponId, WEAPON_CATALOG, type WeaponId } from './game/systems/weaponData';
import { FullMap, MiniMap } from './game/ui/MapWidgets';

type GameState = 'lobby' | 'joining' | 'playing' | 'dead' | 'result';
type SessionMode = 'online' | 'offline';
type ZoneState = { x: number; z: number; radius: number };
type Pin = { x: number; z: number; id: string };
type DropTarget = 'Kawakol Market' | 'Sokhodeora Dam' | 'Echo Point';
type WeaponSlotKey = 'primary' | 'secondary';
type WeaponSlotState = { type: WeaponId | null; mag: number; reserve: number };
type MatchResult = {
  title: string;
  placement: number;
  kills: number;
  survivedSeconds: number;
};

type StarterLoadout = {
  weapon: WeaponId;
  medkits: number;
};

const DROP_TARGETS: DropTarget[] = ['Kawakol Market', 'Sokhodeora Dam', 'Echo Point'];
const ONLINE_MATCH_ENABLED = import.meta.env.VITE_ENABLE_ONLINE_MATCH === 'true';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const worldRef = useRef<World | null>(null);
  const playerRef = useRef<Player | null>(null);
  const inputRef = useRef<Input | null>(null);
  const socketRef = useRef<SocketClient | null>(null);
  const offlineBotsRef = useRef<OfflineBotSystem | null>(null);
  const remotePlayersRef = useRef<Map<string, RemotePlayer>>(new Map());
  const lootRef = useRef<any[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const offlineZoneTimerRef = useRef<number | null>(null);
  const reloadTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const healTimerRef = useRef<number | null>(null);
  const sessionModeRef = useRef<SessionMode>('offline');
  const audioRef = useRef<GameAudio | null>(typeof window !== 'undefined' ? new GameAudio() : null);
  const weaponSlotsRef = useRef<Record<WeaponSlotKey, WeaponSlotState>>({
    primary: { type: null, mag: 0, reserve: 0 },
    secondary: { type: null, mag: 0, reserve: 0 },
  });
  const activeWeaponSlotRef = useRef<WeaponSlotKey>('primary');
  const nearbyLootRef = useRef<OfflineLoot | null>(null);
  const isReloadingRef = useRef(false);
  const isHealingRef = useRef(false);
  const gameStateRef = useRef<GameState>('lobby');
  const zoneRef = useRef<ZoneState>({ x: 100, z: 260, radius: 1650 });
  const zonePhaseRef = useRef<ZonePhaseState>(INITIAL_ZONE_PHASE);
  const killsRef = useRef(0);
  const matchStartTimeRef = useRef<number | null>(null);
  const spawnProtectionUntilRef = useRef(0);

  const [gameState, setGameState] = useState<GameState>('lobby');
  const [sessionMode, setSessionMode] = useState<SessionMode>('offline');
  const [playerName, setPlayerName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [health, setHealth] = useState(100);
  const [kills, setKills] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [matchTimer, setMatchTimer] = useState<number | null>(null);
  const [weaponSlots, setWeaponSlots] = useState<Record<WeaponSlotKey, WeaponSlotState>>({
    primary: { type: null, mag: 0, reserve: 0 },
    secondary: { type: null, mag: 0, reserve: 0 },
  });
  const [activeWeaponSlot, setActiveWeaponSlot] = useState<WeaponSlotKey>('primary');
  const [isReloading, setIsReloading] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [sprintLocked, setSprintLocked] = useState(false);
  const [showBackpack, setShowBackpack] = useState(false);
  const [nearbyLoot, setNearbyLoot] = useState<OfflineLoot | null>(null);
  const [nearbyThreats, setNearbyThreats] = useState<Array<{ x: number; z: number }>>([]);
  const [medkits, setMedkits] = useState(0);
  const [showFullMap, setShowFullMap] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [playerPos, setPlayerPos] = useState(new THREE.Vector3(720, 0, -260));
  const [playerRot, setPlayerRot] = useState(0);
  const [zone, setZone] = useState<ZoneState>({ x: 100, z: 260, radius: 1650 });
  const [worldError, setWorldError] = useState<string | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<DropTarget>('Kawakol Market');
  const [joystickState, setJoystickState] = useState({ x: 0, y: 0, active: false });
  const [zonePhase, setZonePhase] = useState<ZonePhaseState>(INITIAL_ZONE_PHASE);
  const [zoneWarning, setZoneWarning] = useState('Safe zone stable');
  const [matchStartTime, setMatchStartTime] = useState<number | null>(null);
  const [hudNow, setHudNow] = useState(() => Date.now());
  const [resultSummary, setResultSummary] = useState<MatchResult | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const isNativePlatform = Capacitor.isNativePlatform();

  useEffect(() => {
    document.title = 'Kawakol Battle Royale';
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    zoneRef.current = zone;
  }, [zone]);

  useEffect(() => {
    zonePhaseRef.current = zonePhase;
  }, [zonePhase]);

  useEffect(() => {
    killsRef.current = kills;
  }, [kills]);

  useEffect(() => {
    matchStartTimeRef.current = matchStartTime;
  }, [matchStartTime]);

  useEffect(() => {
    weaponSlotsRef.current = weaponSlots;
  }, [weaponSlots]);

  useEffect(() => {
    activeWeaponSlotRef.current = activeWeaponSlot;
  }, [activeWeaponSlot]);

  useEffect(() => {
    nearbyLootRef.current = nearbyLoot;
  }, [nearbyLoot]);

  useEffect(() => {
    isReloadingRef.current = isReloading;
  }, [isReloading]);

  useEffect(() => {
    isHealingRef.current = isHealing;
  }, [isHealing]);

  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'dead' && gameState !== 'result') return undefined;

    setHudNow(Date.now());
    const timer = window.setInterval(() => {
      setHudNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [gameState]);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'dead') {
      audioRef.current?.startAmbient();
      return;
    }
    audioRef.current?.stopAmbient();
  }, [gameState]);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const engine = new Engine(containerRef.current);
      const world = new World(engine);
      const input = new Input();
      const player = new Player(engine, input, world);
      const socket = ONLINE_MATCH_ENABLED ? new SocketClient() : null;
      const offlineBots = new OfflineBotSystem(engine, world);

      engineRef.current = engine;
      worldRef.current = world;
      playerRef.current = player;
      inputRef.current = input;
      socketRef.current = socket;
      offlineBotsRef.current = offlineBots;

      world.updateZone(zone);
      world.updateStreaming(player.mesh.position);

      if (socket) {
        socket.socket.on('connect', () => setIsConnected(true));
        socket.socket.on('disconnect', () => setIsConnected(false));

        socket.onInit = (data) => {
        sessionModeRef.current = 'online';
        setSessionMode('online');
        setPlayerCount(data.players.length);
        world.updateLoot(data.loot);
        lootRef.current = data.loot;
        if (data.zone) {
          setZone(data.zone);
          world.updateZone(data.zone);
        }

        if (data.matchState === 'playing') {
          setGameState('playing');
          player.state = 'alive';
          setMatchTimer(null);
          const me = data.players.find((candidate: any) => candidate.id === socket.id);
          if (me) player.mesh.position.set(me.x, me.y, me.z);
        }

        data.players.forEach((candidate: any) => {
          if (candidate.id === socket.id) return;
          const remote = new RemotePlayer(engine, candidate.id, candidate.name);
          remote.update(candidate);
          remotePlayersRef.current.set(candidate.id, remote);
        });
        };

        socket.onPlayerJoined = (candidate) => {
        if (candidate.id === socket.id) return;
        const remote = new RemotePlayer(engine, candidate.id, candidate.name);
        remote.update(candidate);
        remotePlayersRef.current.set(candidate.id, remote);
        setPlayerCount((count) => count + 1);
        };

        socket.onPlayerMoved = (data) => {
        remotePlayersRef.current.get(data.id)?.update(data);
        };

        socket.onPlayerLeft = (id) => {
        const remote = remotePlayersRef.current.get(id);
        if (!remote) return;
        remote.destroy();
        remotePlayersRef.current.delete(id);
        setPlayerCount((count) => Math.max(0, count - 1));
        };

        socket.onPlayerHit = (data) => {
        if (data.id !== socket.id) return;
        setHealth(data.health);
        player.health = data.health;
        };

        socket.onPlayerKilled = (data) => {
        if (data.victimId === socket.id) {
          setGameState('dead');
          player.state = 'dead';
          setDeaths((value) => value + 1);
          audioRef.current?.play('damage');
        }
        if (data.killerId === socket.id) {
          setKills((value) => value + 1);
          player.kills += 1;
          audioRef.current?.play('pickup');
        }
        };

        socket.onLootPickedUp = (data) => {
        if (data.playerId === socket.id) {
          applyLootPickup(data.itemType);
        }
        lootRef.current = lootRef.current.filter((item) => item.id !== data.lootId);
        world.updateLoot(lootRef.current);
        };

        socket.onZoneUpdate = (nextZone) => {
        setZone(nextZone);
        world.updateZone(nextZone);
        };

        socket.onMatchStarting = (timer) => setMatchTimer(timer);

        socket.onMatchStarted = (data) => {
        sessionModeRef.current = 'online';
        setSessionMode('online');
        setGameState('playing');
        setMatchTimer(null);
        player.state = 'alive';
        player.health = 100;
        setHealth(100);
        setKills(0);
        resetLoadout();
        world.updateLoot(data.loot);
        lootRef.current = data.loot;
        const me = data.players.find((candidate: any) => candidate.id === socket.id);
        if (me) player.mesh.position.set(me.x, me.y, me.z);
        };

        socket.onVoiceSignal = async ({ senderId, signal }) => {
        let peer = peersRef.current.get(senderId);
        if (signal.type === 'offer') {
          if (!peer) peer = createPeer(senderId);
          await peer.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socketRef.current?.sendVoiceSignal(senderId, answer);
        } else if (signal.type === 'answer') {
          if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate && peer) {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
        };
      } else {
        setIsConnected(false);
      }

      let lastUiUpdate = 0;
      const animate = () => {
        requestAnimationFrame(animate);
        const delta = engine.getDelta();

        if (player.state !== 'dead') {
          player.update(delta);
          world.updateStreaming(player.mesh.position);

          if (sessionModeRef.current === 'offline' && gameStateRef.current === 'playing') {
            offlineBots.update(delta, {
              playerPosition: player.mesh.position,
              zone: zoneRef.current,
              onPlayerDamage: (amount) => inflictPlayerDamage(amount, 'Gunned Down'),
              onBotEliminated: () => undefined,
            });
            setPlayerCount(offlineBots.getAliveCount() + 1);
            if (offlineBots.getAliveCount() === 0) {
              player.state = 'dead';
              setGameState('result');
              setResultSummary({
                title: 'Winner Winner',
                placement: 1,
                kills: killsRef.current,
                survivedSeconds: matchStartTimeRef.current ? Math.floor((Date.now() - matchStartTimeRef.current) / 1000) : 0,
              });
            }
          }

          const now = performance.now();
          if (now - lastUiUpdate > 80) {
            setPlayerPos(player.mesh.position.clone());
            setPlayerRot(player.mesh.rotation.y);
            setJoystickState({
              x: input.joystick.x,
              y: input.joystick.y,
              active: Math.abs(input.joystick.x) > 0.05 || Math.abs(input.joystick.y) > 0.05,
            });
            if (sessionModeRef.current === 'offline' && gameStateRef.current === 'playing') {
              setNearbyThreats(
                offlineBots
                  .getAlivePositions()
                  .filter((bot) => Math.hypot(bot.x - player.mesh.position.x, bot.z - player.mesh.position.z) <= 260)
                  .slice(0, 6),
              );
            } else {
              setNearbyThreats([]);
            }
            lastUiUpdate = now;
          }
          if (
            sessionModeRef.current === 'online' &&
            (!(animate as unknown as { lastMove?: number }).lastMove || now - (animate as unknown as { lastMove?: number }).lastMove! > 50)
          ) {
            socket?.move(player.getPosition());
            (animate as unknown as { lastMove?: number }).lastMove = now;
          }

          const candidateLoot =
            lootRef.current
              .map((item) => ({
                item,
                distance: player.mesh.position.distanceTo(new THREE.Vector3(item.x, player.mesh.position.y, item.z)),
              }))
              .filter((entry) => entry.distance < 3.8)
              .sort((a, b) => a.distance - b.distance)[0]?.item ?? null;
          setNearbyLoot(candidateLoot);
        }

        engine.render();
      };

      animate();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'm') setShowFullMap((value) => !value);
        if (event.key.toLowerCase() === 'f') handleInteractLoot();
        if (event.key.toLowerCase() === 'r') handleReload();
        if (event.key === '1') {
          selectWeaponSlot('primary');
        }
        if (event.key === '2' && weaponSlotsRef.current.secondary.type) {
          selectWeaponSlot('secondary');
        }
        if (event.key.toLowerCase() === 'b') {
          setShowBackpack((value) => !value);
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      if (socket) {
        initVoice();
      }

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (offlineZoneTimerRef.current !== null) {
          window.clearInterval(offlineZoneTimerRef.current);
        }
        if (reloadTimerRef.current !== null) {
          window.clearTimeout(reloadTimerRef.current);
        }
        if (healTimerRef.current !== null) {
          window.clearTimeout(healTimerRef.current);
        }
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
        }
        socket?.socket.disconnect();
        remotePlayersRef.current.forEach((remote) => remote.destroy());
        remotePlayersRef.current.clear();
        offlineBots.destroy();
        audioRef.current?.stopAmbient();
      };
    } catch (error) {
      setWorldError(error instanceof Error ? error.message : 'World initialization failed.');
    }

    function createPeer(targetId: string) {
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peer.onicecandidate = (event) => {
        if (event.candidate) socketRef.current?.sendVoiceSignal(targetId, { candidate: event.candidate });
      };
      peer.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        void audio.play();
      };
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current!));
      }
      peersRef.current.set(targetId, peer);
      return peer;
    }

    async function initVoice() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      } catch {
        // Voice is optional for this world pass.
      }
    }
  }, []);

  const mapSystem = worldRef.current?.getMapSystem() ?? null;
  const isCompactLandscape = viewport.width > viewport.height && viewport.height <= 560;
  const isUltraCompactLandscape = viewport.width > viewport.height && viewport.height <= 430;
  const isSmallViewport = Math.min(viewport.width, viewport.height) <= 640;
  const showMovementGrid = !isCompactLandscape;
  const minimapSize = isUltraCompactLandscape ? 92 : isCompactLandscape ? 108 : isSmallViewport ? 164 : 208;
  const activeWeaponState = weaponSlots[activeWeaponSlot];
  const activeWeaponStats = activeWeaponState.type ? WEAPON_CATALOG[activeWeaponState.type] : null;
  const otherWeaponSlot: WeaponSlotKey = activeWeaponSlot === 'primary' ? 'secondary' : 'primary';
  const canReload =
    !!activeWeaponState.type &&
    !!activeWeaponStats &&
    !isReloading &&
    !isHealing &&
    activeWeaponState.reserve > 0 &&
    activeWeaponState.mag < activeWeaponStats.magSize;
  const canSwap = !isReloading && !isHealing && !!weaponSlots[otherWeaponSlot].type;
  const canHeal = gameState === 'playing' && medkits > 0 && health < 100 && !isHealing && !isReloading;
  const canFire = gameState === 'playing' && !!activeWeaponState.type && activeWeaponState.mag > 0 && !isReloading && !isHealing;
  const matchElapsedSeconds = matchStartTime ? Math.max(0, Math.floor((hudNow - matchStartTime) / 1000)) : 0;
  const spawnProtectionRemaining = Math.max(0, Math.ceil((spawnProtectionUntilRef.current - hudNow) / 1000));
  const currentLocation = useMemo(() => {
    const world = worldRef.current;
    if (!world) return 'Initializing tactical map';
    const nearest = world.layout.landmarks
      .map((landmark) => ({
        label: landmark.label,
        distance: Math.hypot(playerPos.x - landmark.center.x, playerPos.z - landmark.center.z),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest ? nearest.label : 'Open Fields';
  }, [playerPos]);

  const inflictPlayerDamage = (amount: number, title = 'Eliminated') => {
    const player = playerRef.current;
    const bots = offlineBotsRef.current;
    if (!player || player.state === 'dead') return;

    if (amount > 0 && isHealingRef.current) {
      cancelHealing();
    }
    if (Date.now() < spawnProtectionUntilRef.current) {
      return;
    }

    setHealth((current) => {
      const next = Math.max(0, current - amount);
      player.health = next;
      if (next <= 0) {
        player.state = 'dead';
        setGameState('dead');
        setDeaths((value) => value + 1);
        setResultSummary({
          title,
          placement: (bots?.getAliveCount() ?? 0) + 1,
          kills: killsRef.current,
          survivedSeconds: matchStartTimeRef.current ? Math.floor((Date.now() - matchStartTimeRef.current) / 1000) : 0,
        });
        audioRef.current?.play('damage');
      }
      return next;
    });
  };

  const cancelHealing = () => {
    if (healTimerRef.current !== null) {
      window.clearTimeout(healTimerRef.current);
      healTimerRef.current = null;
    }
    if (isHealingRef.current) {
      isHealingRef.current = false;
      setIsHealing(false);
    }
  };

  const resetLoadout = () => {
    cancelHealing();
    const emptySlots = {
      primary: { type: null, mag: 0, reserve: 0 },
      secondary: { type: null, mag: 0, reserve: 0 },
    };
    weaponSlotsRef.current = emptySlots;
    activeWeaponSlotRef.current = 'primary';
    nearbyLootRef.current = null;
    isReloadingRef.current = false;
    setWeaponSlots(emptySlots);
    setActiveWeaponSlot('primary');
    setIsReloading(false);
    setNearbyLoot(null);
    setNearbyThreats([]);
    setMedkits(0);
    const player = playerRef.current;
    if (player) {
      player.weapon = null;
    }
  };

  const applyStarterLoadout = ({ weapon, medkits: starterMedkits }: StarterLoadout) => {
    const stats = WEAPON_CATALOG[weapon];
    const nextSlots: Record<WeaponSlotKey, WeaponSlotState> = {
      primary: { type: weapon, mag: stats.magSize, reserve: stats.reserveAmmo },
      secondary: { type: null, mag: 0, reserve: 0 },
    };

    weaponSlotsRef.current = nextSlots;
    activeWeaponSlotRef.current = 'primary';
    setWeaponSlots(nextSlots);
    setActiveWeaponSlot('primary');
    setMedkits(starterMedkits);

    const player = playerRef.current;
    if (player) {
      player.weapon = weapon;
    }
  };

  const applyLootPickup = (itemType: OfflineLoot['type']) => {
    const currentSlots = weaponSlotsRef.current;
    const currentSlot = activeWeaponSlotRef.current;
    let nextSlots = currentSlots;
    let nextActiveSlot = currentSlot;

    if (isWeaponId(itemType)) {
      const targetSlot: WeaponSlotKey = !currentSlots.primary.type
        ? 'primary'
        : !currentSlots.secondary.type
          ? 'secondary'
          : currentSlot;
      const stats = WEAPON_CATALOG[itemType];
      nextSlots = {
        ...currentSlots,
        [targetSlot]: { type: itemType, mag: stats.magSize, reserve: stats.reserveAmmo },
      };
      if (!currentSlots.primary.type || !currentSlots.secondary.type) {
        nextActiveSlot = targetSlot;
      }
      audioRef.current?.play('pickup');
    } else if (itemType === 'Ammo') {
      const boostSlot: WeaponSlotKey =
        currentSlots[currentSlot].type ? currentSlot : currentSlots.primary.type ? 'primary' : 'secondary';
      const equipped = currentSlots[boostSlot];
      if (equipped.type) {
        const refill = equipped.type === 'Shotgun' ? 10 : equipped.type === 'Sniper' ? 12 : 36;
        nextSlots = {
          ...currentSlots,
          [boostSlot]: { ...equipped, reserve: equipped.reserve + refill },
        };
        audioRef.current?.play('pickup');
      }
    } else if (itemType === 'Medkit') {
      setMedkits((value) => value + 1);
      audioRef.current?.play('pickup');
    }

    weaponSlotsRef.current = nextSlots;
    activeWeaponSlotRef.current = nextActiveSlot;
    setWeaponSlots(nextSlots);
    setActiveWeaponSlot(nextActiveSlot);
    const player = playerRef.current;
    if (player) {
      player.weapon = nextSlots[nextActiveSlot].type;
    }
  };

  const handleInteractLoot = () => {
    const targetLoot = nearbyLootRef.current;
    if (!targetLoot) return;

    applyLootPickup(targetLoot.type);
    lootRef.current = lootRef.current.filter((item) => item.id !== targetLoot.id);
    worldRef.current?.updateLoot(lootRef.current);
    setNearbyLoot(null);
    nearbyLootRef.current = null;
  };

  const selectWeaponSlot = (slot: WeaponSlotKey) => {
    activeWeaponSlotRef.current = slot;
    setActiveWeaponSlot(slot);
    const player = playerRef.current;
    if (player) {
      player.weapon = weaponSlotsRef.current[slot].type;
    }
    audioRef.current?.play('click');
  };

  const handleSwapWeapon = () => {
    const currentSlots = weaponSlotsRef.current;
    const currentSlot = activeWeaponSlotRef.current;
    const otherSlot = currentSlot === 'primary' ? 'secondary' : 'primary';
    if (!currentSlots[otherSlot].type || isReloadingRef.current || isHealingRef.current) return;
    selectWeaponSlot(otherSlot);
  };

  const handleReload = () => {
    const currentSlot = activeWeaponSlotRef.current;
    const slotState = weaponSlotsRef.current[currentSlot];
    if (!slotState.type || isReloadingRef.current || isHealingRef.current || slotState.reserve <= 0) return;

    const stats = WEAPON_CATALOG[slotState.type];
    if (slotState.mag >= stats.magSize) return;
    isReloadingRef.current = true;
    setIsReloading(true);
    audioRef.current?.play('click');
    if (reloadTimerRef.current !== null) {
      window.clearTimeout(reloadTimerRef.current);
    }
    reloadTimerRef.current = window.setTimeout(() => {
      setWeaponSlots((current) => {
        const liveSlot = activeWeaponSlotRef.current;
        const slot = current[liveSlot];
        if (!slot.type) return current;
        const missing = WEAPON_CATALOG[slot.type].magSize - slot.mag;
        const transfer = Math.min(missing, slot.reserve);
        const next = {
          ...current,
          [liveSlot]: {
            ...slot,
            mag: slot.mag + transfer,
            reserve: slot.reserve - transfer,
          },
        };
        weaponSlotsRef.current = next;
        return next;
      });
      isReloadingRef.current = false;
      setIsReloading(false);
      reloadTimerRef.current = null;
    }, stats.reloadMs);
  };

  const handleUseMedkit = () => {
    if (!canHeal) return;

    audioRef.current?.play('click');
    isHealingRef.current = true;
    setIsHealing(true);

    if (healTimerRef.current !== null) {
      window.clearTimeout(healTimerRef.current);
    }

    healTimerRef.current = window.setTimeout(() => {
      setMedkits((value) => Math.max(0, value - 1));
      setHealth((current) => {
        const next = Math.min(100, current + 45);
        const player = playerRef.current;
        if (player) {
          player.health = next;
        }
        return next;
      });
      audioRef.current?.play('pickup');
      isHealingRef.current = false;
      setIsHealing(false);
      healTimerRef.current = null;
    }, 2200);
  };

  const handleDropWeapon = (slot: WeaponSlotKey) => {
    const current = weaponSlotsRef.current;
    if (!current[slot].type) return;

    const next = {
      ...current,
      [slot]: { type: null, mag: 0, reserve: 0 },
    };
    weaponSlotsRef.current = next;
    setWeaponSlots(next);

    const fallbackSlot: WeaponSlotKey = slot === 'primary' ? 'secondary' : 'primary';
    const nextActive = next[activeWeaponSlotRef.current].type ? activeWeaponSlotRef.current : next[fallbackSlot].type ? fallbackSlot : 'primary';
    activeWeaponSlotRef.current = nextActive;
    setActiveWeaponSlot(nextActive);

    const player = playerRef.current;
    if (player) {
      player.weapon = next[nextActive].type;
    }
    audioRef.current?.play('click');
  };

  const handleDropMedkit = () => {
    setMedkits((value) => Math.max(0, value - 1));
    audioRef.current?.play('click');
  };

  const startOfflineZoneLoop = () => {
    const world = worldRef.current;
    const player = playerRef.current;
    if (!world || !player) return;

    setZonePhase(INITIAL_ZONE_PHASE);
    setZoneWarning('Deployment complete');

    if (offlineZoneTimerRef.current !== null) {
      window.clearInterval(offlineZoneTimerRef.current);
    }

    offlineZoneTimerRef.current = window.setInterval(() => {
      if (gameStateRef.current !== 'playing' || sessionModeRef.current !== 'offline') return;

      const distanceToZone = Math.hypot(player.mesh.position.x - zoneRef.current.x, player.mesh.position.z - zoneRef.current.z);
      if (distanceToZone > zoneRef.current.radius) {
        setZoneWarning('Move to safe zone');
        inflictPlayerDamage(zoneDamageForPhase(zonePhaseRef.current.phase), 'Lost To Blue Zone');
      }

      setZonePhase((current) => {
        if (current.timeRemaining > 1) {
          return { ...current, timeRemaining: current.timeRemaining - 1 };
        }

        const nextPhase = advanceZonePhase(current);
        if (current.status === 'shrinking') {
          setZone((previous) => {
            const next = shrinkOfflineZone(previous);
            zoneRef.current = next;
            world.updateZone(next);
            return next;
          });
        }
        setZoneWarning(
          nextPhase.status === 'shrinking'
            ? `Blue zone moving - phase ${nextPhase.phase}`
            : `Phase ${nextPhase.phase} safe zone marked`,
        );
        return nextPhase;
      });
    }, 1000);
  };

  const beginOfflineRound = () => {
    const world = worldRef.current;
    const player = playerRef.current;
    const offlineBots = offlineBotsRef.current;
    if (!world || !player || !offlineBots) return;

    const selectedLandmark = world.layout.landmarks.find((landmark) => landmark.label === selectedDrop);
    const spawn = selectedLandmark
      ? {
          x: selectedLandmark.center.x + 16,
          z: selectedLandmark.center.z + 16,
          y: world.getHeight(selectedLandmark.center.x + 16, selectedLandmark.center.z + 16),
        }
      : createOfflineSpawn(world.layout);

    player.mesh.position.set(spawn.x, spawn.y, spawn.z);
    player.state = 'alive';
    player.health = 100;
    player.kills = 0;
    setHealth(100);
    setKills(0);
    setDeaths(0);
    setSprintState(false);
    setResultSummary(null);
    setMatchStartTime(Date.now());
    setHudNow(Date.now());
    resetLoadout();
    spawnProtectionUntilRef.current = Date.now() + 8000;

    const starterWeapon: OfflineLoot['type'] =
      selectedDrop === 'Sokhodeora Dam' ? 'Sniper' : selectedDrop === 'Echo Point' ? 'AR' : 'SMG';
    applyStarterLoadout({
      weapon: starterWeapon,
      medkits: 2,
    });
    const starterLoot: OfflineLoot[] = [
      { id: 'starter-ammo-a', type: 'Ammo', x: spawn.x - 1.8, z: spawn.z + 1.2 },
      { id: 'starter-ammo-b', type: 'Ammo', x: spawn.x + 3.6, z: spawn.z + 0.8 },
      { id: 'starter-medkit', type: 'Medkit', x: spawn.x + 1.4, z: spawn.z + 2.8 },
    ];
    const offlineLoot = [...starterLoot, ...createOfflineLoot(world.layout)];
    lootRef.current = offlineLoot;
    world.updateLoot(offlineLoot);

    const offlineZone = createOfflineZone();
    zoneRef.current = offlineZone;
    setZone(offlineZone);
    world.updateZone(offlineZone);

    offlineBots.reset(16, player.mesh.position);
    setPlayerCount(offlineBots.getAliveCount() + 1);
    setGameState('playing');
    setMatchTimer(null);
    startOfflineZoneLoop();
    audioRef.current?.play('click');
  };

  const startOfflineMatch = () => {
    const world = worldRef.current;
    const player = playerRef.current;
    if (!world || !player) return;

    if (offlineZoneTimerRef.current !== null) {
      window.clearInterval(offlineZoneTimerRef.current);
    }
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (reloadTimerRef.current !== null) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
      isReloadingRef.current = false;
      setIsReloading(false);
    }
    cancelHealing();

    sessionModeRef.current = 'offline';
    setSessionMode('offline');
    setGameState('joining');
    setMatchTimer(5);
    setPlayerCount(1);
    setSprintState(false);
    player.state = 'lobby';
    remotePlayersRef.current.forEach((remote) => remote.destroy());
    remotePlayersRef.current.clear();
    offlineBotsRef.current?.destroy();
    setZonePhase(INITIAL_ZONE_PHASE);
    setZoneWarning('Deployment preparing');
    audioRef.current?.play('click');

    countdownTimerRef.current = window.setInterval(() => {
      setMatchTimer((current) => {
        if (current === null) return null;
        if (current <= 1) {
          if (countdownTimerRef.current !== null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          beginOfflineRound();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const handleJoin = () => {
    if (!ONLINE_MATCH_ENABLED || !socketRef.current || !isConnected) return;
    if (offlineZoneTimerRef.current !== null) {
      window.clearInterval(offlineZoneTimerRef.current);
      offlineZoneTimerRef.current = null;
    }
    sessionModeRef.current = 'online';
    setSessionMode('online');
    setGameState('joining');
    setDeaths(0);
    audioRef.current?.play('click');
    socketRef.current.join(playerName.trim() || `Player_${Math.floor(Math.random() * 1000)}`);
  };

  const handleShoot = () => {
    if (!playerRef.current || gameState !== 'playing') return;

    const currentSlot = activeWeaponSlotRef.current;
    const slotState = weaponSlotsRef.current[currentSlot];
    if (!slotState.type) {
      audioRef.current?.play('click');
      return;
    }
    if (isReloadingRef.current) return;
    if (isHealingRef.current) {
      cancelHealing();
      return;
    }
    if (slotState.mag <= 0) {
      audioRef.current?.play('click');
      return;
    }
    const weaponStats = WEAPON_CATALOG[slotState.type];

    setWeaponSlots((current) => {
      const next = {
        ...current,
        [currentSlot]: {
          ...current[currentSlot],
          mag: Math.max(0, current[currentSlot].mag - 1),
        },
      };
      weaponSlotsRef.current = next;
      return next;
    });
    audioRef.current?.play('fire');

    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(playerRef.current.mesh.quaternion);
    raycaster.set(playerRef.current.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), direction);
    const targets =
      sessionModeRef.current === 'online'
        ? Array.from(remotePlayersRef.current.values()).map((remote: RemotePlayer) => remote.mesh)
        : offlineBotsRef.current?.getRaycastTargets() ?? [];
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return;
    let targetMesh = hits[0].object;
    while (
      targetMesh.parent &&
      !(targetMesh as THREE.Object3D).userData?.id &&
      !(targetMesh as THREE.Object3D).userData?.botId
    ) {
      targetMesh = targetMesh.parent as any;
    }
    const targetId = (targetMesh as THREE.Object3D).userData?.id;
    const botId = (targetMesh as THREE.Object3D).userData?.botId;

    if (sessionModeRef.current === 'online') {
      if (targetId && socketRef.current) socketRef.current.shoot(targetId, weaponStats.damage ?? 20);
      return;
    }

    if (botId && offlineBotsRef.current) {
      const eliminated = offlineBotsRef.current.applyDamage(botId, weaponStats.damage ?? 20);
      if (eliminated) {
        setKills((value) => value + 1);
        audioRef.current?.play('pickup');
      }
      setPlayerCount(offlineBotsRef.current.getAliveCount() + 1);
    }
  };

  const handleAddPin = (x: number, z: number) => {
    setPins((current) => [...current, { x, z, id: Math.random().toString(36).slice(2) }].slice(-5));
  };

  const handleRemovePin = (id: string) => {
    setPins((current) => current.filter((pin) => pin.id !== id));
  };

  const requestPointerLock = () => {
    if (gameState === 'playing') containerRef.current?.requestPointerLock();
  };

  const handleSelectDrop = (drop: DropTarget) => {
    setSelectedDrop(drop);
    audioRef.current?.play('click');
  };

  const setMoveKey = (code: string, pressed: boolean) => {
    if (!inputRef.current) return;
    inputRef.current.keys[code] = pressed;
  };

  const setSprintState = (enabled: boolean) => {
    if (!inputRef.current) return;
    inputRef.current.keys.ShiftLeft = enabled;
    inputRef.current.keys.ShiftRight = enabled;
    setSprintLocked(enabled);
  };

  const handleToggleCrouch = () => {
    if (!inputRef.current) return;
    inputRef.current.keys.KeyC = !inputRef.current.keys.KeyC;
    if (inputRef.current.keys.KeyC && sprintLocked) {
      setSprintState(false);
    }
    audioRef.current?.play('click');
  };

  const handleExitToLobby = () => {
    const player = playerRef.current;
    if (offlineZoneTimerRef.current !== null) {
      window.clearInterval(offlineZoneTimerRef.current);
      offlineZoneTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (reloadTimerRef.current !== null) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
      isReloadingRef.current = false;
      setIsReloading(false);
    }
    cancelHealing();
    document.exitPointerLock?.();
    setShowFullMap(false);
    setShowBackpack(false);
    setGameState('lobby');
    sessionModeRef.current = isConnected ? 'online' : 'offline';
    setSessionMode(isConnected ? 'online' : 'offline');
    setMatchStartTime(null);
    setHudNow(Date.now());
    spawnProtectionUntilRef.current = 0;
    setResultSummary(null);
    setZonePhase(INITIAL_ZONE_PHASE);
    setZoneWarning('Safe zone stable');
    setHealth(100);
    setKills(0);
    setDeaths(0);
    setSprintState(false);
    resetLoadout();
    offlineBotsRef.current?.destroy();
    setPlayerCount(0);
    setNearbyThreats([]);
    if (player) {
      player.state = 'lobby';
      player.health = 100;
      player.kills = 0;
    }
    audioRef.current?.play('click');
  };

  const handleOfflineRespawn = () => {
    if (sessionMode !== 'offline') return;
    beginOfflineRound();
  };

  if (worldError) {
    return (
      <div className="min-h-screen bg-[#0C1113] text-white p-8 font-sans">
        <div className="max-w-4xl mx-auto rounded-[2rem] border border-red-400/25 bg-red-950/40 p-8">
          <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-red-300 mb-4">World Validation Failed</h1>
          <pre className="whitespace-pre-wrap text-sm text-red-100/80">{worldError}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0B1113] text-white select-none overscroll-none">
      <div ref={containerRef} className="absolute inset-0" onClick={requestPointerLock} />

      {(gameState === 'lobby' || gameState === 'joining') && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#081012]/82 backdrop-blur-xl px-4">
          <div
            className={`w-full max-w-6xl rounded-[2.2rem] border border-white/10 bg-[#11181B]/92 shadow-[0_24px_80px_rgba(0,0,0,0.42)] ${
              isCompactLandscape ? 'p-4' : 'p-5 md:p-8'
            }`}
          >
            <div className={`grid items-stretch gap-4 ${isCompactLandscape ? 'grid-cols-[1.08fr_0.92fr]' : 'grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] gap-6'}`}>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.4em] text-[#D0BE8F] mb-3">Kawakol Battle Royale</div>
                <h1 className={`${isCompactLandscape ? 'text-3xl' : 'text-4xl md:text-5xl'} font-black uppercase tracking-tight leading-none text-[#F2E3B5]`}>
                  Sokhodeora
                  <br />
                  Kawakol Zone
                </h1>
                <p className={`mt-4 ${isCompactLandscape ? 'text-sm' : 'text-sm md:text-base'} text-white/65 leading-relaxed max-w-2xl`}>
                  Green satellite-style rural combat space with Kawakol Market, Sokhodeora lanes, Sokhodeora Dam waterline,
                  Shiv Mandir ridge side, and Echo Point height fights.
                </p>

                {gameState === 'joining' ? (
                  <div className="mt-6 rounded-2xl border border-[#D0BE8F]/20 bg-[#201A12]/70 px-5 py-4">
                    <div className="text-sm uppercase tracking-[0.3em] text-[#D0BE8F]">
                      {sessionMode === 'online' ? 'Match Starting' : 'Loading Offline Session'}
                    </div>
                    <div className="text-5xl font-black mt-2">{matchTimer ?? '...'}</div>
                  </div>
                ) : (
                  <>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-white/70">
                      {ONLINE_MATCH_ENABLED
                        ? isNativePlatform
                          ? 'Mobile build can launch offline immediately. Online matchmaking needs a reachable socket server URL.'
                          : 'Browser build is ready. You can launch straight into the tactical match.'
                        : 'GitHub-hosted build launches straight into the browser match. Online matchmaking is disabled in this version.'}
                    </div>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(event) => setPlayerName(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && startOfflineMatch()}
                      placeholder="Enter player name"
                      className="mt-6 w-full rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-lg font-semibold outline-none focus:border-[#D0BE8F]/40"
                    />
                    <div className="mt-4">
                      <button
                        type="button"
                        aria-label="Start browser match"
                        onClick={startOfflineMatch}
                        className="w-full rounded-2xl bg-[#D1B46E] px-5 py-4 text-[#14100A] font-black uppercase tracking-[0.2em] hover:bg-[#DEC37E] transition-colors"
                      >
                        Play On Web
                      </button>
                    </div>
                  </>
                )}

                <div className={`mt-6 grid gap-3 ${isCompactLandscape ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
                  {DROP_TARGETS.map((drop) => (
                    <React.Fragment key={drop}>
                      <LobbyChip
                        label={drop === 'Kawakol Market' ? 'Hot Drop' : drop === 'Sokhodeora Dam' ? 'Waterline' : 'Overwatch'}
                        value={drop}
                        selected={selectedDrop === drop}
                        onClick={() => handleSelectDrop(drop)}
                      />
                    </React.Fragment>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-white/45">
                  <span>{ONLINE_MATCH_ENABLED ? (sessionMode === 'offline' ? 'browser ready' : `${playerCount} connected`) : 'github pages ready'}</span>
                  <span>web battle build</span>
                </div>
              </div>

              <div className="relative min-h-[320px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0C1214]">
                <img src={characterPortrait} alt="Reference operator" className="absolute inset-0 h-full w-full object-cover object-top opacity-85" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,10,0.14)_0%,rgba(7,12,14,0.3)_26%,rgba(8,12,14,0.82)_72%,rgba(8,12,14,0.96)_100%)]" />
                <div className="absolute left-5 top-5 rounded-full border border-[#D0BE8F]/35 bg-black/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-[#F2E3B5]">
                  Operator Reference
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="text-[10px] uppercase tracking-[0.32em] text-[#D0BE8F]">Applied To In-Game Rig</div>
                  <div className="mt-2 text-3xl font-black uppercase text-white">Shadow Scout</div>
                  <div className="mt-3 space-y-2 text-sm text-white/72">
                    <div>Dark hood, wrapped mask, chest harness, rope detail, and animated gun-ready arm pose.</div>
                    <div>Landscape HUD tuned for phone play so the operator card and controls stop crowding the screen.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === 'playing' && mapSystem && (
        <>
          <div data-touch-control="true" className="hidden">
            <div className={`hidden rounded-2xl border border-white/10 bg-[#10171A]/82 backdrop-blur-md ${isCompactLandscape ? 'px-3 py-2' : 'px-4 py-3'}`}>
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Current Callout</div>
              <div className={`${isCompactLandscape ? 'text-base' : 'text-xl'} font-black text-[#F2E3B5] leading-tight`}>{currentLocation}</div>
              <div className={`mt-2 uppercase tracking-[0.22em] text-white/50 ${isCompactLandscape ? 'text-[10px]' : 'text-[11px]'}`}>
                {zoneWarning} • {zonePhase.timeRemaining}s
              </div>
            </div>
            <div className={`grid grid-cols-3 ${isCompactLandscape ? 'gap-1.5' : 'gap-3'}`}>
              <HudStat icon={<Users size={16} />} label="Alive" value={playerCount} compact={isCompactLandscape} />
              <HudStat icon={<Skull size={16} />} label="Kills" value={kills} compact={isCompactLandscape} />
              <HudStat icon={<Shield size={16} />} label="HP" value={health} compact={isCompactLandscape} />
            </div>
            <div className={`grid grid-cols-2 ${isCompactLandscape ? 'gap-1.5' : 'gap-3'}`}>
              <HudStat icon={<MapIcon size={16} />} label="Zone" value={zonePhase.phase} compact={isCompactLandscape} />
              <HudStat icon={<Navigation size={16} />} label="Time" value={matchElapsedSeconds} compact={isCompactLandscape} />
            </div>
            {spawnProtectionRemaining > 0 ? (
              <div className={`rounded-2xl border border-[#D0BE8F]/22 bg-[#201A12]/72 uppercase tracking-[0.22em] text-[#F2E3B5] ${isCompactLandscape ? 'px-3 py-2 text-[10px]' : 'px-4 py-3 text-[11px]'}`}>
                Entry Shield {spawnProtectionRemaining}s
              </div>
            ) : null}
            <button
              type="button"
              aria-label="Exit to lobby"
              onClick={handleExitToLobby}
              className={`self-start rounded-2xl border border-white/10 bg-[#10171A]/88 uppercase tracking-[0.22em] font-bold ${isCompactLandscape ? 'px-3 py-2 text-[10px]' : 'px-4 py-3 text-xs'}`}
            >
              Exit To Lobby
            </button>
          </div>
          <div data-touch-control="true" className={`absolute z-30 ${isCompactLandscape ? 'top-3 left-3' : 'top-5 left-5'}`}>
            <button
              type="button"
              aria-label="Exit to lobby"
              onClick={handleExitToLobby}
              className={`rounded-2xl border border-white/10 bg-[#10171A]/88 uppercase tracking-[0.22em] font-bold ${isCompactLandscape ? 'px-3 py-2 text-[10px]' : 'px-4 py-3 text-xs'}`}
            >
              Exit
            </button>
          </div>

          <div data-touch-control="true" className={`absolute z-30 flex flex-col items-end ${isCompactLandscape ? 'top-3 right-3 gap-2' : 'top-5 right-5 gap-3'}`}>
            <button
              type="button"
              aria-label="Open tactical map"
              onClick={() => {
                audioRef.current?.play('click');
                setShowFullMap(true);
              }}
              className="rounded-[1.4rem] overflow-hidden border border-white/12 bg-[#10171A]/88"
            >
              <MiniMap mapSystem={mapSystem} playerPos={playerPos} playerRot={playerRot} zone={zone} pins={pins} threats={nearbyThreats} size={minimapSize} />
            </button>
            <button
              type="button"
              aria-label="Open full tactical map"
              onClick={() => {
                audioRef.current?.play('click');
                setShowFullMap(true);
              }}
              className={`hidden rounded-2xl border border-white/10 bg-[#10171A]/88 flex items-center gap-2 uppercase tracking-[0.22em] text-xs font-bold ${
                isCompactLandscape ? 'px-3 py-2' : 'px-4 py-3'
              }`}
            >
              <MapIcon size={15} />
              Full Map
            </button>
          </div>

          <div data-touch-control="true" className="hidden">
            <div className={`rounded-[1.6rem] border border-white/10 bg-[#0D1316]/85 backdrop-blur-md ${isCompactLandscape ? 'px-3 py-3' : 'px-5 py-4'}`}>
              {nearbyLoot ? (
                <div className={`mb-3 rounded-2xl border border-[#D0BE8F]/22 bg-[#1A1A12]/78 ${isCompactLandscape ? 'px-3 py-2' : 'px-4 py-3'}`}>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-[#D0BE8F]">Nearby Loot</div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className={`${isCompactLandscape ? 'text-xs' : 'text-sm'} font-bold text-white`}>{nearbyLoot.type}</div>
                    <button
                      type="button"
                      aria-label="Pick up nearby loot"
                      onClick={handleInteractLoot}
                      className="rounded-xl border border-[#D0BE8F]/28 bg-[#262114] px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#F2E3B5]"
                    >
                      Interact
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Primary</div>
                  <div className={`${isCompactLandscape ? 'text-lg' : 'text-2xl'} font-black text-[#F2E3B5] leading-tight`}>{activeWeaponStats?.label ?? 'Unarmed'}</div>
                  <div className={`mt-1 uppercase tracking-[0.24em] text-white/45 ${isCompactLandscape ? 'text-[9px]' : 'text-[11px]'}`}>
                    {activeWeaponStats ? `${activeWeaponStats.fireMode} | ${activeWeaponStats.ammoLabel}` : 'No weapon equipped'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Ammo</div>
                  <div className={`font-mono font-bold text-white/90 ${isCompactLandscape ? 'text-base' : 'text-lg'}`}>
                    {activeWeaponState.type ? `${activeWeaponState.mag}/${activeWeaponState.reserve}` : '--/--'}
                  </div>
                </div>
              </div>
              <div className={`mt-3 grid grid-cols-2 ${isCompactLandscape ? 'gap-2' : 'gap-3'}`}>
                <button
                  type="button"
                  aria-label="Select primary weapon slot"
                  aria-pressed={activeWeaponSlot === 'primary'}
                  onClick={() => selectWeaponSlot('primary')}
                  className={`rounded-2xl border text-left ${isCompactLandscape ? 'px-3 py-2.5' : 'px-4 py-3'} ${activeWeaponSlot === 'primary' ? 'border-[#D0BE8F]/42 bg-[#262114]' : 'border-white/10 bg-white/4'}`}
                >
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Slot 1</div>
                  <div className={`mt-1 font-black text-white ${isCompactLandscape ? 'text-xs' : 'text-sm'}`}>{weaponSlots.primary.type ? WEAPON_CATALOG[weaponSlots.primary.type].label : 'Empty'}</div>
                </button>
                <button
                  type="button"
                  aria-label="Select secondary weapon slot"
                  aria-pressed={activeWeaponSlot === 'secondary'}
                  onClick={() => weaponSlots.secondary.type && selectWeaponSlot('secondary')}
                  className={`rounded-2xl border text-left ${isCompactLandscape ? 'px-3 py-2.5' : 'px-4 py-3'} ${activeWeaponSlot === 'secondary' ? 'border-[#D0BE8F]/42 bg-[#262114]' : 'border-white/10 bg-white/4'}`}
                >
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Slot 2</div>
                  <div className={`mt-1 font-black text-white ${isCompactLandscape ? 'text-xs' : 'text-sm'}`}>{weaponSlots.secondary.type ? WEAPON_CATALOG[weaponSlots.secondary.type].label : 'Empty'}</div>
                </button>
              </div>
              <div className="mt-4 h-3 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#D85C4A] to-[#E0C26F]" style={{ width: `${health}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.22em] text-white/55">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">Medkits {medkits}</div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right">Threats {nearbyThreats.length}</div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  {isHealing ? 'Healing' : nearbyLoot ? `${nearbyLoot.type} nearby` : isCompactLandscape ? 'Loot scan' : 'Scan for loot'}
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right font-mono">
                  {isCompactLandscape ? `${Math.round(playerPos.x)}/${Math.round(playerPos.z)}` : `${Math.round(playerPos.x)}, ${Math.round(playerPos.z)}`}
                </div>
              </div>
              <div className={`mt-4 grid gap-2 ${isCompactLandscape ? 'grid-cols-2' : 'grid-cols-4'}`}>
                <button
                  type="button"
                  aria-label="Reload current weapon"
                  disabled={!canReload}
                  onClick={handleReload}
                  className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] ${
                    canReload
                      ? 'border-white/10 bg-white/4 text-white hover:bg-white/8'
                      : 'border-white/6 bg-white/[0.03] text-white/28 cursor-not-allowed'
                  }`}
                >
                  {isReloading ? 'Reloading' : 'Reload'}
                </button>
                <button
                  type="button"
                  aria-label="Swap to other weapon slot"
                  disabled={!canSwap}
                  onClick={handleSwapWeapon}
                  className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] ${
                    canSwap
                      ? 'border-white/10 bg-white/4 text-white hover:bg-white/8'
                      : 'border-white/6 bg-white/[0.03] text-white/28 cursor-not-allowed'
                  }`}
                >
                  Swap
                </button>
                <button
                  type="button"
                  aria-label="Use medkit"
                  disabled={!canHeal}
                  onClick={handleUseMedkit}
                  className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] ${
                    canHeal
                      ? 'border-[#D0BE8F]/28 bg-[#201A12]/76 text-[#F2E3B5] hover:bg-[#282114]'
                      : 'border-white/6 bg-white/[0.03] text-white/28 cursor-not-allowed'
                  }`}
                >
                  {isHealing ? 'Healing' : 'Heal'}
                </button>
                <button
                  type="button"
                  aria-label="Open backpack"
                  onClick={() => {
                    audioRef.current?.play('click');
                    setShowBackpack((value) => !value);
                  }}
                  className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] hover:bg-white/8"
                >
                  Backpack
                </button>
              </div>
            </div>
          </div>

          <div data-touch-control="true" className={`absolute z-30 flex flex-col ${isCompactLandscape ? 'bottom-4 right-4 gap-2' : 'bottom-8 right-8 gap-4'}`}>
            <button
              type="button"
              aria-label="Fire weapon"
              title="Fire weapon"
              disabled={!canFire}
              className={`rounded-full bg-[#C64E3F]/88 border-4 border-white/12 flex items-center justify-center shadow-[0_16px_32px_rgba(0,0,0,0.35)] ${
                isUltraCompactLandscape ? 'w-12 h-12' : isCompactLandscape ? 'w-14 h-14' : 'w-20 h-20'
              } ${canFire ? 'opacity-100' : 'opacity-45 saturate-0 cursor-not-allowed'}`}
              onPointerDown={handleShoot}
            >
              <Crosshair size={isUltraCompactLandscape ? 18 : isCompactLandscape ? 22 : 30} />
            </button>
            <button
              type="button"
              aria-label="Jump or climb"
              title="Jump or climb"
              className={`rounded-full bg-white/10 border border-white/14 flex items-center justify-center ${
                isUltraCompactLandscape ? 'w-9 h-9' : isCompactLandscape ? 'w-11 h-11' : 'w-14 h-14'
              }`}
              onPointerDown={() => {
                const player = playerRef.current;
                audioRef.current?.play('click');
                if (player) player.getInput().keys.Space = true;
              }}
              onPointerUp={() => {
                const player = playerRef.current;
                if (player) player.getInput().keys.Space = false;
              }}
            >
              <Navigation className="-rotate-90" size={isUltraCompactLandscape ? 14 : isCompactLandscape ? 16 : 22} />
            </button>
            <button
              type="button"
              aria-label="Toggle crouch"
              title="Toggle crouch"
              onClick={handleToggleCrouch}
              className={`rounded-full bg-white/10 border border-white/14 flex items-center justify-center ${
                isUltraCompactLandscape ? 'w-9 h-9 text-[9px]' : isCompactLandscape ? 'w-11 h-11 text-[10px]' : 'w-14 h-14 text-xs'
              } font-black uppercase tracking-[0.18em]`}
            >
              Low
            </button>
            <button
              type="button"
              aria-label="Open bag"
              onClick={() => {
                audioRef.current?.play('click');
                setShowBackpack(true);
              }}
              className={`rounded-full bg-white/10 border border-white/14 flex items-center justify-center ${
                isUltraCompactLandscape ? 'w-9 h-9' : isCompactLandscape ? 'w-11 h-11' : 'w-14 h-14'
              }`}
            >
              <Backpack size={isUltraCompactLandscape ? 13 : isCompactLandscape ? 15 : 20} />
            </button>
            {nearbyLoot ? (
              <button
                type="button"
                aria-label="Pick up nearby loot"
                onClick={handleInteractLoot}
                className={`rounded-full bg-[#D1B46E]/92 border border-white/14 flex items-center justify-center text-[#14100A] ${
                  isUltraCompactLandscape ? 'w-9 h-9 text-[8px]' : isCompactLandscape ? 'w-11 h-11 text-[9px]' : 'w-14 h-14 text-[10px]'
                } font-black uppercase tracking-[0.16em]`}
              >
                Loot
              </button>
            ) : null}
          </div>

          <div data-touch-control="true" className={`absolute z-30 ${isCompactLandscape ? 'bottom-3 left-3' : 'bottom-8 left-8'}`}>
            <div className="flex items-end gap-3">
              <div className="relative">
                <div
                  id="joystick-zone"
                  aria-hidden="true"
                  className={`relative rounded-full border border-white/10 bg-[#0E1518]/65 backdrop-blur-md ${
                    isUltraCompactLandscape ? 'h-24 w-24' : isCompactLandscape ? 'h-28 w-28' : 'h-36 w-36'
                  }`}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={`rounded-full border border-white/10 bg-white/6 ${
                      isUltraCompactLandscape ? 'h-14 w-14' : isCompactLandscape ? 'h-16 w-16' : 'h-20 w-20'
                    }`}
                  />
                  <div
                    className={`absolute rounded-full border border-[#D0BE8F]/35 bg-[#F2E3B5]/18 shadow-[0_10px_20px_rgba(0,0,0,0.25)] transition-transform ${
                      isUltraCompactLandscape ? 'h-8 w-8' : isCompactLandscape ? 'h-10 w-10' : 'h-12 w-12'
                    } ${joystickState.active ? 'opacity-100' : 'opacity-70'}`}
                    style={{
                      transform: `translate(${joystickState.x * (isUltraCompactLandscape ? 18 : isCompactLandscape ? 22 : 28)}px, ${-joystickState.y * (isUltraCompactLandscape ? 18 : isCompactLandscape ? 22 : 28)}px)`,
                    }}
                  />
                </div>
              </div>

              <div className={`flex flex-col ${isCompactLandscape ? 'gap-2' : 'gap-3'}`}>
                <button
                  type="button"
                  aria-label={sprintLocked ? 'Disable run lock' : 'Enable run lock'}
                  aria-pressed={sprintLocked}
                  onClick={() => {
                    setSprintState(!sprintLocked);
                    audioRef.current?.play('click');
                  }}
                  className={`rounded-2xl border flex items-center justify-center gap-2 font-black uppercase tracking-[0.2em] ${
                    isCompactLandscape ? 'h-10 min-w-[84px] px-3 text-[10px]' : 'h-12 min-w-[112px] px-4 text-[11px]'
                  } ${sprintLocked ? 'border-[#D0BE8F]/38 bg-[#241E12]/86 text-[#F2E3B5]' : 'border-white/10 bg-[#10171A]/88 text-white/78'}`}
                >
                  <Zap size={isCompactLandscape ? 12 : 14} />
                  Run
                </button>

                {showMovementGrid ? (
                  <div className="grid grid-cols-3 gap-1" role="group" aria-label="Movement controls">
                    <div />
                    <MovementButton
                      label="Move forward"
                      onPressChange={(pressed) => setMoveKey('KeyW', pressed)}
                      small={isCompactLandscape}
                    >
                      ^
                    </MovementButton>
                    <div />
                    <MovementButton
                      label="Move left"
                      onPressChange={(pressed) => setMoveKey('KeyA', pressed)}
                      small={isCompactLandscape}
                    >
                      {'<'}
                    </MovementButton>
                    <MovementButton
                      label="Movement joystick"
                      onPressChange={() => undefined}
                      disabled
                      small={isCompactLandscape}
                    >
                      O
                    </MovementButton>
                    <MovementButton
                      label="Move right"
                      onPressChange={(pressed) => setMoveKey('KeyD', pressed)}
                      small={isCompactLandscape}
                    >
                      {'>'}
                    </MovementButton>
                    <div />
                    <MovementButton
                      label="Move backward"
                      onPressChange={(pressed) => setMoveKey('KeyS', pressed)}
                      small={isCompactLandscape}
                    >
                      v
                    </MovementButton>
                    <div />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="w-8 h-8 rounded-full border border-white/45 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </div>
        </>
      )}

      {gameState === 'dead' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/78 backdrop-blur-xl">
          <div className="rounded-[2rem] border border-white/10 bg-[#12181B]/92 px-10 py-8 text-center">
            <div className="text-sm uppercase tracking-[0.35em] text-[#D0BE8F]">Eliminated</div>
            <h2 className="mt-3 text-5xl font-black text-white">Return To Lobby</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-left">
              <LobbyChip label="Kills" value={String(kills)} selected={false} />
              <LobbyChip label="Deaths" value={String(deaths)} selected={false} />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sessionMode === 'offline' ? (
                <button type="button" onClick={handleOfflineRespawn} className="rounded-2xl border border-white/10 bg-[#1A2018] px-6 py-4 text-[#F2E3B5] font-black uppercase tracking-[0.24em]">
                  Respawn Offline
                </button>
              ) : null}
              <button type="button" onClick={handleExitToLobby} className="rounded-2xl bg-[#D1B46E] px-6 py-4 text-black font-black uppercase tracking-[0.24em]">
                Return To Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'result' && resultSummary ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/72 backdrop-blur-xl">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#12181B]/94 px-8 py-8 text-center">
            <div className="text-sm uppercase tracking-[0.35em] text-[#D0BE8F]">Match Complete</div>
            <h2 className="mt-3 text-5xl font-black text-white">{resultSummary.title}</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 text-left">
              <LobbyChip label="Placement" value={`#${resultSummary.placement}`} selected={false} />
              <LobbyChip label="Kills" value={String(resultSummary.kills)} selected={false} />
              <LobbyChip label="Survival" value={`${resultSummary.survivedSeconds}s`} selected={false} />
              <LobbyChip label="Zone" value={`P${zonePhase.phase}`} selected={false} />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={beginOfflineRound} className="rounded-2xl border border-white/10 bg-[#1A2018] px-6 py-4 text-[#F2E3B5] font-black uppercase tracking-[0.24em]">
                Play Again
              </button>
              <button type="button" onClick={handleExitToLobby} className="rounded-2xl bg-[#D1B46E] px-6 py-4 text-black font-black uppercase tracking-[0.24em]">
                Return To Lobby
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBackpack && gameState === 'playing' ? (
        <div data-touch-control="true" className={`absolute inset-0 z-[70] bg-[#071013]/74 backdrop-blur-lg ${isCompactLandscape ? 'flex items-end p-0' : 'p-4 md:p-8'}`}>
          <div className={`mx-auto flex w-full flex-col border border-white/10 bg-[#10171A]/94 ${isCompactLandscape ? 'max-h-[74vh] rounded-t-[2rem] px-4 py-4' : 'h-full max-w-5xl rounded-[2rem] p-5 md:p-6'}`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.32em] text-[#D0BE8F]">Inventory</div>
                <div className={`${isCompactLandscape ? 'text-xl' : 'text-2xl'} font-black text-white`}>Field Bag</div>
              </div>
              <button
                type="button"
                aria-label="Close backpack"
                onClick={() => {
                  audioRef.current?.play('click');
                  setShowBackpack(false);
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.24em]"
              >
                Close
              </button>
            </div>
            <div className={`grid flex-1 gap-4 overflow-y-auto ${isCompactLandscape ? 'pb-2' : 'md:grid-cols-[1.1fr_0.9fr]'}`}>
              <div className="rounded-[1.5rem] border border-white/10 bg-black/16 p-4">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Combat Status</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InventoryCard title="Primary" value={activeWeaponStats?.label ?? 'Unarmed'} meta={activeWeaponState.type ? `${activeWeaponState.mag}/${activeWeaponState.reserve}` : '--/--'} />
                  <InventoryCard title="Health" value={`${health}`} meta={`Alive ${playerCount} / Kills ${kills}`} />
                  <InventoryCard title="Zone" value={`Phase ${zonePhase.phase}`} meta={`${zoneWarning}`} />
                  <InventoryCard title="Medical" value={`Medkits x${medkits}`} meta={spawnProtectionRemaining > 0 ? `Shield ${spawnProtectionRemaining}s` : `${nearbyThreats.length} threats nearby`} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    aria-label="Reload current weapon"
                    disabled={!canReload}
                    onClick={handleReload}
                    className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] ${
                      canReload
                        ? 'border-white/10 bg-white/4 text-white hover:bg-white/8'
                        : 'border-white/6 bg-white/[0.03] text-white/28 cursor-not-allowed'
                    }`}
                  >
                    {isReloading ? 'Reloading' : 'Reload'}
                  </button>
                  <button
                    type="button"
                    aria-label="Swap to other weapon slot"
                    disabled={!canSwap}
                    onClick={handleSwapWeapon}
                    className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] ${
                      canSwap
                        ? 'border-white/10 bg-white/4 text-white hover:bg-white/8'
                        : 'border-white/6 bg-white/[0.03] text-white/28 cursor-not-allowed'
                    }`}
                  >
                    Swap
                  </button>
                  <button
                    type="button"
                    aria-label="Use medkit"
                    disabled={!canHeal}
                    onClick={handleUseMedkit}
                    className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] ${
                      canHeal
                        ? 'border-[#D0BE8F]/28 bg-[#201A12]/76 text-[#F2E3B5] hover:bg-[#282114]'
                        : 'border-white/6 bg-white/[0.03] text-white/28 cursor-not-allowed'
                    }`}
                  >
                    {isHealing ? 'Healing' : 'Heal'}
                  </button>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-black/16 p-4">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Equipped</div>
                <div className="mt-4 grid gap-3">
                  <InventoryActionCard
                    title="Primary Slot"
                    value={weaponSlots.primary.type ? WEAPON_CATALOG[weaponSlots.primary.type].label : 'Empty'}
                    meta={weaponSlots.primary.type ? `${weaponSlots.primary.mag}/${weaponSlots.primary.reserve}` : 'No ammo'}
                    active={activeWeaponSlot === 'primary'}
                    actionLabel={weaponSlots.primary.type ? 'Drop' : undefined}
                    onAction={weaponSlots.primary.type ? () => handleDropWeapon('primary') : undefined}
                  />
                  <InventoryActionCard
                    title="Secondary Slot"
                    value={weaponSlots.secondary.type ? WEAPON_CATALOG[weaponSlots.secondary.type].label : 'Empty'}
                    meta={weaponSlots.secondary.type ? `${weaponSlots.secondary.mag}/${weaponSlots.secondary.reserve}` : 'No ammo'}
                    active={activeWeaponSlot === 'secondary'}
                    actionLabel={weaponSlots.secondary.type ? 'Drop' : undefined}
                    onAction={weaponSlots.secondary.type ? () => handleDropWeapon('secondary') : undefined}
                  />
                  <InventoryActionCard
                    title="Medical"
                    value={`Medkits x${medkits}`}
                    meta="Quick heal supply"
                    actionLabel={medkits > 0 ? 'Discard' : undefined}
                    onAction={medkits > 0 ? handleDropMedkit : undefined}
                  />
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-black/16 p-4">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Nearby Compare</div>
                <div className="mt-4">
                  {nearbyLoot ? (
                    <InventoryCard title="Ground Loot" value={nearbyLoot.type} meta="Tap Interact to collect" />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/55">
                      Move near loot piles in Sokhodeora lanes or Kawakol Market to compare and collect.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showFullMap && mapSystem && (
        <div data-touch-control="true" className={`absolute inset-0 z-[80] bg-[#091013]/86 backdrop-blur-xl ${isCompactLandscape ? 'p-3' : 'p-4 md:p-8'}`}>
          <div className="h-full max-w-6xl mx-auto flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.35em] text-[#D0BE8F]">Tactical Map</div>
                <div className="text-2xl font-black text-white">Sokhodeora / Kawakol Combat Layout</div>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 uppercase tracking-[0.24em] text-xs font-bold"
                onClick={() => {
                  audioRef.current?.play('click');
                  setShowFullMap(false);
                }}
              >
                Close
              </button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <HudStat icon={<Users size={14} />} label="Alive" value={playerCount} compact />
              <HudStat icon={<Skull size={14} />} label="Kills" value={kills} compact />
              <HudStat icon={<Shield size={14} />} label="HP" value={health} compact />
              <HudStat icon={<MapIcon size={14} />} label="Zone" value={zonePhase.phase} compact />
              <HudStat icon={<Navigation size={14} />} label="Time" value={matchElapsedSeconds} compact />
            </div>
            <div className="flex-1 min-h-0">
              <FullMap mapSystem={mapSystem} playerPos={playerPos} zone={zone} pins={pins} onAddPin={handleAddPin} onRemovePin={handleRemovePin} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HudStat({ icon, label, value, compact = false }: { icon: React.ReactNode; label: string; value: number; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#10171A]/82 backdrop-blur-md ${compact ? 'px-2.5 py-2 min-w-[78px]' : 'px-4 py-3 min-w-[98px]'}`}>
      <div className={`flex items-center gap-2 text-white/55 uppercase tracking-[0.22em] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        {icon}
        {label}
      </div>
      <div className={`mt-2 font-black text-white ${compact ? 'text-lg' : 'text-2xl'}`}>{value}</div>
    </div>
  );
}

function LobbyChip({
  label,
  value,
  selected,
  onClick,
}: {
  label: string;
  value: string;
  selected: boolean;
  onClick?: () => void;
}) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      {...(onClick
        ? {
            type: 'button',
            onClick,
            'aria-pressed': selected,
            'aria-label': `${label}: ${value}`,
          }
        : {})}
      className={`rounded-2xl border px-4 py-3 backdrop-blur-sm text-left transition-colors ${
        selected ? 'border-[#D0BE8F]/45 bg-[#2A2416]/72' : 'border-white/10 bg-black/18'
      } ${onClick ? 'cursor-pointer hover:border-[#D0BE8F]/35 hover:bg-[#1A1F18]' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-[0.28em] text-white/42">{label}</div>
      <div className="mt-2 text-lg font-black text-white">{value}</div>
    </Component>
  );
}

function MovementButton({
  label,
  children,
  onPressChange,
  small,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onPressChange: (pressed: boolean) => void;
  small: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={() => !disabled && onPressChange(true)}
      onPointerUp={() => onPressChange(false)}
      onPointerLeave={() => onPressChange(false)}
      onPointerCancel={() => onPressChange(false)}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPressChange(true);
        }
      }}
      onKeyUp={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPressChange(false);
        }
      }}
      className={`rounded-xl border border-white/10 bg-[#10171A]/88 font-black uppercase tracking-[0.18em] text-white/85 ${
        small ? 'h-9 min-w-9 px-2 text-[9px]' : 'h-11 min-w-11 px-3 text-[10px]'
      } ${disabled ? 'opacity-70 cursor-default' : 'hover:bg-[#182024]'}`}
    >
      {children}
    </button>
  );
}

function InventoryCard({
  title,
  value,
  meta,
  active = false,
}: {
  title: string;
  value: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${active ? 'border-[#D0BE8F]/38 bg-[#241E12]/72' : 'border-white/10 bg-white/4'}`}>
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">{title}</div>
      <div className="mt-2 text-lg font-black text-white">{value}</div>
      <div className="mt-1 text-sm text-white/62">{meta}</div>
    </div>
  );
}

function InventoryActionCard({
  title,
  value,
  meta,
  active = false,
  actionLabel,
  onAction,
}: {
  title: string;
  value: string;
  meta: string;
  active?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${active ? 'border-[#D0BE8F]/38 bg-[#241E12]/72' : 'border-white/10 bg-white/4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">{title}</div>
          <div className="mt-2 text-lg font-black text-white">{value}</div>
          <div className="mt-1 text-sm text-white/62">{meta}</div>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/75"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
