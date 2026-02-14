// ============================================
// STANDALONE PROPERTY MAP
// Displays all properties on an interactive map
// Wrapped in IIFE to avoid conflicts with other scripts
// ============================================

(function() {
  'use strict';
  
  const WORKER_URL = 'https://hostaway-proxy.triad-sync.workers.dev';

let standaloneMap = null;
let standaloneMarkers = [];
let standaloneClusterGroup = null;

// Initialize
async function initStandaloneMap() {
  console.log('🗺️ Standalone Map: Initializing...');
  
  const container = document.getElementById('standalone-map-container');
  if (!container) {
    console.error('Map container not found');
    return;
  }
  
  // Show loading state
  showMapLoading(container);
  
  try {
    // Fetch all properties
    const properties = await fetchAllProperties();
    
    if (properties.length === 0) {
      console.warn('No properties found');
      removeMapLoading();
      return;
    }
    
    // Initialize map
    await initializeLeafletMap(properties);
    
    // Remove loading state
    removeMapLoading();
    
    console.log(`✅ Standalone Map ready with ${properties.length} properties`);
    
  } catch (error) {
    console.error('❌ Map initialization failed:', error);
    removeMapLoading();
    showMapError(container);
  }
}

// Fetch all properties from Worker
async function fetchAllProperties() {
  console.log('📡 Fetching properties...');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${WORKER_URL}/api/webflow/properties`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter: only live, booking active, with pricing
    const filtered = (data.properties || []).filter(property => {
      return property.isLive && 
             property.bookingActive && 
             (property.priceMin > 0 || property.priceMax > 0) &&
             property.priceMin !== 3000 &&
             property.priceMax !== 3000 &&
             property.latitude &&
             property.longitude;
    });
    
    console.log(`✅ Fetched ${filtered.length} properties`);
    return filtered;
    
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Initialize Leaflet map
async function initializeLeafletMap(properties) {
  console.log('🗺️ Creating Leaflet map...');
  
  // Calculate center from all properties
  const avgLat = properties.reduce((sum, p) => sum + parseFloat(p.latitude), 0) / properties.length;
  const avgLng = properties.reduce((sum, p) => sum + parseFloat(p.longitude), 0) / properties.length;
  
  // Calculate bounds
  const lats = properties.map(p => parseFloat(p.latitude));
  const lngs = properties.map(p => parseFloat(p.longitude));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  
  const latPadding = (maxLat - minLat) * 0.2;
  const lngPadding = (maxLng - minLng) * 0.2;
  
  const maxBounds = L.latLngBounds(
    [minLat - latPadding, minLng - lngPadding],
    [maxLat + latPadding, maxLng + lngPadding]
  );
  
  // Initialize map
  standaloneMap = L.map('standalone-map-container', {
    zoomControl: true,
    attributionControl: false,
    maxBounds: maxBounds,
    maxBoundsViscosity: 1.0
  }).setView([avgLat, avgLng], 6);
  
  // Add tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 14,
    minZoom: 4
  }).addTo(standaloneMap);
  
  // Check if MarkerCluster is available
  if (typeof L.markerClusterGroup === 'function') {
    standaloneClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="standalone-marker-cluster">${count}</div>`,
          className: 'standalone-marker-cluster-container',
          iconSize: L.point(40, 40)
        });
      }
    });
    
    // Add markers to cluster
    properties.forEach(property => {
      const marker = createPropertyMarker(property);
      if (marker) {
        standaloneClusterGroup.addLayer(marker);
      }
    });
    
    standaloneMap.addLayer(standaloneClusterGroup);
    console.log('✅ Using marker clustering');
  } else {
    // Fallback without clustering
    console.warn('⚠️ MarkerCluster not available');
    properties.forEach(property => {
      const marker = createPropertyMarker(property);
      if (marker) {
        marker.addTo(standaloneMap);
      }
    });
  }
  
  // Fit map to show all markers
  if (standaloneMarkers.length > 0) {
    const group = L.featureGroup(standaloneMarkers);
    standaloneMap.fitBounds(group.getBounds().pad(0.1));
  }
}

