import React from "react"

export default function Conditions() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-sm p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">Conditions Générales d'Utilisation</h1>
          <p className="text-sm text-gray-500 mt-2">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>
        </div>

        <div className="prose max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Objet</h2>
            <p className="text-gray-700 leading-relaxed">
              Les présentes Conditions Générales d'Utilisation (ci-après "CGU") ont pour objet de définir les conditions d'accès et d'utilisation de la plateforme InTerLUD+.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Acceptation des CGU</h2>
            <p className="text-gray-700 leading-relaxed">
              L'utilisation de la plateforme InTerLUD+ implique l'acceptation pleine et entière des présentes CGU. 
              En accédant et en utilisant ce service, vous reconnaissez avoir lu, compris et accepté d'être lié par ces conditions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Description du service</h2>
            <p className="text-gray-700 leading-relaxed">
              InTerLUD+ est une plateforme numérique permettant aux collectivités territoriales et aux acteurs économiques 
              de déployer des actions volontaires sur le transport de marchandises en ville dans le cadre des chartes de 
              logistique urbaine durable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Accès au service</h2>
            <p className="text-gray-700 leading-relaxed">
              L'accès à la plateforme est réservé aux utilisateurs ayant créé un compte. L'utilisateur s'engage à fournir 
              des informations exactes et à mettre à jour ses données personnelles si nécessaire.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Utilisation du service</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              L'utilisateur s'engage à utiliser la plateforme conformément à sa destination et dans le respect des lois et 
              règlements en vigueur. Il est notamment interdit de :
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Utiliser le service à des fins illégales ou frauduleuses</li>
              <li>Porter atteinte aux droits de tiers</li>
              <li>Perturber le fonctionnement de la plateforme</li>
              <li>Tenter d'accéder de manière non autorisée au système</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Propriété intellectuelle</h2>
            <p className="text-gray-700 leading-relaxed">
              L'ensemble des contenus présents sur la plateforme (textes, images, logos, etc.) sont protégés par le droit 
              de la propriété intellectuelle. Toute reproduction ou utilisation non autorisée est interdite.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Responsabilité</h2>
            <p className="text-gray-700 leading-relaxed">
              InTerLUD+ s'efforce d'assurer la continuité et la qualité du service, mais ne peut garantir une disponibilité 
              absolue. L'utilisateur est seul responsable de l'utilisation qu'il fait du service et des données qu'il y introduit.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Modification des CGU</h2>
            <p className="text-gray-700 leading-relaxed">
              InTerLUD+ se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés 
              des modifications importantes. L'utilisation continue du service après modification vaut acceptation des nouvelles CGU.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              Pour toute question concernant les présentes CGU, vous pouvez nous contacter via la page de contact de la plateforme.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

