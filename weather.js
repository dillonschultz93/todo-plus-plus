const LOCATION_KEY = 'todopp-location';
const COUNTRY_KEY = 'todopp-country';

let weatherCache = {};
let holidayCache = {};

const WMO_ICONS = {
    0: '\u2600\uFE0F', 1: '\uD83C\uDF24\uFE0F', 2: '\u26C5', 3: '\u2601\uFE0F',
    45: '\uD83C\uDF2B\uFE0F', 48: '\uD83C\uDF2B\uFE0F',
    51: '\uD83C\uDF26\uFE0F', 53: '\uD83C\uDF26\uFE0F', 55: '\uD83C\uDF27\uFE0F', 56: '\uD83C\uDF27\uFE0F', 57: '\uD83C\uDF27\uFE0F',
    61: '\uD83C\uDF27\uFE0F', 63: '\uD83C\uDF27\uFE0F', 65: '\uD83C\uDF27\uFE0F', 66: '\uD83C\uDF27\uFE0F', 67: '\uD83C\uDF27\uFE0F',
    71: '\uD83C\uDF28\uFE0F', 73: '\uD83C\uDF28\uFE0F', 75: '\uD83C\uDF28\uFE0F', 77: '\uD83C\uDF28\uFE0F',
    80: '\uD83C\uDF26\uFE0F', 81: '\uD83C\uDF26\uFE0F', 82: '\uD83C\uDF27\uFE0F', 85: '\uD83C\uDF28\uFE0F', 86: '\uD83C\uDF28\uFE0F',
    95: '\u26C8\uFE0F', 96: '\u26C8\uFE0F', 99: '\u26C8\uFE0F',
};

export function getWeatherIcon(code) { return WMO_ICONS[code] || '\uD83C\uDF21\uFE0F'; }
export function getWeatherForDate(dateStr) { return weatherCache[dateStr] || null; }
export function getHolidayForDate(dateStr) { return holidayCache[dateStr] || null; }

export async function loadLocation() {
    const stored = localStorage.getItem(LOCATION_KEY);
    if (stored) return JSON.parse(stored);

    return new Promise(resolve => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
            pos => {
                const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
                resolve(loc);
            },
            () => resolve(null),
            { timeout: 5000 }
        );
    });
}

export async function searchCity(query) {
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`);
        const data = await res.json();
        if (data.results?.length) {
            const loc = { lat: data.results[0].latitude, lon: data.results[0].longitude };
            localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
            return loc;
        }
    } catch (e) { console.error('City search failed:', e); }
    return null;
}

export async function loadWeather(loc) {
    if (!loc) return;
    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
            `&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
        );
        const data = await res.json();
        if (!data.daily) return;
        data.daily.time.forEach((date, i) => {
            weatherCache[date] = {
                code: data.daily.weathercode[i],
                hi: Math.round(data.daily.temperature_2m_max[i]),
            };
        });
    } catch (e) { console.error('Weather load failed:', e); }
}

function detectCountry() {
    const stored = localStorage.getItem(COUNTRY_KEY);
    if (stored) return stored;
    const lang = navigator.language || 'en-US';
    const parts = lang.split('-');
    const country = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'US';
    localStorage.setItem(COUNTRY_KEY, country);
    return country;
}

export async function loadHolidays() {
    const country = detectCountry();
    const year = new Date().getFullYear();
    try {
        const responses = await Promise.all(
            [year, year + 1].map(y =>
                fetch(`https://date.nager.at/api/v3/publicholidays/${y}/${country}`).then(r => r.json())
            )
        );
        responses.flat().forEach(h => { holidayCache[h.date] = h.localName || h.name; });
    } catch (e) { console.error('Holiday load failed:', e); }
}
