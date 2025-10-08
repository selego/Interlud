export const msalConfig = {
  auth: {
    clientId: "233baa42-5a78-4d42-843e-993c97ab5bf7",
    authority: "https://login.microsoftonline.com/consumers", // Utilise les comptes Microsoft personnels
    redirectUri: "http://localhost:3000"
  }
}

export const loginRequest = {
  scopes: ["User.Read", "Files.ReadWrite"] // Permissions minimales pour OneDrive personnel
}
