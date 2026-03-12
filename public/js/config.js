// ---------------- Configuration Front ----------------
const CONFIG = {
  apiBase: '',

  airport: {
    code: 'EBLG',
    iata: 'LGG',
    name: 'Liège Airport',
    lat: 50.637,
    lon: 5.443
  },

  // Fond de carte clair (Esri Light Gray Canvas)
  mapTiles: {
    esriLightGray: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS | © OpenStreetMap contributors'
    }
  },

  // Couloirs approximatifs (pistes 22/04)
  corridors: {
    runway_center: { lat: 50.637, lon: 5.443 },
    dep_bearing_deg: 222,   // Décollage 22
    arr_bearing_deg: 42,    // Arrivée 04
    length_km: 30
  },

  // Sonomètres réels autour d'EBLG (coordonnées décimales)
  noiseMonitors: [
    { id:'F017', name:'Wonck',            lat:50.764883, lon:5.630606 },
    { id:'F001', name:'Houtain',          lat:50.738044, lon:5.608833 },
    { id:'F014', name:'Juprelle',         lat:50.718894, lon:5.573164 },
    { id:'F015', name:'Juprelle',         lat:50.688839, lon:5.526216 },
    { id:'F005', name:'Haneffe',          lat:50.639331, lon:5.323519 },
    { id:'F003', name:'St-Georges',       lat:50.601167, lon:5.381400 },
    { id:'F011', name:'St-Georges',       lat:50.601142, lon:5.356006 },
    { id:'F008', name:'St-Georges',       lat:50.594878, lon:5.358950 },
    { id:'F002', name:'St-Georges',       lat:50.588414, lon:5.370522 },
    { id:'F007', name:'St-Georges',       lat:50.590756, lon:5.344114 },
    { id:'F009', name:'Stockay',          lat:50.580831, lon:5.355417 },
    { id:'F004', name:'Verlaine',         lat:50.605414, lon:5.321406 },
    { id:'F010', name:'Verlaine',         lat:50.599392, lon:5.313492 },
    { id:'F013', name:'Verlaine',         lat:50.586914, lon:5.308678 },
    { id:'F016', name:'Verlaine',         lat:50.619617, lon:5.295344 },
    { id:'F006', name:'Chapon-Seraing',   lat:50.609594, lon:5.271403 },
    { id:'F012', name:'Aineffe',          lat:50.621917, lon:5.254747 }
  ],

  // Groupes par zone (pour évolutions futures)
  noiseZones: {
    'Wonck': ['F017'],
    'Houtain': ['F001'],
    'Juprelle': ['F014','F015'],
    'Haneffe': ['F005'],
    'St-Georges': ['F003','F011','F008','F002','F007'],
    'Stockay': ['F009'],
    'Verlaine': ['F004','F010','F013','F016'],
    'Chapon-Seraing': ['F006'],
    'Aineffe': ['F012']
  }
};
