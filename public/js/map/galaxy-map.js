import { parseQuadrantCoords, getSystemPosition, getFactionColor } from './map-service.js';

export class GalaxyMap {
  constructor(canvas, ctx, systems, quadrants) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.systems = systems;
    this.quadrants = quadrants;
    this.listeners = {};

    // View state
    this.viewX = 0;
    this.viewY = 0;
    this.zoom = 1;
    this.minZoom = 0.5;
    this.maxZoom = 4;

    // Interaction
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastTouchDistance = 0;

    // Cache system positions
    this.systemPositions = new Map();
    this.precomputePositions();

    // Event listeners
    this.setupEventListeners();
  }

  precomputePositions() {
    const cellSize = 200;
    for (const sys of this.systems) {
      const quadPos = parseQuadrantCoords(sys.quadrant);
      const pos = getSystemPosition(sys, quadPos, cellSize);
      this.systemPositions.set(sys.id, {
        ...pos,
        system: sys,
        radius: 12
      });
    }
  }

  setupEventListeners() {
    // Mouse
    this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', e => this.onWheel(e));

    // Touch
    this.canvas.addEventListener('touchstart', e => this.onTouchStart(e));
    this.canvas.addEventListener('touchmove', e => this.onTouchMove(e));
    this.canvas.addEventListener('touchend', () => this.onTouchEnd());

    // Click
    this.canvas.addEventListener('click', e => this.onClick(e));
  }

  onMouseDown(e) {
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
  }

  onMouseMove(e) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    this.viewX += dx;
    this.viewY += dy;

    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    this.render();
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomAround(e.clientX, e.clientY, delta);
  }

  onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      e.preventDefault();
      this.isDragging = true;
      this.dragStartX = e.touches[0].clientX;
      this.dragStartY = e.touches[0].clientY;
    }
  }

  onTouchMove(e) {
    if (e.touches.length === 2 && this.lastTouchDistance !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const delta = dist / this.lastTouchDistance;
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this.zoomAround(centerX, centerY, delta);

      this.lastTouchDistance = dist;
    } else if (e.touches.length === 1 && this.isDragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - this.dragStartX;
      const dy = e.touches[0].clientY - this.dragStartY;

      this.viewX += dx;
      this.viewY += dy;

      this.dragStartX = e.touches[0].clientX;
      this.dragStartY = e.touches[0].clientY;

      this.render();
    }
  }

  onTouchEnd() {
    this.isDragging = false;
    this.lastTouchDistance = null;
  }

  zoomAround(clientX, clientY, delta) {
    // Canvas coordinates in world space
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // World coordinates before zoom
    const worldX = (canvasX - this.viewX) / this.zoom;
    const worldY = (canvasY - this.viewY) / this.zoom;

    // Apply zoom
    this.zoom *= delta;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));

    // Adjust view to keep world point centered
    this.viewX = canvasX - worldX * this.zoom;
    this.viewY = canvasY - worldY * this.zoom;

    this.render();
  }

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // World coordinates
    const worldX = (canvasX - this.viewX) / this.zoom;
    const worldY = (canvasY - this.viewY) / this.zoom;

    // Check system click (within radius)
    for (const [id, pos] of this.systemPositions) {
      const dx = worldX - pos.x;
      const dy = worldY - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= pos.radius * 1.5) {
        this.emit('systemSelected', pos.system);
        break;
      }
    }
  }

  zoomIn() {
    this.zoomAround(this.canvas.width / 2, this.canvas.height / 2, 1.2);
  }

  zoomOut() {
    this.zoomAround(this.canvas.width / 2, this.canvas.height / 2, 0.8);
  }

  resetView() {
    this.viewX = 0;
    this.viewY = 0;
    this.zoom = 1;
    this.render();
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background
    this.ctx.fillStyle = '#0f0f1e';
    this.ctx.fillRect(0, 0, w, h);

    // Save transform
    this.ctx.save();
    this.ctx.translate(this.viewX, this.viewY);
    this.ctx.scale(this.zoom, this.zoom);

    // Draw layers
    this.drawGrid();
    this.drawQuadrants();
    this.drawRoutes();
    this.drawSystemsWithGlow();

    this.ctx.restore();
  }

  drawGrid() {
    const cellSize = 200;
    const gridSize = 5;

    this.ctx.strokeStyle = 'rgba(107, 114, 128, 0.2)';
    this.ctx.lineWidth = 0.5;

    for (let i = 0; i <= gridSize; i++) {
      // Vertical
      this.ctx.beginPath();
      this.ctx.moveTo(i * cellSize, 0);
      this.ctx.lineTo(i * cellSize, gridSize * cellSize);
      this.ctx.stroke();

      // Horizontal
      this.ctx.beginPath();
      this.ctx.moveTo(0, i * cellSize);
      this.ctx.lineTo(gridSize * cellSize, i * cellSize);
      this.ctx.stroke();
    }
  }

  drawQuadrants() {
    const cellSize = 200;
    const colors = ['#1f2937', '#111827'];

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const colorIdx = (i + j) % 2;
        this.ctx.fillStyle = colors[colorIdx];
        this.ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }

    // Quadrant labels
    this.ctx.fillStyle = 'rgba(156, 163, 175, 0.4)';
    this.ctx.font = 'bold 14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x = i * cellSize + cellSize / 2;
        const y = j * cellSize + cellSize / 2;
        const colLabel = String.fromCharCode('A'.charCodeAt(0) + i);
        this.ctx.fillText(`${colLabel}-${j + 1}`, x, y);
      }
    }
  }

  drawRoutes() {
    this.ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
    this.ctx.lineWidth = 1;

    const positions = Array.from(this.systemPositions.values());
    for (let i = 0; i < positions.length; i++) {
      const p1 = positions[i];

      const distances = positions
        .map((p, idx) => ({ pos: p, idx, dist: this.distance(p1, p) }))
        .filter(d => d.idx !== i)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);

      for (const d of distances) {
        if (d.dist < 150) {
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(d.pos.x, d.pos.y);
          this.ctx.stroke();
        }
      }
    }
  }

  drawSystems() {
    for (const [id, pos] of this.systemPositions) {
      const sys = pos.system;
      const color = getFactionColor(sys.faction);

      // System circle
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Border
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      // Frontiere indicator
      if (sys.is_frontiere) {
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, pos.radius + 3, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  drawSystemsWithGlow() {
    const now = Date.now();
    const glowDuration = 1000;

    for (const [id, pos] of this.systemPositions) {
      const sys = pos.system;
      const color = getFactionColor(sys.faction);

      // Draw system circle
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw glow if active
      if (pos.glow && pos.glowStart && now - pos.glowStart < glowDuration) {
        const elapsed = now - pos.glowStart;
        const progress = elapsed / glowDuration;
        const intensity = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5;

        this.ctx.strokeStyle = `rgba(59, 130, 246, ${intensity * 0.7})`;
        this.ctx.lineWidth = 2 + intensity * 3;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, pos.radius + 5, 0, Math.PI * 2);
        this.ctx.stroke();
      } else if (pos.glow) {
        pos.glow = false;
      }

      // Border
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Frontiere indicator
      if (sys.is_frontiere) {
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, pos.radius + 3, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    for (const cb of this.listeners[event]) {
      cb(data);
    }
  }

  applyDeltas(revealed = [], hidden = [], updated = []) {
    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animationDelay = 0;

    // Handle hidden systems
    for (const sysId of hidden) {
      this.systemPositions.delete(sysId);
    }

    // Handle revealed systems
    for (const sys of revealed) {
      this.addSystem(sys, prefersReducedMotion ? 0 : animationDelay);
      if (!prefersReducedMotion) animationDelay += 200;
    }

    // Handle updated systems
    for (const sys of updated) {
      const existing = this.systemPositions.get(sys.id);
      if (existing) {
        existing.system = sys;
      }
    }

    this.render();
  }

  addSystem(system, animationDelay = 0) {
    const quadPos = parseQuadrantCoords(system.quadrant);
    const pos = getSystemPosition(system, quadPos, 200);
    this.systemPositions.set(system.id, {
      ...pos,
      system,
      radius: 12,
      glow: true,
      glowStart: Date.now() + animationDelay
    });

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([50]);
    }
  }

  replaceSystems(systems = []) {
    this.systems = systems;
    this.systemPositions.clear();
    this.precomputePositions();
    this.render();
  }
}
