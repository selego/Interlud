import "isomorphic-fetch";

import { API_URL } from "../config";

interface ApiOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

interface ApiResponse {
  [key: string]: any;
}

class Api {
  private token: string;

  constructor() {
    this.token = "";
  }

  getToken(): string {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  get(path: string): Promise<ApiResponse> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
        });

        const res = await response.json();
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }

  put(path: string, body: any): Promise<ApiResponse> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
          body: typeof body === "string" ? body : JSON.stringify(body),
        });

        const res = await response.json();
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }

  postFormData(path: string, file: File): Promise<ApiResponse> {
    const formData = new FormData();
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
        console.log("e", res);
        resolve(res);
      } catch (e) {
        console.log("e", e);
        reject(e);
      }
    });
  }

  remove(path: string): Promise<ApiResponse> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          credentials: "include",
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
        });
        const res = await response.json();
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }

  post(path: string, body: any, options: ApiOptions = {}): Promise<ApiResponse> {
    const { signal, ...otherOptions } = options;
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
          body: typeof body === "string" ? body : JSON.stringify(body),
          signal,
          ...otherOptions,
        });

        const res = await response.json();
        if (response.status !== 200) {
          return reject(res);
        }
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  }
  download(path: string, body: any): Promise<Response> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          mode: "cors",
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Authorization: `JWT ${this.token}` },
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

const API = new Api();
export default API;
