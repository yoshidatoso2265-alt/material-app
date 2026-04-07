import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 600000, // 10分（Kaken更新は数分かかる）
})

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error ?? err.message ?? 'エラーが発生しました'
    return Promise.reject(new Error(msg))
  }
)
