import React, { useState, useEffect } from "react"
import API from "../../services/api"
import toast from "react-hot-toast"

export default function Test() {
  const [files, setFiles] = useState()
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedFileId, setSelectedFileId] = useState(null)
  const [cells, setCells] = useState(null)
  const [cellToUpdate, setCellToUpdate] = useState({ cell: "A1", value: "" })

  const loadFiles = async () => {
    try {
      const { ok, data } = await API.get(`/excel/sharepoint`)
      if (!ok) return toast.error(data.error)
      setFiles(data)
    } catch (error) {
      console.error(error)
    }
  }

  const loadCells = async (fileId, fileName) => {
    try {
      setSelectedFile(fileName)
      setSelectedFileId(fileId)
      const { ok, data } = await API.get(`/excel/cells/${fileId}?worksheetName=Feuil1&range=A10:B10`)
      if (!ok) return toast.error(data.error)
      setCells(data)
    } catch (error) {
      console.error(error)
    }
  }

  const updateCell = async () => {
    if (!selectedFileId) return toast.error("Sélectionnez d'abord un fichier")
    try {
      const { ok, data } = await API.post(`/excel/cell/${selectedFileId}`, { sheet: "Feuil1", cell: cellToUpdate.cell, value: cellToUpdate.value })
      if (!ok) return toast.error(data.error)
      toast.success(`Cellule ${cellToUpdate.cell} modifiée !`)
      loadCells(selectedFileId, selectedFile)
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la modification")
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Fichiers Excel SharePoint</h2>
          <div className="space-y-2">
            {files &&
              files.map((file) => (
                <div key={file.id} className="flex items-center justify-between border p-3 rounded hover:bg-gray-50">
                  <span className="font-medium">{file.name}</span>
                  <button onClick={() => loadCells(file.id, file.name)} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Voir les cellules
                  </button>
                </div>
              ))}
          </div>
        </div>

        {selectedFile && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Modifier une cellule - {selectedFile}</h2>
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Cellule</label>
                <input
                  type="text"
                  value={cellToUpdate.cell}
                  onChange={(e) => setCellToUpdate({ ...cellToUpdate, cell: e.target.value })}
                  placeholder="A1"
                  className="border rounded px-3 py-2 w-24"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Nouvelle valeur</label>
                <input
                  type="text"
                  value={cellToUpdate.value}
                  onChange={(e) => setCellToUpdate({ ...cellToUpdate, value: e.target.value })}
                  placeholder="Entrez la valeur"
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
              <button onClick={updateCell} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                Modifier
              </button>
            </div>
          </div>
        )}
      </div>
      {cells && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">📋 Cellules - {selectedFile}</h2>

          {/* Affichage des valeurs */}
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Valeurs :</h3>
            <table className="min-w-full border-collapse border border-gray-300">
              <tbody>
                {cells.values.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border border-gray-300 px-4 py-2 bg-white text-center">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Affichage des formules (optionnel) */}
          <div>
            <h3 className="font-semibold mb-2">Formules :</h3>
            <table className="min-w-full border-collapse border border-gray-300">
              <tbody>
                {cells.formulas.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border border-gray-300 px-4 py-2 bg-gray-50 text-center font-mono text-sm">
                        {cell || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
