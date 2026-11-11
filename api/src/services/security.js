const helmet = require('helmet');

// En-têtes HTTP de sécurité de l'API (helmet), partagés entre index.js et les tests.
function securityHeaders(environment) {
  return helmet({
    // API JSON uniquement : aucune page HTML servie, une CSP n'apporterait rien et pourrait gêner les redirections SSO.
    contentSecurityPolicy: false,
    // L'app (app.evalud.green) et l'API (api.evalud.green) sont sur le même site : on autorise les ressources pour ce site.
    crossOriginResourcePolicy: { policy: 'same-site' },
    // HSTS seulement en production (HTTPS derrière le proxy Clever Cloud) pour ne pas gêner le développement local.
    strictTransportSecurity: environment === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    frameguard: { action: 'deny' },
    // Valeurs par défaut de helmet, écrites explicitement. L'API ne sert pas de page ; la redirection SSO vers Joptimiz
    // est une navigation normale (pas une popup), donc same-origin ne la gêne pas, et elle part sans Referer.
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}

module.exports = { securityHeaders };
