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
    this._mj        = false;
    this._combat    = null;
    this._dragging  = null;
    this._svg       = null;
    this._shipEls   = {};  // shipId → <g> element
  }

  setEditable(val) {
    this._editable = Boolean(val);
    if (this._svg) this._applyEditability();
  }

  setMJ(val) {
    this._mj = Boolean(val);
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
      // MJ: draw subtle sensor rings behind ship tokens
      if (this._mj) {
        this._drawSensorRings(svg, combat.vaisseaux);
      }

      // Players: compute visibility map based on sensor range
      const visMap = this._mj ? null : this._computeVisibility(combat.vaisseaux);

      combat.vaisseaux.forEach(ship => {
        const visible = visMap ? (visMap[ship.id] !== false) : true;
        if (visible) {
          this._drawShip(svg, ship);
        } else {
          this._drawBlip(svg, ship);
        }
      });
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
    const ns  = CombatRadar.NS;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'combat-radar-svg');
    svg.setAttribute('viewBox', `0 0 ${CombatRadar.W} ${CombatRadar.H}`);
    svg.setAttribute('xmlns', ns);
    svg.style.width    = '100%';
    svg.style.height   = '100%';
    svg.style.display  = 'block';
    svg.style.margin   = 'auto';

    // ── Defs : gradient + clip-path ─────────────────────────────────────────
    const defs = document.createElementNS(ns, 'defs');

    // Radial gradient for radar face
    const grad = document.createElementNS(ns, 'radialGradient');
    grad.setAttribute('id', 'radarGrad');
    grad.setAttribute('cx', '40%'); grad.setAttribute('cy', '38%');
    grad.setAttribute('r',  '65%');
    [['0%', '#1e3d18', '0.95'], ['60%', '#0d1d0a', '0.98'], ['100%', '#050905', '1']]
      .forEach(([offset, color, opacity]) => {
        const s = document.createElementNS(ns, 'stop');
        s.setAttribute('offset',       offset);
        s.setAttribute('stop-color',   color);
        s.setAttribute('stop-opacity', opacity);
        grad.appendChild(s);
      });
    defs.appendChild(grad);

    // Clip-path : circle for grid/axes/ships
    const clip = document.createElementNS(ns, 'clipPath');
    clip.setAttribute('id', 'radarClip');
    const clipCircle = document.createElementNS(ns, 'circle');
    clipCircle.setAttribute('cx', '300'); clipCircle.setAttribute('cy', '300');
    clipCircle.setAttribute('r',  '285');
    clip.appendChild(clipCircle);
    defs.appendChild(clip);

    svg.appendChild(defs);
    return svg;
  }

  // ── Fond ────────────────────────────────────────────────────────────────────
  _drawBackground(svg) {
    const ns = CombatRadar.NS;
    const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k,v)); return e; };

    // Fond SVG noir
    svg.appendChild(el('rect', { width: 600, height: 600, fill: '#070907' }));

    // Cadre extérieur
    svg.appendChild(el('rect', { x:3, y:3, width:594, height:594, fill:'none', stroke:'#1a2e16', 'stroke-width':'1.5', rx:'4' }));

    // Face radar (gradient)
    svg.appendChild(el('circle', { cx:300, cy:300, r:288, fill:'url(#radarGrad)' }));

    // Anneau extérieur du radar
    svg.appendChild(el('circle', { cx:300, cy:300, r:288, fill:'none', stroke:'#2a4a1e', 'stroke-width':'3' }));
    svg.appendChild(el('circle', { cx:300, cy:300, r:284, fill:'none', stroke:'#1a3014', 'stroke-width':'1', 'stroke-opacity':'0.6' }));

    // Titre BATTLEGRID
    svg.appendChild(el('rect', { x:175, y:9, width:250, height:22, fill:'#0c150a', stroke:'#2a4a1e', 'stroke-width':'1', rx:'3' }));
    const title = el('text', { x:300, y:25, 'text-anchor':'middle', 'font-family':'monospace', 'font-size':'11', 'letter-spacing':'4', fill:'#55cc22', 'font-weight':'bold' });
    title.textContent = 'BATTLEGRID';
    svg.appendChild(title);

    // Scale indicator top-right
    const scaleBox = el('rect', { x:486, y:9, width:106, height:16, fill:'#0c150a', stroke:'#2a4a1e', 'stroke-width':'1', rx:'2' });
    svg.appendChild(scaleBox);
    const scaleTxt = el('text', { x:539, y:21, 'text-anchor':'middle', 'font-family':'monospace', 'font-size':'9', fill:'#44bb00' });
    scaleTxt.innerHTML = '◼ = 25 K';
    svg.appendChild(scaleTxt);

    // Coins mécaniques (4 bolts)
    [[14,14],[586,14],[14,586],[586,586]].forEach(([cx,cy]) => {
      svg.appendChild(el('circle', { cx, cy, r:7, fill:'#1a2a16', stroke:'#3a5030', 'stroke-width':'1.5' }));
      svg.appendChild(el('circle', { cx, cy, r:3, fill:'#2a4020' }));
      [[-5,0],[5,0],[0,-5],[0,5]].forEach(([dx,dy]) => {
        const ln = el('line', { x1:cx+dx*0.4, y1:cy+dy*0.4, x2:cx+dx*0.9, y2:cy+dy*0.9, stroke:'#4a6040', 'stroke-width':'1' });
        svg.appendChild(ln);
      });
    });
  }

  // ── Grille radiale ──────────────────────────────────────────────────────────
  _drawGrid(svg) {
    const ns = CombatRadar.NS;
    const g  = document.createElementNS(ns, 'g');
    g.setAttribute('class',       'grid-group');
    g.setAttribute('clip-path',   'url(#radarClip)');

    // Anneaux
    for (const { r } of CombatRadar.RINGS) {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', CombatRadar.CX);
      circle.setAttribute('cy', CombatRadar.CY);
      circle.setAttribute('r',  r);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#44bb00');
      circle.setAttribute('stroke-width',   r === 300 ? '1.5' : '1');
      circle.setAttribute('stroke-opacity', r === 300 ? '0.65' : '0.3');
      g.appendChild(circle);
    }

    // Graduations (ticks tous les 15px sur les 4 bras)
    for (let px = CombatRadar.PX_PER_25K; px <= 300; px += CombatRadar.PX_PER_25K) {
      const isMajor = (px === 60 || px === 150 || px === 300);
      const tickLen = isMajor ? 7 : 4;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx, dy] of dirs) {
        const x  = CombatRadar.CX + dx * px;
        const y  = CombatRadar.CY + dy * px;
        const tx = dy * tickLen;
        const ty = dx * tickLen;
        const tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', x - tx); tick.setAttribute('y1', y - ty);
        tick.setAttribute('x2', x + tx); tick.setAttribute('y2', y + ty);
        tick.setAttribute('stroke',         '#44bb00');
        tick.setAttribute('stroke-width',   isMajor ? '1.5' : '1');
        tick.setAttribute('stroke-opacity', isMajor ? '0.7' : '0.35');
        g.appendChild(tick);
      }
    }

    svg.appendChild(g);
  }

  // ── Axes ────────────────────────────────────────────────────────────────────
  _drawAxes(svg) {
    const ns = CombatRadar.NS;
    const g  = document.createElementNS(ns, 'g');
    g.setAttribute('class',     'axes-group');
    g.setAttribute('clip-path', 'url(#radarClip)');

    const lines = [
      [14, CombatRadar.CY, CombatRadar.W - 14, CombatRadar.CY],
      [CombatRadar.CX, 14, CombatRadar.CX, CombatRadar.H - 14],
    ];
    lines.forEach(([x1, y1, x2, y2]) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke',         '#44bb00');
      line.setAttribute('stroke-width',   '1.5');
      line.setAttribute('stroke-opacity', '0.75');
      g.appendChild(line);
    });

    const labels = [
      { x: CombatRadar.W - 20, y: CombatRadar.CY - 8, text: '→ attaque',      anchor: 'end'   },
      { x: CombatRadar.CX + 6, y: 46,                  text: '↑ interception', anchor: 'start' },
    ];
    labels.forEach(({ x, y, text, anchor }) => {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('font-size',    '9');
      t.setAttribute('fill',         '#66dd22');
      t.setAttribute('text-anchor',  anchor);
      t.setAttribute('font-family',  'monospace');
      t.textContent = text;
      g.appendChild(t);
    });

    svg.appendChild(g);
  }

  // ── Labels des anneaux ──────────────────────────────────────────────────────
  _drawRingLabels(svg) {
    const ns = CombatRadar.NS;
    const g  = document.createElementNS(ns, 'g');
    g.setAttribute('class',     'ring-labels-group');
    g.setAttribute('clip-path', 'url(#radarClip)');

    for (const { r, label } of CombatRadar.RINGS) {
      // Background pill pour lisibilité
      const bg = document.createElementNS(ns, 'rect');
      bg.setAttribute('x', CombatRadar.CX + r + 2);
      bg.setAttribute('y', CombatRadar.CY - 17);
      bg.setAttribute('width', 32); bg.setAttribute('height', 12);
      bg.setAttribute('fill', '#0d1d0a'); bg.setAttribute('rx', '2');
      g.appendChild(bg);

      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', CombatRadar.CX + r + 4);
      t.setAttribute('y', CombatRadar.CY - 8);
      t.setAttribute('font-size',   '8');
      t.setAttribute('fill',        '#55cc22');
      t.setAttribute('font-family', 'monospace');
      t.textContent = label;
      g.appendChild(t);
    }

    svg.appendChild(g);
  }

  // ── Point zéro ──────────────────────────────────────────────────────────────
  _drawCenter(svg) {
    const ns = CombatRadar.NS;
    const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k,v)); return e; };
    // Anneau cible externe
    svg.appendChild(el('circle', { cx:300, cy:300, r:14, fill:'none', stroke:'#44bb00', 'stroke-width':'1', 'stroke-opacity':'0.5' }));
    // Point central
    svg.appendChild(el('circle', { cx:300, cy:300, r:5, fill:'#55cc22' }));
    // Petites lignes en croix
    svg.appendChild(el('line', { x1:288, y1:300, x2:294, y2:300, stroke:'#44bb00', 'stroke-width':'1.5', 'stroke-opacity':'0.8' }));
    svg.appendChild(el('line', { x1:306, y1:300, x2:312, y2:300, stroke:'#44bb00', 'stroke-width':'1.5', 'stroke-opacity':'0.8' }));
    svg.appendChild(el('line', { x1:300, y1:288, x2:300, y2:294, stroke:'#44bb00', 'stroke-width':'1.5', 'stroke-opacity':'0.8' }));
    svg.appendChild(el('line', { x1:300, y1:306, x2:300, y2:312, stroke:'#44bb00', 'stroke-width':'1.5', 'stroke-opacity':'0.8' }));
  }

  // ── Visibilité joueurs (portée senseurs) ─────────────────────────────────────
  // Retourne un map { shipId → boolean }. false = hors portée (blip seulement).
  _computeVisibility(ships) {
    const joueurs = ships.filter(s => s.camp === 'joueurs' && !s.destroyed);
    // Si aucune donnée senseur disponible chez les joueurs, tout est visible
    const joueursWithSenseurs = joueurs.filter(s => s.senseurs_k > 0);
    if (joueursWithSenseurs.length === 0) return null;

    const result = {};
    for (const ship of ships) {
      // Vaisseaux joueurs toujours visibles
      if (ship.camp === 'joueurs') { result[ship.id] = true; continue; }
      // Contact visuel établi → toujours visible
      if (ship.contact_visuel)    { result[ship.id] = true; continue; }

      const [sx, sy] = this._shipPx(ship);
      let inRange = false;
      for (const j of joueursWithSenseurs) {
        const [jx, jy] = this._shipPx(j);
        const distPx   = Math.sqrt((sx - jx) ** 2 + (sy - jy) ** 2);
        const distK    = (distPx / CombatRadar.PX_PER_25K) * 25;
        if (distK <= j.senseurs_k) { inRange = true; break; }
      }
      result[ship.id] = inRange;
    }
    return result;
  }

  // ── Cercles de portée senseurs (MJ uniquement) ───────────────────────────────
  _drawSensorRings(svg, ships) {
    const ns = CombatRadar.NS;
    const g  = document.createElementNS(ns, 'g');
    g.setAttribute('class',     'sensor-rings-group');
    g.setAttribute('clip-path', 'url(#radarClip)');

    for (const ship of ships) {
      if (!ship.senseurs_k || ship.senseurs_k <= 0) continue;
      const [cx, cy]  = this._shipPx(ship);
      const radiusPx  = (ship.senseurs_k / 25) * CombatRadar.PX_PER_25K;
      const color     = CombatRadar.CAMP_COLOR[ship.camp] ?? '#9ca3af';

      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r',  radiusPx);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width',   '1');
      circle.setAttribute('stroke-dasharray', '3,5');
      circle.setAttribute('stroke-opacity', '0.22');
      g.appendChild(circle);

      // Label portée discret
      const lx = cx + radiusPx;
      const ly = cy - 4;
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', lx);
      lbl.setAttribute('y', ly);
      lbl.setAttribute('font-size',    '7');
      lbl.setAttribute('fill',         color);
      lbl.setAttribute('fill-opacity', '0.35');
      lbl.setAttribute('font-family',  'monospace');
      lbl.setAttribute('text-anchor',  'start');
      lbl.textContent = `${ship.senseurs_k}K`;
      g.appendChild(lbl);
    }
    svg.appendChild(g);
  }

  // ── Contact inconnu (blip) pour joueurs hors portée ──────────────────────────
  _drawBlip(svg, ship) {
    const [cx, cy] = this._shipPx(ship);
    const ns = CombatRadar.NS;

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class',     'ship-blip');
    g.setAttribute('data-ship-id', ship.id);
    g.setAttribute('transform', `translate(${cx},${cy})`);

    // Pulsation externe
    const outer = document.createElementNS(ns, 'circle');
    outer.setAttribute('r', '9');
    outer.setAttribute('fill', 'none');
    outer.setAttribute('stroke', '#4b5563');
    outer.setAttribute('stroke-width', '1');
    outer.setAttribute('stroke-dasharray', '2,3');
    g.appendChild(outer);

    // Point central
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', '#374151');
    dot.setAttribute('stroke', '#6b7280');
    dot.setAttribute('stroke-width', '1');
    g.appendChild(dot);

    // "?"
    const q = document.createElementNS(ns, 'text');
    q.setAttribute('y', '4');
    q.setAttribute('font-size',   '7');
    q.setAttribute('fill',        '#6b7280');
    q.setAttribute('text-anchor', 'middle');
    q.setAttribute('font-family', 'monospace');
    q.textContent = '?';
    g.appendChild(q);

    // Label sous le blip
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('y',           '20');
    lbl.setAttribute('font-size',   '8');
    lbl.setAttribute('fill',        '#4b5563');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-family', 'sans-serif');
    lbl.textContent = 'Inconnu';
    g.appendChild(lbl);

    svg.appendChild(g);
    this._shipEls[ship.id] = g;
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
    posLabel.setAttribute('fill', '#3a8a20');
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
