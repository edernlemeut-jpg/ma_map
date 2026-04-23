/**
 * calendar.js — Service métier pour le calendrier galactique par table.
 *
 * Format date galactique : XXYY.ZZ
 *   XX = mois (01–10), YY = semaine (01–05), ZZ = jour de semaine (01–05)
 *   250 jours/an
 */
import db from '../database.js';
import { randomUUID } from 'crypto';

// ── Helpers format date ──────────────────────────────────────────────────────
const DATE_RE = /^(\d{2})(\d{2})\.(\d{2})$/;
function isValidDate(d) {
  if (!d) return false;
  const m = d.match(DATE_RE);
  if (!m) return false;
  const [, mm, ww, dd] = m.map(Number);
  return mm >= 1 && mm <= 10 && ww >= 1 && ww <= 5 && dd >= 1 && dd <= 5;
}

/** Converts XXYY.ZZ to 0-based day index in year (0–249) */
export function dateToIndex(dateStr) {
  const m = dateStr.match(DATE_RE);
  if (!m) return null;
  const [, mm, ww, dd] = m.map(Number);
  return (mm - 1) * 25 + (ww - 1) * 5 + (dd - 1);
}

/** Converts 0-based day index + year to XXYY.ZZ string */
export function indexToDate(idx, year) {
  const realYear = year + Math.floor(idx / 250);
  const dayInYear = ((idx % 250) + 250) % 250;
  const mm = Math.floor(dayInYear / 25) + 1;
  const rem = dayInYear % 25;
  const ww = Math.floor(rem / 5) + 1;
  const dd = (rem % 5) + 1;
  return {
    date: `${String(mm).padStart(2,'0')}${String(ww).padStart(2,'0')}.${String(dd).padStart(2,'0')}`,
    year: realYear,
  };
}

/** Adds N days to a galactic date, handling year overflow */
export function addDays(dateStr, year, n) {
  const idx = dateToIndex(dateStr);
  if (idx === null) return null;
  return indexToDate(idx + n, year);
}

// ── Campaign state (current date) ─────────────────────────────────────────────
export function getCampaignDate(tableId) {
  const row = db.prepare('SELECT campaign_date, campaign_year FROM game_tables WHERE id = ?').get(tableId);
  if (!row) return null;
  return { date: row.campaign_date || '0101.01', year: row.campaign_year || 50429 };
}

export function setCampaignDate(tableId, date, year) {
  if (!isValidDate(date)) throw Object.assign(new Error('Format de date invalide (attendu XXYY.ZZ)'), { status: 400 });
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1) throw Object.assign(new Error('Année invalide'), { status: 400 });
  db.prepare('UPDATE game_tables SET campaign_date = ?, campaign_year = ? WHERE id = ?').run(date, y, tableId);
  return { date, year: y };
}

// ── Categories ────────────────────────────────────────────────────────────────
export function getCategories(tableId) {
  // Ensure default "Trajet" category exists for this table
  const existing = db.prepare('SELECT * FROM calendar_categories WHERE table_id = ? ORDER BY id').all(tableId);
  if (!existing.find(c => c.is_system === 1)) {
    db.prepare('INSERT INTO calendar_categories (table_id, name, color, is_system) VALUES (?, ?, ?, 1)')
      .run(tableId, 'Trajet', '#8b5cf6');
    return db.prepare('SELECT * FROM calendar_categories WHERE table_id = ? ORDER BY id').all(tableId);
  }
  return existing;
}

export function createCategory(tableId, name, color) {
  if (!name?.trim()) throw Object.assign(new Error('Nom requis'), { status: 400 });
  const r = db.prepare('INSERT INTO calendar_categories (table_id, name, color, is_system) VALUES (?, ?, ?, 0)')
    .run(tableId, name.trim(), color || '#6b7280');
  return db.prepare('SELECT * FROM calendar_categories WHERE id = ?').get(r.lastInsertRowid);
}

