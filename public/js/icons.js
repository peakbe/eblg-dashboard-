function aircraftDivIcon(color, heading=0){
  const svg = `
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
       style="transform: rotate(${heading}deg);transform-origin: 50% 50%;">
    <path d="M12 2l2.5 6.5H21l-6 5 2.3 7.5L12 16l-5.3 5 2.3-7.5-6-5h6.5L12 2z"
      fill="${color}" stroke="white" stroke-width="0.7" />
  </svg>`;
  return L.divIcon({ className: "aircraft-icon", html: svg, iconSize:[26,26],iconAnchor:[13,13]});
}

function noiseDivIcon(){
  const svg = `
  <svg width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="#001a4d" stroke="#bcd1ff" stroke-width="1.2"/>
    <rect x="11" y="7" width="2" height="10" rx="1" fill="#bcd1ff"/>
    <circle cx="12" cy="12" r="2" fill="#bcd1ff"/>
  </svg>`;
  return L.divIcon({ className:"noise-icon", html:svg, iconSize:[24,24], iconAnchor:[12,12] });
}
