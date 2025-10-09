import "isomorphic-fetch";

import { API_URL } from "../config";

class api {
  constructor() {
    this.token = "";
  }

  getToken() {
    return this.token;
  }

  setToken(token) {
    this.token = token;
  }

  get(path) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `JWT ${this.token}`,
          },
        });

        const res = await response.json();
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }

  put(path, body) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `JWT ${this.token}`,
          },
          body: typeof body === "string" ? body : JSON.stringify(body),
        });

        const res = await response.json();
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }

  postFormData(path, file) {
    let formData = new FormData();
    console.log("file", file);
    formData.append(file.name, file, file.name);
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`${API_URL}${path}`);
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: {},
          body: formData,
        });
        const res = await response.json();
        resolve(res);
      } catch (e) {
        console.log("e", e);
        reject(e);
      }
    });
  }

  remove(path) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `JWT ${this.token}`,
          },
        });
        const res = await response.json();
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }

  post(path, body) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `JWT ${this.token}`,
          },
          body: typeof body === "string" ? body : JSON.stringify(body),
        });

        const res = await response.json();
        resolve(res);
      } catch (e) {
        resolve({ ok: false, code: e.message });
      }
    });
  }

  download(path, body) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `JWT ${this.token}`,
          },
          body: typeof body === "string" ? body : JSON.stringify(body),
        });

        if (response.status !== 200) {
          return reject(response);
        }
        resolve(response);
      } catch (e) {
        reject(e);
      }
    });
  }
}

const API = new api();
export default API;
