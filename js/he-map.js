// Mapbox campus points — placeholder when token missing.

window.HEMap = (function () {
  let map = null;
  let ready = false;

  function renderPlaceholder(el, message) {
    el.innerHTML = `<div class="map-placeholder">${message}</div>`;
  }

  function init(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!window.isMapboxConfigured()) {
      renderPlaceholder(
        el,
        'Mapbox placeholder — set <code>HE_CONFIG.map.token</code> in <code>js/he-config.js</code> to a public <code>pk.</code> token. Campus lat/lon from seed/IPEDS HD will plot as points.'
      );
      return;
    }

    if (!window.mapboxgl) {
      renderPlaceholder(el, 'Mapbox GL JS failed to load from CDN.');
      return;
    }

    mapboxgl.accessToken = window.HE_CONFIG.map.token;
    el.innerHTML = '';
    map = new mapboxgl.Map({
      container: el,
      style: window.HE_CONFIG.map.style,
      center: window.HE_CONFIG.map.center,
      zoom: window.HE_CONFIG.map.zoom,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => {
      ready = true;
    });
  }

  function update(campuses) {
    const el = document.getElementById('he-map');
    if (!el) return;

    if (!window.isMapboxConfigured() || !map) {
      const withCoords = campuses.filter((c) => c.latitude != null && c.longitude != null);
      renderPlaceholder(
        el,
        `Mapbox token not set. ${withCoords.length} campus coordinate(s) available in seed data (e.g. ${withCoords
          .slice(0, 3)
          .map((c) => c.inst_name)
          .join(', ')}${withCoords.length > 3 ? '…' : ''}).`
      );
      return;
    }

    const features = campuses
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(c.longitude), Number(c.latitude)],
        },
        properties: {
          unitid: c.unitid,
          name: c.inst_name,
          system: c.system_name || '',
        },
      }));

    const data = { type: 'FeatureCollection', features };

    const apply = () => {
      if (map.getSource('campuses')) {
        map.getSource('campuses').setData(data);
      } else {
        map.addSource('campuses', { type: 'geojson', data });
        map.addLayer({
          id: 'campus-circles',
          type: 'circle',
          source: 'campuses',
          paint: {
            'circle-radius': 7,
            'circle-color': '#0f4c81',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
          },
        });
        map.on('click', 'campus-circles', (e) => {
          const p = e.features[0].properties;
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${p.name}</strong><br>${p.system} · UNITID ${p.unitid}`)
            .addTo(map);
        });
      }

      if (features.length) {
        const bounds = new mapboxgl.LngLatBounds();
        features.forEach((f) => bounds.extend(f.geometry.coordinates));
        map.fitBounds(bounds, { padding: 48, maxZoom: 9 });
      }
    };

    if (ready) apply();
    else map.once('load', apply);
  }

  return { init, update };
})();
