/**
 * combat-radar.js — Composant SVG Battlegrid interactive
 *
 * Usage :
 *   const radar = new CombatRadar(containerEl);
 *   radar.render(combatData);
 *   radar.setEditable(true);  // MJ uniquement
 *
 * Émet sur containerEl :
 *   ship-moved   → { detail: { shipId, trajectoire, position_k } }
 *   ship-selected → { detail: { shipId } }
 */

export class CombatRadar {
  // ── Constantes visuelles ────────────────────────────────────────────────────
  static W    = 600;
  static H    = 600;
  static CX   = 300;
  static CY   = 300;
  static NS   = 'http://www.w3.org/2000/svg';

  // Anneaux : rayon px → distance K
  static RINGS = [
    { r: 60,  label: '100K' },
    { r: 150, label: '250K' },
    { r: 300, label: '500K' },
  ];

  // 1 incrément = 15px = 25K
  static PX_PER_25K = 15;

  // Couleurs par camp
  static CAMP_COLOR = {
    joueurs: '#22c55e',   // vert
    ennemis: '#ef4444',   // rouge
    neutres: '#eab308',   // jaune
  };

  // ── Constructeur ────────────────────────────────────────────────────────────
  constructor(container) {
    this._container = container;
    this._editable  = false;
    this._combat    = null;
    this._dragging  = null;
    this._svg       = null;
    this._shipEls   = {};  // shipId → <g> element
  }

  setEditable(val) {
    this._editable = Boolean(val);
    if (this._svg) this._applyEditability();
  }

  // ── Render principal ────────────────────────────────────────────────────────
  render(combat) {
    this._combat = combat;
    this._shipEls = {};

    // Supprimer l'ancien SVG
    const old = this._container.querySelector('svg.combat-radar-svg');
    if (old) old.remove();

    const svg = this._createSVG();
    this._svg = svg;

    this._drawBackground(svg);
    this._drawGrid(svg);
    this._drawAxes(svg);
    this._drawRingLabels(svg);
    this._drawCenter(svg);

    if (combat && Array.isArray(combat.vaisseaux)) {
      combat.vaisseaux.forEach(ship => this._drawShip(svg, ship));
      this._drawContactLines(svg, combat.vaisseaux);
    }

    this._applyEditability();
    this._container.appendChild(svg);
  }

  // ── Mise à jour partielle d'un vaisseau ────────────────────────────────────
  updateShip(ship) {
    if (!this._svg) return;
    const existing = this._shipEls[ship.id];
    if (existing) existing.remove();
    this._drawShip(this._svg, ship);

    // Mettre à jour le vaisseau dans les données locales
    if (this._combat?.vaisseaux) {
      const idx = this._combat.vaisseaux.findIndex(s => s.id === ship.id);
      if (idx >= 0) this._combat.vaisseaux[idx] = ship;
      else this._combat.vaisseaux.push(ship);
    }

    // Redessiner les lignes de contact visuel
    const old = this._svg.querySelector('.contact-lines-group');
    if (old) old.remove();
    this._drawContactLines(this._svg, this._combat?.vaisseaux ?? []);
  }

  // ── Création SVG ────────────────────────────────────────────────────────────
  _createSVG() {
    const svg = document.createElementNS(CombatRadar.NS, 'svg');
    svg.setAttribute('class', 'combat-radar-svg');
    svg.setAttribute('viewBox', `0 0 ${CombatRadar.W} ${CombatRadar.H}`);
    svg.setAttribute('xmlns', CombatRadar.NS);
    svg.style.width  = '100%';
    svg.style.height = '100%';
    svg.style.maxWidth  = `${CombatRadar.W}px`;
    svg.style.maxHeight = `${CombatRadar.H}px`;
    svg.style.display   = 'block';
    svg.style.margin    = 'auto';
    return svg;
  }

  // ── Fond ────────────────────────────────────────────────────────────────────
  _drawBackground(svg) {
    const rect = document.createElementNS(CombatRadar.NS, 'rect');
    rect.setAttribute('width',  CombatRadar.W);
    rect.setAttribute('height', CombatRadar.H);
    rect.setAttribute('fill',   '#ffffff');
    rect.setAttribute('rx',     '4');
    svg.appendChild(rect);

    // Bordure style chaîne (double ligne avec petits tirets)
    const border = document.createElementNS(CombatRadar.NS, 'rect');
    border.setAttribute('x', 2); border.setAttribute('y', 2);
    border.setAttribute('width',  CombatRadar.W - 4);
    border.setAttribute('height', CombatRadar.H - 4);
    border.setAttribute('fill',   'none');
    border.setAttribute('stroke', '#1a5c2a');
    border.setAttribute('stroke-width', '3');
    border.setAttribute('stroke-dasharray', '8,4');
    border.setAttribute('rx', '3');
    svg.appendChild(border);
  }

