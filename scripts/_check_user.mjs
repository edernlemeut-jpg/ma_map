import Database from 'better-sqlite3';
const db = new Database('./db/ma.db');
const users = db.prepare("SELECT id, username, is_admin FROM users WHERE username = 'Crepe'").all();
console.log('user:', JSON.stringify(users));
const tables = db.prepare("SELECT id, name FROM game_tables LIMIT 5").all();
console.log('tables:', JSON.stringify(tables));