// Create property marker
function createPropertyMarker(property) {
  const lat = parseFloat(property.latitude);
  const lng = parseFloat(property.longitude);
  
  if (isNaN(lat) || isNaN(lng)) return null;
  
  // House icon marker
  const markerIcon = L.divIcon({
    className: 'standalone-custom-marker-wrapper',
    html: `
      <div class="standalone-custom-marker">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });
  
  // Popup content
  const propertyUrl = `/listings/${property.listingId}`;
  const priceRange = formatPriceRange(property.priceMin, property.priceMax);
  
  const popupContent = `
    <a href="${propertyUrl}" style="text-decoration: none; color: inherit; display: block;">
      <div style="font-family: 'Manrope', sans-serif;">
        ${property.featuredImage ? `<img src="${property.featuredImage}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 12px 12px 0 0; margin-bottom: 12px;" alt="${property.name}">` : ''}
        <div style="padding: 0 8px 8px;">
          <div style="font-size: 13px; color: #717171; margin-bottom: 4px;">
            ${property.city}, ${property.state}
          </div>
          <h3 style="font-size: 16px; font-weight: 600; color: #0F2C3A; margin: 0 0 8px 0;">
            ${property.name}
          </h3>
          <div style="font-size: 15px; font-weight: 600; color: #0F2C3A;">
            ${priceRange}<span style="font-weight: 400; font-size: 13px;">/night</span>
          </div>
        </div>
      </div>
    </a>
  `;
  
  // Create marker
  const marker = L.marker([lat, lng], {
    icon: markerIcon
  })
  .bindPopup(popupContent, {
    maxWidth: 280,
    minWidth: 280,
    className: 'standalone-custom-popup'
  });
  
  // Hover effects
  marker.on('mouseover', function(e) {
    const markerElement = e.target.getElement();
    if (markerElement) {
      const customMarker = markerElement.querySelector('.standalone-custom-marker');
      if (customMarker) {
        customMarker.style.transform = 'scale(1.15)';
        customMarker.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
      }
    }
  });
  
  marker.on('mouseout', function(e) {
    const markerElement = e.target.getElement();
    if (markerElement) {
      const customMarker = markerElement.querySelector('.standalone-custom-marker');
      if (customMarker && !marker.isPopupOpen()) {
        customMarker.style.transform = 'scale(1)';
        customMarker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      }
    }
  });
  
  marker.on('popupopen', function(e) {
    const markerElement = e.target.getElement();
    if (markerElement) {
      const customMarker = markerElement.querySelector('.standalone-custom-marker');
      if (customMarker) {
        customMarker.classList.add('active');
      }
    }
  });
  
  marker.on('popupclose', function(e) {
    const markerElement = e.target.getElement();
    if (markerElement) {
      const customMarker = markerElement.querySelector('.standalone-custom-marker');
      if (customMarker) {
        customMarker.classList.remove('active');
      }
    }
  });
  
  standaloneMarkers.push(marker);
  return marker;
}

// Format price range
function formatPriceRange(minPrice, maxPrice) {
  if (minPrice && maxPrice && minPrice !== maxPrice) {
    return `$${minPrice}-$${maxPrice}`;
  } else if (maxPrice) {
    return `$${maxPrice}`;
  } else if (minPrice) {
    return `$${minPrice}`;
  }
  return 'Price on request';
}

// Show loading state
function showMapLoading(container) {
  const loading = document.createElement('div');
  loading.className = 'standalone-map-loading';
  loading.innerHTML = '<div class="standalone-map-spinner"></div>';
  container.appendChild(loading);
}

// Remove loading state
function removeMapLoading() {
  const loading = document.querySelector('.standalone-map-loading');
  if (loading) loading.remove();
}

// Show error state
function showMapError(container) {
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f5f5f5; border-radius: 16px; font-family: 'Manrope', sans-serif;">
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 18px; font-weight: 600; color: #0F2C3A; margin-bottom: 8px;">
          Unable to load map
        </div>
        <div style="font-size: 14px; color: #717171;">
          Please refresh the page to try again
        </div>
      </div>
    </div>
  `;
}

// Start when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStandaloneMap);
} else {
  initStandaloneMap();
}

})(); // End IIFE
