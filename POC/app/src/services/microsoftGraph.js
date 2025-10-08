/**
 * Microsoft Graph API pour modifier Excel dans OneDrive
 *
 * Fonctionnalités :
 * - Authentification Microsoft avec MSAL
 * - Listage des fichiers OneDrive
 * - Modification de cellules Excel via Microsoft Graph
 */

import { PublicClientApplication } from "@azure/msal-browser"
import { msalConfig, loginRequest } from "../authConfig"

const msalInstance = new PublicClientApplication(msalConfig)

// Authentification Microsoft avec popup
async function signIn() {
  await msalInstance.initialize()
  const response = await msalInstance.loginPopup(loginRequest)
  return response.accessToken
}

// Liste les fichiers à la racine de OneDrive
async function listFiles(token) {
  const url = "https://graph.microsoft.com/v1.0/me/drive/root/children"

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (response.ok) {
    const data = await response.json()
    console.log("📁 Files in OneDrive root:")
    data.value.forEach(file => {
      console.log(`  - ${file.name} (${file.file ? "file" : "folder"})`)
    })
    return data.value
  } else {
    const error = await response.json()
    throw new Error(`Failed to list files: ${error.error?.message}`)
  }
}

// Récupère les informations de l'utilisateur connecté
async function getUserInfo(token) {
  const url = "https://graph.microsoft.com/v1.0/me"

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (response.ok) {
    const userInfo = await response.json()
    console.log("👤 User info:", userInfo)
    return userInfo
  } else {
    const error = await response.json()
    console.error("❌ Failed to get user info:", error)
    throw new Error(`Failed to get user info: ${error.error?.message}`)
  }
}

// Modifie une cellule dans un fichier Excel OneDrive
async function updateExcelCell(token, fileName = "ReactTest.xlsx", worksheetName = "Feuil1", cellAddress = "A1", newValue = `Hello depuis React ! ${new Date().toLocaleString()}`) {
  // D'abord, lister les fichiers et trouver le fichier Excel
  console.log(`📊 Looking for Excel file: ${fileName}`)
  const files = await listFiles(token)

  const excelFile = files.find(file => file.name === fileName)

  if (!excelFile) {
    console.error(
      `❌ Excel file not found in files:`,
      files.map(f => f.name)
    )
    throw new Error(`Excel file ${fileName} not found in OneDrive`)
  }

  console.log(`📊 Found Excel file: ${excelFile.name} (ID: ${excelFile.id})`)

  // Créer une session de workbook
  const sessionUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${excelFile.id}/workbook/createSession`

  console.log("📊 Creating Excel session...")
  const sessionResponse = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      persistChanges: true
    })
  })

  if (!sessionResponse.ok) {
    const error = await sessionResponse.json()
    throw new Error(`Failed to create Excel session: ${error.error?.message}`)
  }

  const session = await sessionResponse.json()
  console.log("📊 Excel session created:", session.id)

  // Maintenant modifier la cellule
  const updateUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${excelFile.id}/workbook/worksheets('${worksheetName}')/range(address='${cellAddress}')`

  console.log(`📝 Updating cell ${cellAddress} in worksheet ${worksheetName}...`)

  const updateResponse = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "workbook-session-id": session.id
    },
    body: JSON.stringify({
      values: [[newValue]]
    })
  })

  console.log("📊 Update response status:", updateResponse.status)

  if (updateResponse.ok) {
    const result = await updateResponse.json()
    console.log("✅ Excel cell updated successfully!", result)

    // Fermer la session
    const closeSessionUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${excelFile.id}/workbook/closeSession`
    await fetch(closeSessionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "workbook-session-id": session.id
      }
    })

    return {
      message: "Excel cell updated successfully",
      fileName,
      worksheetName,
      cellAddress,
      newValue,
      result
    }
  } else {
    const error = await updateResponse.json()
    console.error("❌ Failed to update Excel:", error)
    throw new Error(`Failed to update Excel cell: ${error.error?.message}`)
  }
}

// Fonction pour mettre à jour plusieurs cellules en une seule session
async function updateMultipleCells(token, fileInfo, worksheetName, cellUpdates) {
  let fileId, fileName

  // Si c'est un objet avec id et name (fichier sélectionné)
  if (typeof fileInfo === "object" && fileInfo.id) {
    fileId = fileInfo.id
    fileName = fileInfo.name
    console.log(`📊 Using selected Excel file: ${fileName} (ID: ${fileId})`)
  } else {
    // C'est un nom de fichier, chercher dans la liste (compatibilité)
    console.log(`📊 Looking for Excel file: ${fileInfo}`)
    const files = await listFiles(token)
    const excelFile = files.find(file => file.name === fileInfo)

    if (!excelFile) {
      console.error(
        `❌ Excel file not found in files:`,
        files.map(f => f.name)
      )
      throw new Error(`Excel file ${fileInfo} not found in OneDrive`)
    }

    fileId = excelFile.id
    fileName = excelFile.name
    console.log(`📊 Found Excel file: ${fileName} (ID: ${fileId})`)
  }

  // Créer une session de workbook
  const sessionUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/createSession`

  console.log("📊 Creating Excel session...")
  const sessionResponse = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      persistChanges: true
    })
  })

  if (!sessionResponse.ok) {
    const error = await sessionResponse.json()
    throw new Error(`Failed to create Excel session: ${error.error?.message}`)
  }

  const session = await sessionResponse.json()
  console.log("📊 Excel session created:", session.id)

  const results = []

  try {
    // Mettre à jour chaque cellule
    for (const { cellAddress, value } of cellUpdates) {
      const updateUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets('${worksheetName}')/range(address='${cellAddress}')`

      console.log(`📝 Updating cell ${cellAddress} with value: ${value}`)

      const updateResponse = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "workbook-session-id": session.id
        },
        body: JSON.stringify({
          values: [[value]]
        })
      })

      if (updateResponse.ok) {
        const result = await updateResponse.json()
        console.log(`✅ Cell ${cellAddress} updated successfully!`)
        results.push({ cellAddress, value, success: true, result })
      } else {
        const error = await updateResponse.json()
        console.error(`❌ Failed to update ${cellAddress}:`, error)
        results.push({ cellAddress, value, success: false, error: error.error?.message })
      }
    }
  } finally {
    // Fermer la session
    const closeSessionUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/closeSession`
    await fetch(closeSessionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "workbook-session-id": session.id
      }
    })
    console.log("📊 Excel session closed")
  }

  return {
    message: "Multiple cells updated",
    fileName,
    worksheetName,
    results
  }
}