export function deleteCategory(catId, tableId) {
  const cat = db.prepare('SELECT * FROM calendar_categories WHERE id = ? AND table_id = ?').get(catId, tableId);
  if (!cat) throw Object.assign(new Error('Catégorie introuvable'), { status: 404 });
  if (cat.is_system) throw Object.assign(new Error('La catégorie système ne peut pas être supprimée'), { status: 403 });
  // Nullify events that use it
  db.prepare('UPDATE calendar_events SET category_id = NULL WHERE category_id = ?').run(catId);
  db.prepare('DELETE FROM calendar_categories WHERE id = ?').run(catId);
}

// ── Events ────────────────────────────────────────────────────────────────────
/**
 * Returns events for a given year.
 * - MJ/admin: all events
 * - Players: only is_public = 1
 */
export function getEvents(tableId, year, isMJ) {
  const y = Number(year);
  const sql = isMJ
    ? `SELECT e.*, c.name AS category_name, c.color AS category_color
       FROM calendar_events e
       LEFT JOIN calendar_categories c ON c.id = e.category_id
       WHERE e.table_id = ? AND e.galactic_year = ?
       ORDER BY e.date_start`
    : `SELECT e.*, c.name AS category_name, c.color AS category_color
       FROM calendar_events e
       LEFT JOIN calendar_categories c ON c.id = e.category_id
       WHERE e.table_id = ? AND e.galactic_year = ? AND e.is_public = 1
       ORDER BY e.date_start`;
  return db.prepare(sql).all(tableId, y);
}

export function createEvent(tableId, userId, { title, description, category_id, date_start, date_end, galactic_year, is_public }) {
  if (!title?.trim()) throw Object.assign(new Error('Titre requis'), { status: 400 });
  if (!isValidDate(date_start)) throw Object.assign(new Error('date_start invalide'), { status: 400 });
  if (date_end && !isValidDate(date_end)) throw Object.assign(new Error('date_end invalide'), { status: 400 });
  const y = Number(galactic_year);
  if (!Number.isInteger(y) || y < 1) throw Object.assign(new Error('Année invalide'), { status: 400 });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO calendar_events (id, table_id, title, description, category_id, date_start, date_end, galactic_year, is_public, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, tableId, title.trim(), description?.trim() || null, category_id || null,
        date_start, date_end || null, y, is_public ? 1 : 0, userId);

  return db.prepare(
    `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM calendar_events e LEFT JOIN calendar_categories c ON c.id = e.category_id WHERE e.id = ?`
  ).get(id);
}

export function updateEvent(eventId, tableId, { title, description, category_id, date_start, date_end, galactic_year, is_public }) {
  const ev = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND table_id = ?').get(eventId, tableId);
  if (!ev) throw Object.assign(new Error('Événement introuvable'), { status: 404 });

  if (date_start && !isValidDate(date_start)) throw Object.assign(new Error('date_start invalide'), { status: 400 });
  if (date_end && !isValidDate(date_end)) throw Object.assign(new Error('date_end invalide'), { status: 400 });

  db.prepare(
    `UPDATE calendar_events SET
      title       = COALESCE(?, title),
      description = ?,
      category_id = COALESCE(?, category_id),
      date_start  = COALESCE(?, date_start),
      date_end    = ?,
      galactic_year = COALESCE(?, galactic_year),
      is_public   = ?
     WHERE id = ?`
  ).run(
    title?.trim() || null,
    description !== undefined ? (description?.trim() || null) : ev.description,
    category_id || null,
    date_start || null,
    date_end !== undefined ? (date_end || null) : ev.date_end,
    galactic_year ? Number(galactic_year) : null,
    is_public !== undefined ? (is_public ? 1 : 0) : ev.is_public,
    eventId
  );

  return db.prepare(
    `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM calendar_events e LEFT JOIN calendar_categories c ON c.id = e.category_id WHERE e.id = ?`
  ).get(eventId);
}

export function deleteEvent(eventId, tableId) {
  const ev = db.prepare('SELECT id FROM calendar_events WHERE id = ? AND table_id = ?').get(eventId, tableId);
  if (!ev) throw Object.assign(new Error('Événement introuvable'), { status: 404 });
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);
}
