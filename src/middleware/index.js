import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authMiddleware from './auth.js';
import tableContextMiddleware from './table-context.js';
import errorHandler from './error-handler.js';

export function mountMiddleware(app) {
  // 1. Static (no auth needed)
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
