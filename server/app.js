// --- Flights (AirLabs) ---
const AIRPORT_IATA = 'LGG';

app.get('/api/flights', async (req, res) => {
  try {
    const base = 'https://airlabs.co/api/v9/flights';
    const key = encodeURIComponent(AIRLABS_KEY || '');

    const [dep, arr, over] = await Promise.all([
      axios.get(`${base}?dep_iata=${AIRPORT_IATA}&api_key=${key}`, { timeout: 8000 }),
      axios.get(`${base}?arr_iata=${AIRPORT_IATA}&api_key=${key}`, { timeout: 8000 }),
      axios.get(`${base}?lat=50.637&lng=5.443&distance=50&api_key=${key}`, { timeout: 8000 })
    ]);

    res.json({
      departures: dep.data.response || [],
      arrivals: arr.data.response || [],
      over: over.data.response || []
    });
  } catch (e) {
    res.status(500).json({
      error: 'AirLabs error',
      details: e.message
    });
  }
});
