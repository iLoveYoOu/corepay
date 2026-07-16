import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000
})

export function authHeaders() {
  return {
    headers: {
      Authorization:
        `Bearer ${localStorage.getItem('token') || ''}`
    }
  }
}

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('corepay:unauthorized')
        )
      }
    }

    return Promise.reject(error)
  }
)
