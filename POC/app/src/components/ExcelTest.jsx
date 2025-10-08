import { useState } from "react"
import { signIn, updateMultipleCells, readCellValues, getExcelFiles, createCalculationModel } from "../services/microsoftGraph"

export default function ExcelTest() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [readValues, setReadValues] = useState(null)
  const [token, setToken] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectLoading, setConnectLoading] = useState(false)
  const [excelFiles, setExcelFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [creatingModel, setCreatingModel] = useState(false)
  const [cellValues, setCellValues] = useState({
    A2: '',
    A3: '',
    A4: ''
  })

  const handleInputChange = (cell, value) => {
    setCellValues(prev => ({
      ...prev,
      [cell]: value
    }))
  }

  const handleConnect = async () => {
    setConnectLoading(true)
    setError(null)
    
    try {
      console.log("🔐 Connecting to Microsoft...")
      const authToken = await signIn()
      setToken(authToken)
      setIsConnected(true)
      console.log("✅ Connected successfully!")
      
      // Charger automatiquement la liste des fichiers Excel
      setFilesLoading(true)
      console.log("📊 Loading Excel files...")
      const files = await getExcelFiles(authToken)
      setExcelFiles(files)
      console.log(`✅ Loaded ${files.length} Excel files`)
    } catch (err) {
      setError(err.message)
      console.error("❌ Connection error:", err)
    } finally {
      setConnectLoading(false)
      setFilesLoading(false)
    }
  }

  const handleDisconnect = () => {
    setToken(null)
    setIsConnected(false)
    setExcelFiles([])
    setSelectedFile(null)
    setCreatingModel(false)
    setResult(null)
    setReadValues(null)
    setError(null)
    console.log("🔌 Disconnected")
  }

  const handleCreateModel = async () => {
    if (!token || !isConnected) {
      setError("Veuillez d'abord vous connecter")
      return
    }

    setCreatingModel(true)
    setError(null)
    
    try {
      console.log(`🧮 Creating new calculation model...`)
      
      // Récupérer tous les fichiers pour trouver le master
      const allFiles = await getExcelFiles(token)
      const result = await createCalculationModel(token, allFiles)
      
      // Recharger la liste des fichiers pour voir le nouveau modèle
      setFilesLoading(true)
      const updatedFiles = await getExcelFiles(token)
      setExcelFiles(updatedFiles)
      
      setResult({
        message: `✅ ${result.message}`,
        details: `Basé sur "${result.masterName}" → "${result.newModelName}"`
      })
      
      console.log(`✅ Model created: ${result.newModelName}`)
      
    } catch (err) {
      setError(`Erreur lors de la création du modèle: ${err.message}`)
      console.error("❌ Model creation error:", err)
    } finally {
      setCreatingModel(false)
      setFilesLoading(false)
    }
  }

  const handleUpdateCells = async () => {
    if (!token || !isConnected) {
      setError("Veuillez d'abord vous connecter")
      return
    }

    if (!selectedFile) {
      setError("Veuillez sélectionner un fichier Excel")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setReadValues(null)
    
    try {
      // Préparer les mises à jour de cellules
      const cellUpdates = [
        { cellAddress: "A1", value: `Hello depuis React ! ${new Date().toLocaleString()}` }
      ]
      
      // Ajouter les cellules avec des valeurs saisies
      Object.entries(cellValues).forEach(([cell, value]) => {
        if (value.trim() !== '') {
          const numericValue = parseFloat(value)
          cellUpdates.push({ 
            cellAddress: cell, 
            value: isNaN(numericValue) ? value : numericValue 
          })
        }
      })
      
      console.log("📊 Updating multiple cells:", cellUpdates)
      const updateResult = await updateMultipleCells(token, selectedFile, "Feuil1", cellUpdates)
      
      // Après la mise à jour, lire automatiquement les cellules G4, G5, G6
      console.log("📖 Reading cells G4, G5, G6 after update...")
      const readResult = await readCellValues(token, selectedFile, "Feuil1", ["G4", "G5", "G6"])
      
      setResult({ 
        message: "Cellules mises à jour avec succès!", 
        results: updateResult.results.map(r => ({ 
          cell: r.cellAddress, 
          value: r.value,
          success: r.success
        }))
      })
      
      setReadValues(readResult.results)
      
      console.log("✅ Succès! Cellules Excel modifiées:", updateResult)
      console.log("✅ Succès! Valeurs des cellules lues:", readResult)
    } catch (err) {
      // Si le token a expiré, demander une reconnexion
      if (err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('token')) {
        setIsConnected(false)
        setToken(null)
        setError("Token expiré. Veuillez vous reconnecter.")
      } else {
        setError(err.message)
      }
      console.error("❌ Erreur:", err)
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-lg border">
      <h2 className="text-2xl font-bold mb-4 text-center">📊 Test Microsoft Graph Excel</h2>
      
      {!isConnected ? (
        // Section de connexion
        <div className="mb-6">
          <div className="text-center mb-4">
            <p className="text-gray-600 mb-4">
              🔐 Connectez-vous d'abord à Microsoft pour accéder à vos fichiers Excel
            </p>
            <button
              onClick={handleConnect}
              disabled={connectLoading}
              className="w-full bg-green-500 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded transition-colors"
            >
              {connectLoading ? "🔄 Connexion en cours..." : "🔐 Se connecter à Microsoft"}
            </button>
          </div>
        </div>
      ) : (
        // Section principale avec inputs
        <div>
          <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded">
            <p className="text-xs text-green-700 text-center">
              ✅ Connecté à Microsoft ! {excelFiles.length} fichiers Excel trouvés.
            </p>
            <div className="text-center mt-2">
              <button
                onClick={handleDisconnect}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                🔌 Se déconnecter
              </button>
            </div>
          </div>

          {filesLoading ? (
            <div className="mb-6 text-center">
              <div className="text-blue-600">🔄 Chargement des fichiers Excel...</div>
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-700">
                  📊 Vos fichiers Excel ({excelFiles.length}) :
                </h3>
                <button
                  onClick={handleCreateModel}
                  disabled={creatingModel}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-md transition-colors"
                >
                  {creatingModel ? '🔄 Création...' : '🧮 Nouveau modèle'}
                </button>
              </div>
              
              {excelFiles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  📄 Aucun fichier Excel trouvé dans OneDrive
                </div>
              ) : (
                <div className="space-y-2">
                  {excelFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                        selectedFile?.id === file.id
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">📄</span>
                          <div>
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-xs text-gray-500">
                              {Math.round(file.size / 1024)} KB • Modifié le {new Date(file.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setSelectedFile(file)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          selectedFile?.id === file.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {selectedFile?.id === file.id ? '✅ Sélectionné' : '✏️ Éditer'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedFile && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">
                    ✅ Prêt à éditer : <strong>{selectedFile.name}</strong>
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Vous pouvez maintenant modifier les cellules ci-dessous
                  </p>
                </div>
              )}
            </div>
          )}
          
          {selectedFile && (
            <div className="mb-6 text-sm text-gray-600">
        <p className="mb-3">Saisissez des valeurs pour les cellules :</p>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <label className="w-8 font-mono text-sm font-semibold">A2:</label>
            <input
              type="number"
              value={cellValues.A2}
              onChange={(e) => handleInputChange('A2', e.target.value)}
              placeholder="Entrez un nombre"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center space-x-3">
            <label className="w-8 font-mono text-sm font-semibold">A3:</label>
            <input
              type="number"
              value={cellValues.A3}
              onChange={(e) => handleInputChange('A3', e.target.value)}
              placeholder="Entrez un nombre"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center space-x-3">
            <label className="w-8 font-mono text-sm font-semibold">A4:</label>
            <input
              type="number"
              value={cellValues.A4}
              onChange={(e) => handleInputChange('A4', e.target.value)}
              placeholder="Entrez un nombre"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      
      <button
        onClick={handleUpdateCells}
        disabled={loading}
        className="w-full bg-blue-500 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded transition-colors mb-6"
      >
        {loading ? "🔄 Mise à jour en cours..." : "📊 Mettre à jour les cellules"}
      </button>
    </div>
    )}
  </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <strong>❌ Erreur:</strong> {error}
        </div>
      )}

      {readValues && (
        <div className="mt-4 p-3 bg-purple-100 border border-purple-400 text-purple-700 rounded">
          <strong>📖 Valeurs lues :</strong>
          <div className="mt-3 space-y-2">
            {readValues.map((item, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-2 rounded border">
                <span className="font-mono font-semibold">{item.cellAddress}:</span>
                <span className="font-mono text-lg">
                  {item.success ? (
                    item.value !== null && item.value !== undefined ? 
                      (typeof item.value === 'number' ? item.value.toLocaleString() : item.value) : 
                      <span className="text-gray-400 italic">vide</span>
                  ) : (
                    <span className="text-red-500">erreur</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-purple-600">Valeurs actuelles dans ReactTest.xlsx</p>
        </div>
      )}

      {result && (
        <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          <strong>✅ Succès!</strong> 
          <p className="mt-2 text-sm">Cellules mises à jour dans ReactTest.xlsx :</p>
          <ul className="mt-2 text-xs space-y-1">
            {result.results && result.results.map((item, index) => (
              <li key={index} className="font-mono">
                • {item.cell}: {item.value || "Hello depuis React!"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-600">Vérifiez votre fichier dans OneDrive</p>
        </div>
      )}
    </div>
  )
}
