import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERILS_PATH = resolve(__dirname, '../../perils_data.json');

const router = Router();

// GET /api/perils-default — Données de périls par défaut (lecture seule, aucune auth requise)
router.get('/', (req, res) => {
  if (!existsSync(PERILS_PATH)) {
    return res.status(404).json({ error: 'perils_data.json introuvable' });
  }
  try {
    const data = JSON.parse(readFileSync(PERILS_PATH, 'utf-8'));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Erreur lecture perils_data.json' });
  }
});

export default router;
