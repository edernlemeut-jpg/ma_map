import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authMiddleware from './auth.js';
import tableContextMiddleware from './table-context.js';
import errorHandler from './error-handler.js';

export function mountMiddleware(app) {
  // 1. Static assets with long-lived caching for versioned resources
  //    /css and /js are served with 7-day Cache-Control (paired with ?v= in HTML).
  //    HTML pages are served by the fallback express.static with no maxAge (default ETags only).
  const ASSET_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  app.use('/css', express.static('public/css', { maxAge: ASSET_MAX_AGE }));
  app.use('/js', express.static('public/js', { maxAge: ASSET_MAX_AGE }));
  app.use(express.static('public'));

  // 2. Body parser (10 MB limit for admin import)
  app.use(express.json({ limit: '10mb' }));

  // 3. Cookie parser
  app.use(cookieParser());

  // 4. Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  // 5. Auth (stub pass-through for 1.1)
  app.use(authMiddleware);

  // 6. Table context (stub pass-through for 1.1)
  app.use(tableContextMiddleware);
}

export { errorHandler };
