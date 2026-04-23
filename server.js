import express from 'express';
import { PORT, JWT_SECRET } from './src/config/index.js';
import { mountMiddleware, errorHandler } from './src/middleware/index.js';
import healthRoutes from './src/routes/health.js';
import authRoutes from './src/routes/auth.js';
import tablesRoutes from './src/routes/tables.js';
import syncRoutes from './src/routes/sync.js';
import visibilityRoutes from './src/routes/visibility.js';
import systemsRoutes from './src/routes/systems.js';
import factionsRoutes from './src/routes/factions.js';
import shipModelsRoutes from './src/routes/ship-models.js';
import searchRoutes from './src/routes/search.js';
import adminRoutes from './src/routes/admin.js';
import profileRoutes from './src/routes/profile.js';
import previewRoutes from './src/routes/preview.js';
import shipsRoutes from './src/routes/ships.js';
import travelRoutes from './src/routes/travel-routes.js';
import legacyRoutes from './src/routes/legacy.js';
import perilsRoutes from './src/routes/perils.js';
import perilsApiRoutes from './src/routes/perils-api.js';
import rulesRoutes from './src/routes/rules.js';
import uploadRoutes from './src/routes/upload.js';
import planetsRoutes from './src/routes/planets.js';
import calendarRoutes from './src/routes/calendar.js';

import { fileURLToPath } from 'url';
import { resolve } from 'path';

// Validate required config
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET manquant — définissez-le dans .env');
  process.exit(1);
}

const app = express();

// Mount middleware pipeline (static → json → cookie → helmet → auth → tableContext)
mountMiddleware(app);

// Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/game_tables', tablesRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/visibility', visibilityRoutes);
app.use('/api/systems', systemsRoutes);
app.use('/api/factions', factionsRoutes);
app.use('/api/ship-models', shipModelsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/preview', previewRoutes);
app.use('/api/ships', shipsRoutes);
app.use('/api/travel-routes', travelRoutes);
app.use('/api/perils-default', perilsRoutes);
app.use('/api/perils', perilsApiRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/planets', planetsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use(legacyRoutes);

// Clean URL support for pages without .html extension
app.get('/rejoindre', (req, res) => res.sendFile(resolve('public/rejoindre.html')));
app.get('/campagne', (req, res) => res.sendFile(resolve('public/campagne.html')));

// Error handler (must be last)
app.use(errorHandler);

// Only start listening when run directly (not imported by tests)
const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`🚀 Metal Adventures server — http://localhost:${PORT}`);
  });
}

export default app;

