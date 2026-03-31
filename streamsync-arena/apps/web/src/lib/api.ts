import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const OPERATOR_TOKEN = import.meta.env.VITE_OPERATOR_TOKEN;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: OPERATOR_TOKEN ? { Authorization: `Bearer ${OPERATOR_TOKEN}` } : undefined
});
