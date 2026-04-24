import { Router } from 'express';

const router = Router();

// Pages legacy supprimées — répondent avec une page gracieuse (200, pas 404)
// Format: [chemin, titre, cible, libellé lien]
const LEGACY_PAGES = [
  ['/compendium.html', 'Compendium',          '/univers.html',    "l'Univers"],
  ['/peril.html',      'Tables de Périls',    '/univers.html',    "l'Univers"],
  ['/revolte.html',    'Révolte',             '/',                "l'accueil"],
  ['/calendrier.html', 'Calendrier',          '/',                "l'accueil"],
];

function movedPage(title, target, linkLabel) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page déplacée — Metal Adventures</title>
  <link rel="stylesheet" href="/css/main.css?v=2.0.0">
  <style>
    body { display:flex; align-items:center; justify-content:center; min-height:100vh; background:#1a1a1a; color:#e0d5bf; font-family:Georgia,serif; }
    .card { background:#232323; border:1px solid #4a3e2a; border-radius:8px; padding:2.5rem 3rem; text-align:center; max-width:480px; }
    h1 { color:#c8a464; margin-top:0; }
    p { line-height:1.7; }
    a { color:#c8a464; text-decoration:none; font-weight:bold; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚓ Page déplacée</h1>
    <p>La page <strong>${title}</strong> a été intégrée à la nouvelle application.</p>
    <p>Rendez-vous sur <a href="${target}">${linkLabel}</a>.</p>
  </div>
</body>
</html>`;
}

for (const [path, title, target, linkLabel] of LEGACY_PAGES) {
  router.get(path, (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(movedPage(title, target, linkLabel));
  });
}

export default router;
