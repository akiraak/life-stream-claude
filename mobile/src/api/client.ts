import axios from 'axios';
import { API_BASE_URL } from '../config/api-endpoint';
import { getToken, removeToken } from '../utils/token';
import { getDeviceId } from '../utils/device-id';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    try {
      const deviceId = await getDeviceId();
      config.headers['X-Device-Id'] = deviceId;
    } catch {
      // device id is best-effort; server endpoints that need it will 400
    }
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await removeToken();
    }
    return Promise.reject(error);
  },
);

export default client;
