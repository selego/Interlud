const ERROR_CODES = {
  EMAIL_AND_PASSWORD_REQUIRED: 'Email et mot de passe requis',
  PASSWORDS_NOT_MATCH: 'Les mots de passe ne correspondent pas',
  SERVER_ERROR: 'Une erreur est survenue',
  UNAUTHORIZED: 'Non autorisé',
  USER_NOT_EXISTS: 'Utilisateur non trouvé',
  USER_ALREADY_REGISTERED: 'Cette adresse e-mail est déjà enregistrée',
  NOT_FOUND: 'Ressource non trouvée',
  EMAIL_OR_PASSWORD_INVALID: 'Mot de passe ou email incorrect',
  PASSWORD_INVALID: 'Mot de passe invalide',
  PASSWORD_NOT_VALIDATED: 'Mot de passe invalide',
  PASSWORD_TOKEN_EXPIRED_OR_INVALID: 'Token de mot de passe expiré ou invalide',
  PASSWORDS_DO_NOT_MATCH: 'Les mots de passe ne correspondent pas',
  INVALID_BODY: 'Corps de la requête invalide',
  CARD_NOT_VALIDATED: 'Carte non validée',
  INSUFFICIENT_FUNDS: 'Fonds insuffisants',
  INVALID_PRICE: 'Prix invalide',
  ALREADY_PAID: 'Déjà payé',
  INDICATOR_ALREADY_EXISTS: 'Indicateur déjà existant',
  FORBIDDEN: 'Accès refusé',
};

module.exports = ERROR_CODES;
