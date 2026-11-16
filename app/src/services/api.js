import "isomorphic-fetch"

import { apiURL } from "../config"

class api {
  constructor() {
    this.token = ""
  }

  getToken() {
    return this.token
  }

  removeToken() {
    this.token = ""
  }

  setToken(token) {
    this.token = token
  }

  // Session expirée ou invalide (401 de passport, sans JSON) : retour à la connexion (SEC-10)
  redirectIfSessionExpired(response) {
    if (response.status !== 401 || response.headers.get("content-type")?.includes("application/json")) return
    if (window.location.pathname.startsWith("/auth")) return
    window.location.href = "/auth"
  }

  get(path) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${apiURL}${path}`, {
          mode: "cors",
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` }
        })
        this.redirectIfSessionExpired(response)

        const res = await response.json()
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  put(path, body) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${apiURL}${path}`, {
          mode: "cors",
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
          body: typeof body === "string" ? body : JSON.stringify(body)
        })
        this.redirectIfSessionExpired(response)

        const res = await response.json()
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  postFormData(path, file) {
    let formData = new FormData()
    console.log("file", file)
    formData.append(file.name, file, file.name)
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`${apiURL}${path}`)
        const response = await fetch(`${apiURL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: {},
          body: formData
        })
        this.redirectIfSessionExpired(response)
        const res = await response.json()
        console.log("e", res)
        resolve(res)
      } catch (e) {
        console.log("e", e)
        reject(e)
      }
    })
  }

  delete(path) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${apiURL}${path}`, {
          mode: "cors",
          credentials: "include",
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` }
        })
        this.redirectIfSessionExpired(response)
        const res = await response.json()
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  post(path, body) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${apiURL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
          body: typeof body === "string" ? body : JSON.stringify(body)
        })
        this.redirectIfSessionExpired(response)

        const res = await response.json()
        if (response.status !== 200) {
          return reject(res)
        }
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }
  download(path, body) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${apiURL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
          body: typeof body === "string" ? body : JSON.stringify(body)
        })
        this.redirectIfSessionExpired(response)

        if (response.status !== 200) {
          return reject(response)
        }
        resolve(response)
      } catch (e) {
        reject(e)
      }
    })
  }
}

const API = new api()
export default API
