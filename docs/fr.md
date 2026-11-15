# Letterboxd

Suivez dans Gladys Assistant les films vus sur [Letterboxd](https://letterboxd.com), le réseau social des
cinéphiles : le dernier film enregistré par chaque profil suivi, sa note, les films du mois et de l'année, un
déclencheur de scène à chaque nouveau film et un widget de tableau de bord avec les dernières affiches.

Non affiliée à Letterboxd. L'intégration lit le flux RSS public de chaque profil, sans compte.

## Ce que vous obtenez

- **Un appareil par profil suivi** (« Letterboxd Jeanne »), avec cinq fonctionnalités :
  - **Dernier film vu** : « Mouse (2026) · ★★★★ », avec « revu » quand c'en est un ;
  - **Note du dernier film** : de 0,5 à 5 par demi-étoiles, **0 quand le film n'a pas été noté** ;
  - **Films vus ce mois-ci** et **Films vus cette année**, comptés sur le journal (d'après la date de visionnage
    donnée par le membre, dans le fuseau horaire de Gladys, revisionnages compris) ;
  - **Note moyenne cette année**, des films notés de l'année, 0 s'il n'y en a aucun.
- **Un déclencheur de scène** « Letterboxd : nouveau film vu », avec le titre, l'année, la note et une phrase toute
  prête.
- **Un widget de tableau de bord** « Films Letterboxd » : les derniers films avec leur affiche et leurs étoiles, pour
  un profil ou pour tous.

## Prérequis

- Gladys Assistant 5.1 ou plus récent.
- Un accès à Internet depuis Gladys (l'intégration lit `letterboxd.com`).
- Un ou plusieurs profils Letterboxd **publics**. Pas besoin de compte Letterboxd ni de mot de passe : l'intégration
  ne lit que ce que tout le monde peut voir sur le profil.

## Configuration

### Réglages

| Réglage                      | Description                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Profils Letterboxd**       | Noms d'utilisateur ou liens des profils (`https://letterboxd.com/jeanne/`), séparés par des virgules. Dix au plus. |
| **Fréquence de mise à jour** | 30 minutes, 1 heure (par défaut), 2 ou 6 heures. Une requête par profil à chaque lecture.                          |
| **Langue des textes**        | Noms des fonctionnalités (figés à leur création) et phrases envoyées aux scènes. Français par défaut.              |

Enregistrez, puis ouvrez l'onglet **Découverte** de l'intégration et créez les appareils voulus. Un profil inconnu de
Letterboxd est signalé dans le statut de l'intégration et n'a pas d'appareil.

### Le nom d'utilisateur

Le nom d'utilisateur est la fin de l'adresse du profil : `https://letterboxd.com/jeanne/` → `jeanne`. Ce n'est pas le
nom affiché sur le profil. Les majuscules n'ont pas d'importance.

## Appareils

L'appareil d'un profil est mis à jour par l'intégration elle-même à la fréquence choisie (Gladys ne l'interroge
pas). Les valeurs sont gardées entre deux lectures ; quand Letterboxd est injoignable, les dernières restent.

**À propos des comptes.** Le flux RSS contient les **50 dernières entrées du journal** d'un profil. Les films du mois
et de l'année sont comptés dessus : pour un membre qui a enregistré plus de 50 films cette année, le compte de
l'année s'arrête à ce que montre le flux (le widget affiche alors « 50+ »). Un film marqué comme vu sans entrée de
journal n'est pas dans le flux et n'est pas compté.

## Widget du tableau de bord

Ajoutez le widget **Films Letterboxd** à un tableau de bord. Réglages :

- **Profil** : un profil, avec son nom et les films du mois et de l'année en tête ; vide, tous les profils mélangés,
  films les plus récents d'abord.
- **Afficher les affiches** : activé par défaut. Les affiches sont chargées depuis les serveurs d'images de
  Letterboxd par l'intégration (jamais par votre navigateur) ; désactivez-le pour n'en charger aucune.

Chaque ligne montre l'affiche, le titre et l'année, les étoiles, le membre et la date de visionnage. Touchez une ligne
pour voir la note, la date, revisionnage et « j'aime », et un lien vers l'entrée sur Letterboxd.

## Déclencheur de scène

**Letterboxd : nouveau film vu** se déclenche quand un profil suivi a ajouté un film à son journal, à la lecture
suivante (dans l'intervalle de mise à jour). Filtres :

- **Profil** : un appareil, ou vide pour tous les profils ;
- **Visionnage** : premier visionnage, revisionnage, ou les deux (vide).

Variables pour les actions suivantes : `member` (le nom de l'appareil dans Gladys, sans « Letterboxd »), `title`,
`year`, `rating` (0,5 à 5, 0 = sans note), `liked` (1 si le membre a aimé le film), `url` (l'entrée sur Letterboxd) et
`summary`, une phrase comme « Jeanne a vu Mouse (2026), noté 4/5. »

La première lecture d'un profil ne déclenche rien : les films déjà dans son flux ne sont pas des nouveautés. Les films
vus sont gardés dans les données de l'intégration : un redémarrage ne redéclenche rien. Au plus 10 films sont annoncés
par lecture, les autres à la suivante.

## Exemples de scènes

- **Récap de la soirée ciné** : déclencheur « nouveau film vu » → envoyer un message avec `summary` à la famille.
- **Un coup de cœur** : déclencheur « nouveau film vu » → condition sur l'appareil « Note du dernier film » égale à 5
  → envoyer un message avec la variable `title`.
- **Salon** : déclencheur « nouveau film vu » pour votre propre profil → rallumer les lumières après le film.

## Source des données, conditions et quotas

- Source : le flux RSS public `https://letterboxd.com/<utilisateur>/rss/` de chaque profil. L'API de Letterboxd n'est
  accordée que sur demande, et l'intégration ne s'en sert pas.
- L'intégration s'identifie par un User-Agent honnête et envoie une requête par profil à chaque lecture (une fois par
  heure par défaut), plus les vignettes d'affiches que montre le widget, gardées en mémoire.
- **La liste à voir (watchlist) n'est pas lue** : elle n'a pas de flux RSS, et sa page est faite pour les
  navigateurs.
- Les titres, affiches et données appartiennent à Letterboxd et à leurs ayants droit ; l'intégration ne fait que les
  afficher sur votre tableau de bord.

## Dépannage

- **« Profil introuvable sur Letterboxd »** : vérifiez le nom d'utilisateur dans l'adresse du profil, pas le nom
  affiché.
- **Un profil sans appareil** : le profil est peut-être privé, désactivé ou inexistant.
- **« Letterboxd est injoignable »** : Gladys n'a pas accès à Internet, ou Letterboxd est en panne ; l'intégration
  réessaie à chaque lecture et signale le retour.
- **Un film manque** : seules les entrées du journal sont dans le flux. Ajoutez le film au journal (avec une date) sur
  Letterboxd.
- **Noms de fonctionnalités dans la mauvaise langue** : ils sont figés à la création de l'appareil. Changez la langue,
  puis supprimez et recréez l'appareil.
- Journaux : la page de l'intégration dans Gladys montre ses journaux ; `LOG_LEVEL=debug` détaille chaque lecture.

## Limites

- Développée sans compte Letterboxd dédié, sur des flux publics : retours bienvenus.
- Comptes fondés sur les 50 dernières entrées du journal (voir plus haut).
- Ni liste à voir, ni listes, ni texte des critiques : le journal seulement.
- Un film est vu à la lecture suivante, pas instantanément.
