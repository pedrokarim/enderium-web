/**
 * En-tête de requête posé par le proxy : le chemin demandé (avec ses
 * paramètres), pour y revenir après la connexion. Un composant serveur n'a pas
 * accès à l'URL de la requête ; c'est le proxy qui la lui transmet.
 */
export const REQUEST_PATH_HEADER = 'x-enderium-path';