// Fonction pour lire les valeurs de cellules spécifiques
async function readCellValues(token, fileInfo, worksheetName, cellAddresses) {
  let fileId, fileName

  // Si c'est un objet avec id et name (fichier sélectionné)
  if (typeof fileInfo === "object" && fileInfo.id) {
    fileId = fileInfo.id
    fileName = fileInfo.name
    console.log(`📖 Reading from selected Excel file: ${fileName} (ID: ${fileId})`)
  } else {
    // C'est un nom de fichier, chercher dans la liste (compatibilité)
    console.log(`📊 Looking for Excel file: ${fileInfo}`)
    const files = await listFiles(token)
    const excelFile = files.find(file => file.name === fileInfo)

    if (!excelFile) {
      console.error(
        `❌ Excel file not found in files:`,
        files.map(f => f.name)
      )
      throw new Error(`Excel file ${fileInfo} not found in OneDrive`)
    }

    fileId = excelFile.id
    fileName = excelFile.name
    console.log(`📊 Found Excel file: ${fileName} (ID: ${fileId})`)
  }

  const results = []

  // Lire chaque cellule
  for (const cellAddress of cellAddresses) {
    const readUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets('${worksheetName}')/range(address='${cellAddress}')`

    console.log(`📖 Reading cell ${cellAddress}...`)

    const readResponse = await fetch(readUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    })

    if (readResponse.ok) {
      const result = await readResponse.json()
      const value = result.values && result.values[0] && result.values[0][0]
      console.log(`✅ Cell ${cellAddress} value:`, value)
      results.push({ cellAddress, value, success: true })
    } else {
      const error = await readResponse.json()
      console.error(`❌ Failed to read ${cellAddress}:`, error)
      results.push({ cellAddress, value: null, success: false, error: error.error?.message })
    }
  }

  return {
    message: "Cell values read",
    fileName,
    worksheetName,
    results
  }
}

// Fonction pour récupérer tous les fichiers Excel dans OneDrive
async function getExcelFiles(token) {
  console.log("📊 Searching for Excel files in OneDrive...")

  try {
    // D'abord, essayer avec la fonction listFiles qui fonctionne bien
    console.log("📁 Getting all files from root directory...")
    const allFiles = await listFiles(token)

    // Filtrer pour ne garder que les fichiers Excel
    const excelFiles = allFiles.filter(file => {
      const fileName = file.name.toLowerCase()
      return fileName.endsWith(".xlsx") || fileName.endsWith(".xls")
    })

    console.log(`📊 Found ${excelFiles.length} Excel files in root:`)
    excelFiles.forEach(file => {
      console.log(`  - ${file.name} (${file.size} bytes)`)
    })

    // Si on trouve des fichiers dans le root, les retourner
    if (excelFiles.length > 0) {
      return excelFiles.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModifiedDateTime || file.lastModified,
        path: "/drive/root:"
      }))
    }

    // Sinon, essayer la recherche globale comme fallback
    console.log("📊 No Excel files in root, trying global search...")
    const searchUrl = "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.xlsx OR .xls')"

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      const searchResults = data.value.filter(file => {
        const fileName = file.name.toLowerCase()
        return fileName.endsWith(".xlsx") || fileName.endsWith(".xls")
      })

      console.log(`📊 Global search found ${searchResults.length} Excel files:`)
      searchResults.forEach(file => {
        console.log(`  - ${file.name} (${file.size} bytes) at ${file.parentReference?.path}`)
      })

      return searchResults.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModifiedDateTime,
        path: file.parentReference?.path || "/drive/root:"
      }))
    } else {
      const error = await response.json()
      console.error("❌ Failed to search Excel files:", error)
      throw new Error(`Failed to search Excel files: ${error.error?.message}`)
    }
  } catch (error) {
    console.error("❌ Error in getExcelFiles:", error)
    throw error
  }
}

// Fonction pour créer un nouveau modèle de calcul à partir du master
async function createCalculationModel(token, allFiles) {
  console.log(`🧮 Creating new calculation model from master template`)

  // Chercher le fichier modele_calcul_master
  const masterFile = allFiles.find(file => file.name.toLowerCase().includes("modele_calcul_master") || file.name.toLowerCase().includes("modele-calcul-master"))

  if (!masterFile) {
    throw new Error("Fichier modèle 'modele_calcul_master' introuvable dans OneDrive")
  }

  console.log(`🧮 Found master template: ${masterFile.name}`)

  // Générer un nom unique pour le nouveau modèle
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hour = String(now.getHours()).padStart(2, "0")
  const minute = String(now.getMinutes()).padStart(2, "0")
  const newModelName = `Calcul_${year}-${month}-${day}_${hour}h${minute}.xlsx`

  console.log(`🧮 New model name: ${newModelName}`)

  // URL pour copier le fichier
  const copyUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${masterFile.id}/copy`

  const copyData = {
    name: newModelName,
    parentReference: {
      path: "/drive/root:"
    }
  }

  const response = await fetch(copyUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(copyData)
  })

  if (response.ok) {
    // L'API retourne un 202 Accepted avec un location header pour suivre le progrès
    const location = response.headers.get("Location")
    console.log(`🧮 Model creation started, tracking at: ${location}`)

    // Attendre un peu et vérifier que le fichier a été créé
    await new Promise(resolve => setTimeout(resolve, 2000))

    return {
      success: true,
      message: `Nouveau modèle de calcul créé avec succès`,
      masterName: masterFile.name,
      newModelName: newModelName,
      trackingUrl: location
    }
  } else {
    const error = await response.json()
    console.error("❌ Failed to create calculation model:", error)
    throw new Error(`Failed to create calculation model: ${error.error?.message}`)
  }
}

export async function run() {
  try {
    console.log("🔐 Starting authentication...")
    const token = await signIn()
    console.log("✅ Authentication successful")

    console.log("👤 Getting user information...")
    const userInfo = await getUserInfo(token)

    console.log("🎉 Success! Connected as:", userInfo.displayName || userInfo.userPrincipalName)

    console.log("📊 Updating Excel file...")
    const result = await updateExcelCell(token, "ReactTest.xlsx", "Feuil1", "A1")
    console.log("🎉 Excel Success:", result)

    return { userInfo, excelResult: result }
  } catch (error) {
    console.error("❌ Error in run():", error)
    throw error
  }
}

// Export des fonctions principales
export { signIn, listFiles, updateExcelCell, updateMultipleCells, readCellValues, getExcelFiles, createCalculationModel, getUserInfo }