  // ── Grille radiale ──────────────────────────────────────────────────────────
  _drawGrid(svg) {
    const g = document.createElementNS(CombatRadar.NS, 'g');
    g.setAttribute('class', 'grid-group');

    // Anneaux
    for (const { r } of CombatRadar.RINGS) {
      const circle = document.createElementNS(CombatRadar.NS, 'circle');
      circle.setAttribute('cx', CombatRadar.CX);
      circle.setAttribute('cy', CombatRadar.CY);
      circle.setAttribute('r',  r);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#1a5c2a');
      circle.setAttribute('stroke-width', r === 300 ? '2' : '1');
      circle.setAttribute('stroke-opacity', r === 300 ? '0.7' : '0.4');
      g.appendChild(circle);
    }

    // Graduations (ticks tous les 15px sur les 4 bras)
    for (let px = CombatRadar.PX_PER_25K; px <= 300; px += CombatRadar.PX_PER_25K) {
      const isMajor = (px === 60 || px === 150 || px === 300);
      const tickLen = isMajor ? 6 : 4;
      // 4 directions
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx, dy] of dirs) {
        const x = CombatRadar.CX + dx * px;
        const y = CombatRadar.CY + dy * px;
        // tick perpendiculaire à l'axe
        const tx = dy * tickLen;
        const ty = dx * tickLen;
        const tick = document.createElementNS(CombatRadar.NS, 'line');
        tick.setAttribute('x1', x - tx); tick.setAttribute('y1', y - ty);
        tick.setAttribute('x2', x + tx); tick.setAttribute('y2', y + ty);
        tick.setAttribute('stroke', '#1a5c2a');
        tick.setAttribute('stroke-width', isMajor ? '1.5' : '1');
        tick.setAttribute('stroke-opacity', '0.6');
        g.appendChild(tick);
      }
    }

    svg.appendChild(g);
  }

  // ── Axes ────────────────────────────────────────────────────────────────────
  _drawAxes(svg) {
    const g = document.createElementNS(CombatRadar.NS, 'g');
    g.setAttribute('class', 'axes-group');

    const lines = [
      // Horizontal = trajectoire d'attaque
      [10, CombatRadar.CY, CombatRadar.W - 10, CombatRadar.CY],
      // Vertical = trajectoire d'interception
      [CombatRadar.CX, 10, CombatRadar.CX, CombatRadar.H - 10],
    ];
    const labels = [
      { x: CombatRadar.W - 8, y: CombatRadar.CY - 6, text: '→ attaque',     anchor: 'end' },
      { x: CombatRadar.CX + 4, y: 22,                 text: '↑ interception', anchor: 'start' },
    ];

    lines.forEach(([x1, y1, x2, y2]) => {
      const line = document.createElementNS(CombatRadar.NS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', '#1a5c2a');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-opacity', '0.8');
      g.appendChild(line);
    });

    labels.forEach(({ x, y, text, anchor }) => {
      const t = document.createElementNS(CombatRadar.NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('font-size', '9');
      t.setAttribute('fill', '#1a5c2a');
      t.setAttribute('text-anchor', anchor);
      t.setAttribute('font-family', 'monospace');
      t.textContent = text;
      g.appendChild(t);
    });

    // Légende O-O = 25K
    const legend = document.createElementNS(CombatRadar.NS, 'text');
    legend.setAttribute('x', 14); legend.setAttribute('y', CombatRadar.H - 10);
    legend.setAttribute('font-size', '9');
    legend.setAttribute('fill', '#1a5c2a');
    legend.setAttribute('font-family', 'monospace');
    legend.textContent = 'O-O = 25K';
    g.appendChild(legend);

    svg.appendChild(g);
  }

  // ── Labels des anneaux ──────────────────────────────────────────────────────
  _drawRingLabels(svg) {
    const g = document.createElementNS(CombatRadar.NS, 'g');
    g.setAttribute('class', 'ring-labels-group');

    for (const { r, label } of CombatRadar.RINGS) {
      const t = document.createElementNS(CombatRadar.NS, 'text');
      t.setAttribute('x', CombatRadar.CX + r + 4);
      t.setAttribute('y', CombatRadar.CY - 4);
      t.setAttribute('font-size', '9');
      t.setAttribute('fill', '#1a5c2a');
      t.setAttribute('font-family', 'monospace');
      t.textContent = label;
      g.appendChild(t);
    }

    svg.appendChild(g);
  }

  // ── Point zéro ──────────────────────────────────────────────────────────────
  _drawCenter(svg) {
    const circle = document.createElementNS(CombatRadar.NS, 'circle');
    circle.setAttribute('cx', CombatRadar.CX);
    circle.setAttribute('cy', CombatRadar.CY);
    circle.setAttribute('r',  8);
    circle.setAttribute('fill', '#1a5c2a');
    svg.appendChild(circle);
  }

  // ── Lignes de contact visuel ─────────────────────────────────────────────────
  _drawContactLines(svg, ships) {
    const g = document.createElementNS(CombatRadar.NS, 'g');
    g.setAttribute('class', 'contact-lines-group');

    const pairs = new Set();
    for (const ship of ships) {
      if (!ship.contact_visuel) continue;
      for (const other of ships) {
        if (other.id === ship.id) continue;
        const key = [ship.id, other.id].sort().join('|');
        if (pairs.has(key)) continue;
        pairs.add(key);

        const [ax, ay] = this._shipPx(ship);
        const [bx, by] = this._shipPx(other);
        const line = document.createElementNS(CombatRadar.NS, 'line');
        line.setAttribute('x1', ax); line.setAttribute('y1', ay);
        line.setAttribute('x2', bx); line.setAttribute('y2', by);
        line.setAttribute('stroke', '#f59e0b');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '4,3');
        line.setAttribute('stroke-opacity', '0.8');
        g.appendChild(line);
      }
    }

    svg.appendChild(g);
  }

  // ── Token vaisseau ──────────────────────────────────────────────────────────
  _drawShip(svg, ship) {
    const [cx, cy] = this._shipPx(ship);
    const color    = CombatRadar.CAMP_COLOR[ship.camp] ?? '#9ca3af';

    const g = document.createElementNS(CombatRadar.NS, 'g');
    g.setAttribute('class', `ship-token camp-${ship.camp}`);
    g.setAttribute('data-ship-id', ship.id);
    g.setAttribute('transform', `translate(${cx},${cy})`);
    g.style.cursor = this._editable ? 'grab' : 'pointer';

    // Forme selon classe (viewBox 20×20, centré sur 0,0)
    const shape = this._shipShape(ship.classe, color);
    g.appendChild(shape);

    // Arc de surbrillance si Avantage
    if (ship.avantage != null) {
      const arc = document.createElementNS(CombatRadar.NS, 'circle');
      arc.setAttribute('cx', 0); arc.setAttribute('cy', 0); arc.setAttribute('r', 16);
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', '#f59e0b');
      arc.setAttribute('stroke-width', '2');
      arc.setAttribute('stroke-dasharray', '5,2');
      g.appendChild(arc);

      const av = document.createElementNS(CombatRadar.NS, 'text');
      av.setAttribute('x', 14); av.setAttribute('y', -12);
      av.setAttribute('font-size', '9');
      av.setAttribute('fill', '#f59e0b');
      av.setAttribute('font-weight', 'bold');
      av.textContent = `AVT${ship.avantage}`;
      g.appendChild(av);
    }

    // Croix si immobile / détruit
    if (ship.destroyed) {
      const cross1 = this._svgLine(-8, -8, 8, 8, '#ef4444', '2');
      const cross2 = this._svgLine(8, -8, -8, 8, '#ef4444', '2');
      g.appendChild(cross1);
      g.appendChild(cross2);
    }

    // Label nom
    const label = document.createElementNS(CombatRadar.NS, 'text');
    label.setAttribute('x', 0); label.setAttribute('y', 20);
    label.setAttribute('font-size', '9');
    label.setAttribute('fill', color);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-family', 'sans-serif');
    label.textContent = ship.nom.length > 12 ? ship.nom.slice(0, 11) + '…' : ship.nom;
    g.appendChild(label);

    // Position K
    const posLabel = document.createElementNS(CombatRadar.NS, 'text');
    posLabel.setAttribute('x', 0); posLabel.setAttribute('y', 30);
    posLabel.setAttribute('font-size', '8');
    posLabel.setAttribute('fill', '#6b7280');
    posLabel.setAttribute('text-anchor', 'middle');
    posLabel.setAttribute('font-family', 'monospace');
    posLabel.textContent = `${ship.position_k}K`;
    g.appendChild(posLabel);

    // Interactivité
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this._container.dispatchEvent(new CustomEvent('ship-selected', {
        bubbles: true, detail: { shipId: ship.id },
      }));
    });

    if (this._editable) {
      g.addEventListener('mousedown', (e) => this._startDrag(e, ship));
    }

    svg.appendChild(g);
    this._shipEls[ship.id] = g;
  }

  _shipShape(classe, color) {
    const ns = CombatRadar.NS;
    switch (classe) {
      case 'chasseur': {
        const p = document.createElementNS(ns, 'polygon');
        p.setAttribute('points', '0,-10 9,8 -9,8');
        p.setAttribute('fill', color);
        p.setAttribute('stroke', '#ffffff');
        p.setAttribute('stroke-width', '1');
        return p;
      }
      case 'croiseur': {
        const p = document.createElementNS(ns, 'polygon');
        p.setAttribute('points', '0,-10 10,0 0,10 -10,0');
        p.setAttribute('fill', color);
        p.setAttribute('stroke', '#ffffff');
        p.setAttribute('stroke-width', '1');
        return p;
      }
      case 'frégate':
      default: {
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', -9); r.setAttribute('y', -7);
        r.setAttribute('width', 18); r.setAttribute('height', 14);
        r.setAttribute('fill', color);
        r.setAttribute('stroke', '#ffffff');
        r.setAttribute('stroke-width', '1');
        r.setAttribute('rx', '2');
        return r;
      }
    }
  }

  _svgLine(x1, y1, x2, y2, stroke, width) {
    const line = document.createElementNS(CombatRadar.NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', width);
    return line;
  }

  // ── Coordonnées pixel d'un vaisseau ─────────────────────────────────────────
  _shipPx(ship) {
    const pxDist = (Math.abs(ship.position_k) / 25) * CombatRadar.PX_PER_25K;
    const sign   = ship.position_k >= 0 ? 1 : -1;
    if (ship.trajectoire === 'attaque') {
      return [CombatRadar.CX + sign * pxDist, CombatRadar.CY];
    } else {
      return [CombatRadar.CX, CombatRadar.CY - sign * pxDist];
    }
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  _startDrag(e, ship) {
    if (e.button !== 0) return;
    e.preventDefault();
    this._dragging = { ship, startX: e.clientX, startY: e.clientY };

    const onMove = (ev) => this._onDragMove(ev);
    const onUp   = (ev) => this._onDragEnd(ev, onMove, onUp);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  _onDragMove(e) {
    if (!this._dragging) return;
    const { ship } = this._dragging;

    // Coordonnées SVG
    const svgRect = this._svg.getBoundingClientRect();
    const scaleX  = CombatRadar.W / svgRect.width;
    const scaleY  = CombatRadar.H / svgRect.height;
    const svgX    = (e.clientX - svgRect.left) * scaleX;
    const svgY    = (e.clientY - svgRect.top)  * scaleY;

    // Contraindre à l'axe du vaisseau + snap
    let position_k;
    if (ship.trajectoire === 'attaque') {
      const pxFromCenter = svgX - CombatRadar.CX;
      position_k = this._snapPxToK(pxFromCenter);
    } else {
      const pxFromCenter = CombatRadar.CY - svgY;
      position_k = this._snapPxToK(pxFromCenter);
    }

    // Clamp -600..600
    position_k = Math.max(-600, Math.min(600, position_k));

    // Mettre à jour visuellement
    const el = this._shipEls[ship.id];
    if (el) {
      const [nx, ny] = this._shipPxFromK(ship.trajectoire, position_k);
      el.setAttribute('transform', `translate(${nx},${ny})`);
    }

    this._dragging.currentPosition = position_k;
  }

  _onDragEnd(e, onMove, onUp) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);

    if (!this._dragging) return;
    const { ship, currentPosition } = this._dragging;
    this._dragging = null;

    if (currentPosition !== undefined && currentPosition !== ship.position_k) {
      this._container.dispatchEvent(new CustomEvent('ship-moved', {
        bubbles: true,
        detail: {
          shipId:      ship.id,
          trajectoire: ship.trajectoire,
          position_k:  currentPosition,
        },
      }));
    }
  }

  _snapPxToK(pxFromCenter) {
    // px → incréments de 15px → K
    const snappedPx = Math.round(pxFromCenter / CombatRadar.PX_PER_25K) * CombatRadar.PX_PER_25K;
    return (snappedPx / CombatRadar.PX_PER_25K) * 25;
  }

  _shipPxFromK(trajectoire, position_k) {
    const pxDist = (Math.abs(position_k) / 25) * CombatRadar.PX_PER_25K;
    const sign   = position_k >= 0 ? 1 : -1;
    if (trajectoire === 'attaque') {
      return [CombatRadar.CX + sign * pxDist, CombatRadar.CY];
    } else {
      return [CombatRadar.CX, CombatRadar.CY - sign * pxDist];
    }
  }

  // ── Editability ─────────────────────────────────────────────────────────────
  _applyEditability() {
    if (!this._svg) return;
    this._svg.querySelectorAll('.ship-token').forEach(el => {
      el.style.cursor = this._editable ? 'grab' : 'pointer';
    });
  }
}
