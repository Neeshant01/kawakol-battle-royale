export class Input {
  public keys: { [key: string]: boolean } = {};
  public joystick: { x: number; y: number } = { x: 0, y: 0 };
  public lookDelta: { x: number; y: number } = { x: 0, y: 0 };
  public isMobile: boolean;

  private activeLookTouchId: number | null = null;
  private activeJoystickPointerId: number | null = null;
  private joystickZone: HTMLElement | null = null;
  private joystickRadius = 44;

  constructor() {
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    window.addEventListener('keydown', (e) => (this.keys[e.code] = true));
    window.addEventListener('keyup', (e) => (this.keys[e.code] = false));

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.lookDelta.x += e.movementX;
        this.lookDelta.y += e.movementY;
      }
    });

    let touchStartX = 0;
    let touchStartY = 0;
    window.addEventListener(
      'touchstart',
      (e) => {
        const touch = Array.from(e.changedTouches).find((candidate) => {
          const target = candidate.target;
          const isControlTarget = target instanceof Element && target.closest('[data-touch-control="true"]');
          return candidate.clientX > window.innerWidth / 2 && !isControlTarget;
        });
        if (touch) {
          this.activeLookTouchId = touch.identifier;
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
        }
      },
      { passive: false },
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        const touch =
          this.activeLookTouchId === null
            ? null
            : Array.from(e.touches).find((candidate) => candidate.identifier === this.activeLookTouchId);
        if (touch) {
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          this.lookDelta.x += dx;
          this.lookDelta.y += dy;
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
        }
      },
      { passive: false },
    );

    window.addEventListener(
      'touchend',
      (e) => {
        if (this.activeLookTouchId === null) return;
        const released = Array.from(e.changedTouches).some((candidate) => candidate.identifier === this.activeLookTouchId);
        if (released) {
          this.activeLookTouchId = null;
        }
      },
      { passive: false },
    );

    if (this.isMobile) {
      this.initJoystick();
    }
  }

  private initJoystick() {
    const zone = document.getElementById('joystick-zone');
    if (!zone) {
      window.setTimeout(() => this.initJoystick(), 100);
      return;
    }

    this.joystickZone = zone;
    this.joystickZone.style.touchAction = 'none';

    const radius = window.innerWidth > window.innerHeight && window.innerHeight < 560 ? 34 : 44;
    this.joystickRadius = radius;

    const updateFromPointer = (clientX: number, clientY: number) => {
      if (!this.joystickZone) return;
      const rect = this.joystickZone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const clamped = distance > this.joystickRadius ? this.joystickRadius / distance : 1;
      this.joystick.x = Number((dx * clamped / this.joystickRadius).toFixed(3));
      this.joystick.y = Number((-dy * clamped / this.joystickRadius).toFixed(3));
    };

    const resetJoystick = () => {
      this.activeJoystickPointerId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
    };

    zone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.activeJoystickPointerId = event.pointerId;
      updateFromPointer(event.clientX, event.clientY);
      zone.setPointerCapture?.(event.pointerId);
    });

    zone.addEventListener('pointermove', (event) => {
      if (this.activeJoystickPointerId !== event.pointerId) return;
      event.preventDefault();
      updateFromPointer(event.clientX, event.clientY);
    });

    zone.addEventListener('pointerup', (event) => {
      if (this.activeJoystickPointerId !== event.pointerId) return;
      event.preventDefault();
      resetJoystick();
    });

    zone.addEventListener('pointercancel', () => {
      resetJoystick();
    });

    zone.addEventListener('pointerleave', (event) => {
      if (this.activeJoystickPointerId !== event.pointerId) return;
      resetJoystick();
    });
  }

  public getMoveVector() {
    let x = 0;
    let z = 0;

    if (this.keys['KeyW']) z += 1;
    if (this.keys['KeyS']) z -= 1;
    if (this.keys['KeyA']) x -= 1;
    if (this.keys['KeyD']) x += 1;

    if (this.joystick.x !== 0 || this.joystick.y !== 0) {
      x = this.joystick.x;
      z = this.joystick.y;
    }

    return { x, z };
  }

  public consumeLookDelta() {
    const delta = { ...this.lookDelta };
    this.lookDelta = { x: 0, y: 0 };
    return delta;
  }
}
