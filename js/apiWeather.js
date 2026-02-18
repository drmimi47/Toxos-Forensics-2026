/**
 * apiWeather.js – Placeholder for future weather-data integration.
 *
 * Will fetch real-time or historical precipitation data and overlay
 * it onto the 3D scene (e.g., color-coded CSO activation risk).
 */
import CONFIG from '../config/config.js';

/**
 * Fetch weather data from the configured API.
 * Returns parsed JSON or null on failure.
 */
export async function fetchWeather() {
  if (!CONFIG.weatherApiUrl) {
    console.warn('[apiWeather] No weather API URL configured — skipping.');
    return null;
  }

  try {
    const res = await fetch(CONFIG.weatherApiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[apiWeather] Fetch failed:', err);
    return null;
  }
}
