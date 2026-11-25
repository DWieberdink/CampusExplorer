// Mapbox campus points — placeholder when token missing; distinct errors otherwise.

window.HEMap = (function () {
  let map = null;
  let ready = false;
  let containerId = 'he-map';
  /** Last non-token init/runtime failure message, if any. */
  let lastError = null;

  function renderPlaceholder(el, message) {
    el.innerHTML = `<div class="map-placeholder">${message}</div>`;
  }

  function tokenMissingMessage(campuses) {
    const list = campuses || [];
    const withCoords = list.filter((c) => c.latitude != null && c.longitude != null);
    return `Mapbox token not set. ${withCoords.length} campus coordinate(s) available in seed data (e.g. ${withCoords
      .slice(0, 3)
      .map((c) => c.inst_name)
      .join(', ')}${withCoords.length > 3 ? '…' : ''}).`;
  }

  function init(id) {
    if (id) containerId = id;
    const el = document.getElementById(containerId);
    if (!el) return false;

    if (map) return true;

    lastError = null;

    if (!window.isMapboxConfigured()) {
      renderPlaceholder(
        el,
        'Mapbox placeholder — set <code>HE_CONFIG.map.token</code> in <code>js/he-config.js</code> to a public <code>pk.</code> token. Campus lat/lon from seed/IPEDS HD will plot as points.'
      );
      return false;
    }

    if (!window.mapboxgl) {
      lastError = 'Mapbox GL JS failed to load from CDN.';
      renderPlaceholder(el, lastError);
      return false;
    }

    try {
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
      map.on('error', (e) => {
        const status = e?.error?.status;
        const raw = e?.error?.message || e?.error?.toString?.() || 'unknown error';
        // Never dump access_token query strings into the UI.
        const msg = String(raw).replace(/([?&]access_token=)[^&\s]+/gi, '$1…');
        if (status === 401 || status === 403 || /url|origin|referrer|unauthorized|forbidden/i.test(msg)) {
          lastError =
            '<strong>Mapbox blocked this page (HTTP ' +
            (status || '4xx') +
            ')</strong><br>' +
            'In the Mapbox token dashboard, under URL restrictions, allow ' +
            '<code>https://dwieberdink.github.io/*</code> ' +
            '(covers <code>/CampusExplorer/</code>). Save, wait a minute, hard-refresh.';
        } else {
          lastError = `Mapbox GL error: ${msg}`;
        }
        // Only replace the canvas if the map never became ready (style/auth failure).
        if (!ready) {
          try {
            map.remove();
          } catch (_) {
            /* ignore */
          }
          map = null;
          ready = false;
          renderPlaceholder(el, lastError);
        }
      });
      return true;
    } catch (err) {
      lastError = `Mapbox GL failed to initialize: ${err?.message || err}`;
      map = null;
      ready = false;
      renderPlaceholder(el, lastError);
      return false;
    }
  }

  function update(campuses) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!window.isMapboxConfigured()) {
      renderPlaceholder(el, tokenMissingMessage(campuses));
      return;
    }

    // Token is configured — never show “token not set”. Lazy-init if needed.
    if (!map) {
      init(containerId);
      if (!map) {
        renderPlaceholder(
          el,
          lastError ||
            'Mapbox is configured but the map is not ready. Check the Mapbox GL CDN and URL allowlist in the Mapbox dashboard.'
        );
        return;
      }
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
      if (!map) return;
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

      // Hidden tab containers often need a resize once visible.
      try {
        map.resize();
      } catch (_) {
        /* ignore */
      }
    };

    if (ready) apply();
    else map.once('load', apply);
  }

  /** Call when the map panel becomes visible so GL recalculates layout. */
  function resize() {
    if (!map) return;
    try {
      map.resize();
    } catch (_) {
      /* ignore */
    }
  }

  return { init, update, resize };
})();
