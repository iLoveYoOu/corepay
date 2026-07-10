import axios from 'axios'

export const api = axios.create({
  baseURL: 'http://localhost:4000'
})

export function authHeaders() {
  return {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }
}
