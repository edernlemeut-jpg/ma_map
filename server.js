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
import dashboardRoutes from './src/routes/dashboard.js';
import previewRoutes from './src/routes/preview.js';
import shipsRoutes from './src/routes/ships.js';
import travelRoutes from './src/routes/travel-routes.js';
import legacyRoutes from './src/routes/legacy.js';
import perilsRoutes from './src/routes/perils.js';

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
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/preview', previewRoutes);
app.use('/api/ships', shipsRoutes);
app.use('/api/travel-routes', travelRoutes);
app.use('/api/perils-default', perilsRoutes);
app.use(legacyRoutes);

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

