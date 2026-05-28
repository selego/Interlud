export const FAQ_CATEGORIES = [
  { id: "decouvrir", label: "Découvrir InTerLUD+" },
  { id: "compte", label: "Compte et accès" },
  { id: "actions", label: "Actions et indicateurs" },
  { id: "confidentialite", label: "Confidentialité" }
]

export const FAQ = [
  {
    id: "qu-est-ce-interlud",
    category: "decouvrir",
    question: "Qu'est-ce que la plateforme InTerLUD+ ?",
    answer:
      "InTerLUD+ est une plateforme numérique d'intérêt général qui accompagne les collectivités territoriales et les acteurs économiques dans le déploiement d'actions volontaires sur le transport de marchandises en ville, dans le cadre des chartes de logistique urbaine durable.",
    featured: true
  },
  {
    id: "qui-peut-utiliser",
    category: "decouvrir",
    question: "Qui peut utiliser la plateforme ?",
    answer:
      "La plateforme s'adresse aux collectivités territoriales (EPCI) signataires d'une charte de logistique urbaine durable, ainsi qu'aux acteurs économiques (entreprises, transporteurs, chargeurs) impliqués dans ces démarches.",
    featured: true
  },
  {
    id: "comment-creer-compte",
    category: "compte",
    question: "Comment créer un compte ?",
    answer:
      "Rendez-vous sur la page d'inscription, complétez le formulaire avec vos informations professionnelles, puis sélectionnez la collectivité à laquelle vous souhaitez être rattaché. Votre inscription sera validée par un administrateur de la collectivité.",
    featured: true
  },
  {
    id: "modifier-collectivite",
    category: "compte",
    question: "Comment changer de collectivité active ?",
    answer: "Utilisez le sélecteur de collectivité présent dans la barre de navigation. Votre choix est mémorisé dans votre navigateur et appliqué à toutes les pages."
  },
  {
    id: "role-economic-actor",
    category: "compte",
    question: "Quelle différence entre utilisateur et acteur économique ?",
    answer:
      "Un utilisateur appartient à une collectivité et y gère des actions territoriales. Un acteur économique représente une entreprise et peut porter ses propres actions, partagées ou non avec une collectivité."
  },
  {
    id: "qu-est-ce-action",
    category: "actions",
    question: "Qu'est-ce qu'une action environnementale ?",
    answer:
      "Une action est une mesure concrète mise en place pour réduire l'impact environnemental du transport de marchandises. Chaque action est suivie au travers de quatre situations temporelles : initiale, de référence, prévisionnelle et ex-post.",
    featured: true
  },
  {
    id: "situations-temporelles",
    category: "actions",
    question: "Que représentent les 4 situations temporelles (initiale, référence, prévisionnelle, ex-post) ?",
    answer:
      "Chaque action est suivie au travers de quatre situations qui correspondent à des moments distincts de son cycle de vie. La situation initiale décrit l'état de départ, avant toute mise en œuvre. La situation de référence sert de point de comparaison stable, généralement l'état du territoire ou de l'activité avant l'action. La situation prévisionnelle correspond aux valeurs projetées une fois l'action mise en place. Enfin, la situation ex-post mesure les résultats réels constatés après déploiement. Chaque situation est associée à une année, ce qui permet de calculer les gains environnementaux en comparant les situations entre elles (par exemple référence vs ex-post).",
    featured: true
  },
  {
    id: "indicateurs",
    category: "actions",
    question: "Comment fonctionnent les indicateurs ?",
    answer:
      "Les indicateurs sont des variables mesurables associées à une action. Vous saisissez leurs valeurs pour chaque situation temporelle, ce qui permet d'évaluer la progression et l'impact réel de l'action mise en place.",
    featured: true
  },
  {
    id: "donnees-personnelles",
    category: "confidentialite",
    question: "Comment sont protégées mes données personnelles ?",
    answer: "Vos données sont traitées conformément au RGPD. Pour plus de détails, consultez notre politique de confidentialité accessible depuis le pied de page."
  }
]
