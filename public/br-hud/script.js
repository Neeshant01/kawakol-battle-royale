const safeZoneTimer = document.getElementById("safe-zone-timer");
const weaponSlotsRoot = document.getElementById("weapon-slots");
const actionLog = document.getElementById("action-log");
const joystickBase = document.getElementById("joystick-base");
const joystickThumb = document.getElementById("joystick-thumb");
const joystickValues = document.getElementById("joystick-values");
const hpValue = document.getElementById("hp-value");
const hpFill = document.getElementById("hp-fill");
const killCount = document.getElementById("kill-count");
const aliveCount = document.getElementById("alive-count");
const playerMarker = document.getElementById("player-marker");
const sprintButton = document.getElementById("sprint-button");
const medkitButton = document.getElementById("medkit-button");
const inventoryButton = document.getElementById("inventory-button");
const settingsButton = document.getElementById("settings-button");
const fullscreenButton = document.getElementById("fullscreen-button");

const state = {
  timerSeconds: 165,
  hp: 200,
  maxHp: 200,
  kills: 3,
  alive: 47,
  sprintEnabled: false,
  activeWeaponIndex: 0,
  weapons: [
    { name: "AR-97", ammo: 38, reserve: 180, caliber: "5.56", mode: "Auto" },
    { name: "SMG-9", ammo: 28, reserve: 120, caliber: "9mm", mode: "Auto" },
    { name: "MRK-12", ammo: 8, reserve: 48, caliber: "7.62", mode: "Single" },
    { name: "PST-45", ammo: 12, reserve: 36, caliber: ".45", mode: "Semi" },
  ],
  joystick: {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function logAction(message) {
  console.log(`[HUD] ${message}`);

  const item = document.createElement("li");
  item.className = "game-ui__log-item";
  item.textContent = message;
  actionLog.prepend(item);

  while (actionLog.children.length > 4) {
    actionLog.removeChild(actionLog.lastChild);
  }
}

function renderTimer() {
  safeZoneTimer.textContent = formatTime(state.timerSeconds);
}

function renderVitals() {
  const healthRatio = clamp(state.hp / state.maxHp, 0, 1);
  hpValue.textContent = `${state.hp} / ${state.maxHp}`;
  hpFill.style.width = `${healthRatio * 100}%`;
}

function renderMatchStats() {
  killCount.textContent = String(state.kills);
  aliveCount.textContent = String(state.alive);
}

function renderWeapons() {
  weaponSlotsRoot.innerHTML = "";

  state.weapons.forEach((weapon, index) => {
    const button = document.createElement("button");
    const isActive = index === state.activeWeaponIndex;

    button.type = "button";
    button.className = `game-ui__weapon-slot${isActive ? " game-ui__weapon-slot--active" : ""}`;
    button.setAttribute("aria-label", `Switch to ${weapon.name}`);
    button.innerHTML = `
      <span class="game-ui__weapon-index">${index + 1}</span>
      <span>
        <span class="game-ui__weapon-name">${weapon.name}</span>
        <span class="game-ui__weapon-meta">${weapon.mode} | ${weapon.caliber}</span>
      </span>
      <span class="game-ui__weapon-ammo">
        <strong>${weapon.ammo}</strong>
        <span class="game-ui__weapon-meta">${weapon.reserve} reserve</span>
      </span>
    `;

    button.addEventListener("click", () => {
      state.activeWeaponIndex = index;
      renderWeapons();
      logAction(`Switched to ${weapon.name}.`);
    });

    weaponSlotsRoot.appendChild(button);
  });
}

function renderJoystick() {
  const thumbTravel = joystickBase.clientWidth * 0.24;
  joystickThumb.style.transform = `translate(calc(-50% + ${state.joystick.x * thumbTravel}px), calc(-50% + ${-state.joystick.y * thumbTravel}px))`;
  joystickValues.textContent = `X ${state.joystick.x.toFixed(2)} / Y ${state.joystick.y.toFixed(2)}`;
  playerMarker.style.transform = `translate(-50%, -50%) rotate(${state.joystick.x * 28}deg)`;
}

function setJoystickPosition(clientX, clientY) {
  const rect = joystickBase.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.32;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const distance = Math.hypot(dx, dy);
  const ratio = distance > radius ? radius / distance : 1;

  state.joystick.x = clamp((dx * ratio) / radius, -1, 1);
  state.joystick.y = clamp((-dy * ratio) / radius, -1, 1);
  renderJoystick();
}

function resetJoystick() {
  state.joystick.active = false;
  state.joystick.pointerId = null;
  state.joystick.x = 0;
  state.joystick.y = 0;
  renderJoystick();
}

joystickBase.addEventListener("pointerdown", (event) => {
  state.joystick.active = true;
  state.joystick.pointerId = event.pointerId;
  joystickBase.setPointerCapture(event.pointerId);
  setJoystickPosition(event.clientX, event.clientY);
  logAction("Joystick engaged.");
});

joystickBase.addEventListener("pointermove", (event) => {
  if (!state.joystick.active || state.joystick.pointerId !== event.pointerId) {
    return;
  }
  setJoystickPosition(event.clientX, event.clientY);
});

joystickBase.addEventListener("pointerup", (event) => {
  if (state.joystick.pointerId !== event.pointerId) {
    return;
  }
  resetJoystick();
  logAction("Joystick released.");
});

joystickBase.addEventListener("pointercancel", resetJoystick);
joystickBase.addEventListener("pointerleave", () => {
  if (state.joystick.active) {
    resetJoystick();
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.getAttribute("data-action");
    const activeWeapon = state.weapons[state.activeWeaponIndex];

    if (action === "Fire") {
      if (activeWeapon.ammo > 0) {
        activeWeapon.ammo -= 1;
        renderWeapons();
        logAction(`${activeWeapon.name} fired. ${activeWeapon.ammo} rounds left.`);
      } else {
        logAction(`${activeWeapon.name} dry fire.`);
      }
      return;
    }

    logAction(`${action} action triggered.`);
  });
});

sprintButton.addEventListener("click", () => {
  state.sprintEnabled = !state.sprintEnabled;
  sprintButton.classList.toggle("game-ui__circle-button--active", state.sprintEnabled);
  logAction(state.sprintEnabled ? "Sprint enabled." : "Sprint disabled.");
});

medkitButton.addEventListener("click", () => {
  if (state.hp >= state.maxHp) {
    logAction("HP already full.");
    return;
  }

  state.hp = clamp(state.hp + 25, 0, state.maxHp);
  renderVitals();
  logAction(`Medkit used. HP restored to ${state.hp}.`);
});

inventoryButton.addEventListener("click", () => {
  logAction("Inventory opened.");
});

settingsButton.addEventListener("click", () => {
  logAction("Settings opened.");
});

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      if (screen.orientation && typeof screen.orientation.lock === "function") {
        try {
          await screen.orientation.lock("landscape");
        } catch {
          // Orientation lock is optional.
        }
      }
      logAction("Fullscreen enabled.");
    } else {
      await document.exitFullscreen();
      logAction("Fullscreen disabled.");
    }
  } catch {
    logAction("Fullscreen request blocked by browser.");
  }
}

function syncFullscreenState() {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
  fullscreenButton.classList.toggle("game-ui__circle-button--active", isFullscreen);
}

fullscreenButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", syncFullscreenState);

window.addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "4") {
    state.activeWeaponIndex = Number(event.key) - 1;
    renderWeapons();
    logAction(`Switched to ${state.weapons[state.activeWeaponIndex].name} with keyboard.`);
  }
});

window.setInterval(() => {
  state.timerSeconds = Math.max(0, state.timerSeconds - 1);
  renderTimer();

  if (state.timerSeconds === 0) {
    logAction("Safe zone collapsed.");
  }
}, 1000);

renderTimer();
renderWeapons();
renderVitals();
renderMatchStats();
renderJoystick();
syncFullscreenState();
