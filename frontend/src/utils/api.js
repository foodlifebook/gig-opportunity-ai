// API configuration for frontend
// Uses VITE_API_URL environment variable, falls back to relative /api for local dev

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default API_BASE_URL;
