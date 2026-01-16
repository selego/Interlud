import React from "react"

export default function Politique() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-sm p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">Politique de Confidentialité</h1>
          <p className="text-sm text-gray-500 mt-2">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>
        </div>

        <div className="prose max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              InTerLUD+ s'engage à protéger la vie privée de ses utilisateurs. La présente Politique de Confidentialité 
              décrit la manière dont nous collectons, utilisons, stockons et protégeons vos données personnelles.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Données collectées</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Nous collectons les données personnelles suivantes :
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Nom et prénom</li>
              <li>Adresse e-mail</li>
              <li>Informations relatives à votre organisation (collectivité ou acteur économique)</li>
              <li>Données de connexion et d'utilisation de la plateforme</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Finalités du traitement</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Vos données personnelles sont traitées pour les finalités suivantes :
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Gestion de votre compte utilisateur</li>
              <li>Fourniture des services de la plateforme</li>
              <li>Communication relative au service</li>
              <li>Amélioration de la plateforme et des services proposés</li>
              <li>Respect des obligations légales et réglementaires</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Base légale du traitement</h2>
            <p className="text-gray-700 leading-relaxed">
              Le traitement de vos données personnelles est fondé sur votre consentement, l'exécution d'un contrat, 
              l'accomplissement d'obligations légales ou la poursuite d'intérêts légitimes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Conservation des données</h2>
            <p className="text-gray-700 leading-relaxed">
              Vos données personnelles sont conservées pendant la durée nécessaire aux finalités pour lesquelles elles 
              ont été collectées, et conformément aux obligations légales applicables.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Vos droits</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Droit d'accès à vos données personnelles</li>
              <li>Droit de rectification de vos données</li>
              <li>Droit à l'effacement de vos données</li>
              <li>Droit à la limitation du traitement</li>
              <li>Droit à la portabilité de vos données</li>
              <li>Droit d'opposition au traitement</li>
              <li>Droit de retirer votre consentement à tout moment</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Pour exercer ces droits, vous pouvez nous contacter via la page de contact de la plateforme.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Sécurité des données</h2>
            <p className="text-gray-700 leading-relaxed">
              Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données 
              personnelles contre tout accès non autorisé, perte, destruction ou altération.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Partage des données</h2>
            <p className="text-gray-700 leading-relaxed">
              Vos données personnelles ne sont pas vendues, louées ou cédées à des tiers. Elles peuvent être partagées 
              avec nos partenaires techniques dans le cadre de la fourniture du service, dans le respect de la réglementation 
              applicable.
            </p>
          </section>

          <section id="cookies">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              La plateforme utilise des cookies pour améliorer l'expérience utilisateur et analyser l'utilisation du site. 
              Vous pouvez gérer vos préférences de cookies via les paramètres de votre navigateur ou via notre système de 
              gestion des consentements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              Pour toute question concernant cette politique de confidentialité ou l'exercice de vos droits, vous pouvez 
              nous contacter via la page de contact de la plateforme.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

