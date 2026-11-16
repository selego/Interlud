const ERROR_CODES = require('../utils/errorCodes');
const sentry = require('./sentry');

// Gestionnaire d'erreurs final (SEC-07) : toute erreur transmise à next(err) (passport failWithError, erreur Mongo
// dans une stratégie, JSON malformé, exception synchrone) reçoit une réponse JSON générique, sans message ni pile.
// Sans lui, le finalhandler d'Express renvoie du HTML avec la pile dès que NODE_ENV n'est pas « production ».
function errorHandler(environment) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const rawStatus = err.status || err.statusCode;
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

    let code = ERROR_CODES.SERVER_ERROR;
    if (status === 401) code = ERROR_CODES.UNAUTHORIZED;
    else if (status === 403) code = ERROR_CODES.FORBIDDEN;
    else if (status === 404) code = ERROR_CODES.NOT_FOUND;
    else if (status < 500) code = ERROR_CODES.INVALID_BODY;

    // En production, le handler Sentry monté par setupErrorHandler a déjà remonté l'erreur.
    if (status >= 500 && environment !== 'production') sentry.capture(err);

    return res.status(status).send({ ok: false, code });
  };
}

module.exports = { errorHandler };
