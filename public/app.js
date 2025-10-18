/**
 * Campaign Contributions Map Application
 *
 * This script handles:
 * - Map initialization using Leaflet and OpenStreetMap
 * - Loading candidate data from the API
 * - Plotting contribution markers on the map (using server-side geocoded coordinates)
 * - Displaying contribution details in popups
 *
 * To extend:
 * - Add filters for contribution amounts, dates, etc.
 * - Add clustering for better performance with many markers
 * - Add heatmap visualization option
 * - Add data export functionality
 */

// Global variables
let map;
let markersLayer;
let currentContributions = []; // Store current contributions for filtering
let drawnItems; // Layer group for drawn shapes
let currentShape = null; // Currently active drawn shape
let showContributorNames = false; // Hidden by default, type "streets" to enable
let keySequence = ''; // Buffer for detecting "streets" keyword

// Map configuration
const MAP_CONFIG = {
  center: [40.7178, -74.0431], // Jersey City, NJ
  zoom: 14,
  maxZoom: 18,
  minZoom: 2  // Allow zooming out to world view
};

// Marker styles configuration
const MARKER_STYLES = {
  individual: {
    className: 'individual-marker',
    color: '#3498db'
  },
  business: {
    className: 'business-marker',
    color: '#e74c3c'
  }
};

/**
 * Initialize the map when the page loads
 */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadCandidates();
  setupEventListeners();
});

/**
 * Initialize the Leaflet map with OpenStreetMap tiles
 */
function initMap() {
  // Create map instance
  map = L.map('map').setView(MAP_CONFIG.center, MAP_CONFIG.zoom);

  // Add CartoDB Positron tile layer (minimal, clean, just streets)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: MAP_CONFIG.maxZoom,
    minZoom: MAP_CONFIG.minZoom,
    subdomains: 'abcd'
  }).addTo(map);

  // Create a layer group for markers (allows easy clearing)
  markersLayer = L.layerGroup().addTo(map);

  // Create a layer group for drawn shapes
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  // Initialize drawing controls
  const drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      polygon: {
        allowIntersection: false,
        shapeOptions: {
          color: '#e74c3c',
          weight: 2
        }
      },
      rectangle: {
        shapeOptions: {
          color: '#e74c3c',
          weight: 2
        }
      },
      circle: false,
      circlemarker: false,
      marker: false,
      polyline: false
    },
    edit: {
      featureGroup: drawnItems,
      remove: true
    }
  });
  map.addControl(drawControl);

  // Handle shape creation
  map.on(L.Draw.Event.CREATED, function(event) {
    const layer = event.layer;

    // Remove previous shape if exists
    if (currentShape) {
      drawnItems.removeLayer(currentShape);
    }

    // Add new shape
    drawnItems.addLayer(layer);
    currentShape = layer;

    // Re-apply filter with the new shape
    applyFilter(false);
  });

  // Handle shape deletion
  map.on(L.Draw.Event.DELETED, function() {
    currentShape = null;
    // Re-apply filter without shape restriction
    applyFilter(false);
  });
}

/**
 * Set up event listeners for user interactions
 */
function setupEventListeners() {
  const candidateSelect = document.getElementById('candidate-select');
  candidateSelect.addEventListener('change', handleCandidateChange);

  // Add filter listeners
  const filterRadios = document.querySelectorAll('input[name="contributor-filter"]');
  filterRadios.forEach(radio => {
    radio.addEventListener('change', handleFilterChange);
  });

  // Add sizing listeners
  const sizingRadios = document.querySelectorAll('input[name="marker-sizing"]');
  sizingRadios.forEach(radio => {
    radio.addEventListener('change', handleSizingChange);
  });

  // Add keyboard listener for "streets" code to show contributor names
  document.addEventListener('keypress', handleKeyPress);
}

/**
 * Load available candidates from the API
 */
async function loadCandidates() {
  try {
    const response = await fetch('/api/candidates');
    const candidates = await response.json();

    const select = document.getElementById('candidate-select');
    select.innerHTML = '<option value="">Select a candidate...</option>';

    candidates.forEach(candidate => {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.name;
      select.appendChild(option);
    });

    select.disabled = false;
  } catch (error) {
    console.error('Error loading candidates:', error);
    alert('Failed to load candidates. Please refresh the page.');
  }
}

/**
 * Handle candidate selection change
 */
async function handleCandidateChange(event) {
  const candidateId = event.target.value;

  if (!candidateId) {
    currentContributions = [];
    clearMarkers();
    updateContributionCount(0);
    return;
  }

  await loadContributions(candidateId);
}

/**
 * Load contributions for a specific candidate
 */
async function loadContributions(candidateId) {
  try {
    // Show loading state
    const select = document.getElementById('candidate-select');
    select.disabled = true;
    updateContributionCount('Loading...');

    const response = await fetch(`/api/contributions/${candidateId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Store contributions for filtering
    currentContributions = data.contributions;

    // Clear existing markers
    clearMarkers();

    // Plot contributions on map (coordinates already geocoded server-side)
    // Apply current filter without re-zooming
    applyFilter(false);

    select.disabled = false;

  } catch (error) {
    console.error('Error loading contributions:', error);
    alert('Failed to load contributions. Please try again.');
    document.getElementById('candidate-select').disabled = false;
  }
}

/**
 * Handle filter change
 */
function handleFilterChange() {
  applyFilter(false); // Don't re-zoom when filtering
}

/**
 * Handle sizing change
 */
function handleSizingChange() {
  applyFilter(false); // Redraw markers with new sizing, don't re-zoom
}

/**
 * Handle keyboard input to detect "streets" code
 */
function handleKeyPress(event) {
  // Ignore if typing in an input field
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
    return;
  }

  // Add character to sequence buffer
  keySequence += event.key.toLowerCase();

  // Keep only last 7 characters (length of "streets")
  if (keySequence.length > 7) {
    keySequence = keySequence.slice(-7);
  }

  // Check if "streets" was typed
  if (keySequence === 'streets') {
    if (!showContributorNames) {
      showContributorNames = true;
      console.log('Contributor names enabled');

      // Show brief notification
      showNotification('Contributor names enabled');

      // Redraw all markers with names shown
      applyFilter(false);
    }

    // Reset sequence
    keySequence = '';
  }
}

/**
 * Show a temporary notification to the user
 */
function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: #3498db;
    color: white;
    padding: 1rem 2rem;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-size: 0.9rem;
    font-weight: 500;
  `;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

/**
 * Apply the current filter to the contributions
 */
function applyFilter(fitBounds = true) {
  const filterValue = document.querySelector('input[name="contributor-filter"]:checked').value;

  // Clear existing markers
  clearMarkers();

  // Filter contributions based on type selection
  let filteredContributions;
  if (filterValue === 'all') {
    filteredContributions = currentContributions;
  } else if (filterValue === 'individual') {
    filteredContributions = currentContributions.filter(c => c.isIndividual);
  } else if (filterValue === 'business') {
    filteredContributions = currentContributions.filter(c => !c.isIndividual);
  }

  // Further filter by geographic shape if one is drawn
  if (currentShape) {
    filteredContributions = filteredContributions.filter(contribution => {
      const point = L.latLng(contribution.lat, contribution.lng);

      // Check if point is within the shape
      if (currentShape instanceof L.Rectangle || currentShape instanceof L.Polygon) {
        return isPointInShape(point, currentShape);
      }

      return true;
    });
  }

  // Plot filtered contributions
  plotContributions(filteredContributions, fitBounds);

  // Update count
  updateContributionCount(filteredContributions.length);
}

/**
 * Check if a point is inside a polygon or rectangle
 */
function isPointInShape(point, shape) {
  // For rectangles and polygons, use Leaflet's built-in bounds checking
  if (shape instanceof L.Rectangle) {
    return shape.getBounds().contains(point);
  } else if (shape instanceof L.Polygon) {
    // Use ray casting algorithm for polygon containment
    const latlngs = shape.getLatLngs()[0]; // Get first ring of polygon
    let inside = false;

    for (let i = 0, j = latlngs.length - 1; i < latlngs.length; j = i++) {
      const xi = latlngs[i].lat, yi = latlngs[i].lng;
      const xj = latlngs[j].lat, yj = latlngs[j].lng;

      const intersect = ((yi > point.lng) !== (yj > point.lng))
          && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  return false;
}

/**
 * Plot contribution markers on the map
 *
 * Contributions arrive with pre-geocoded coordinates from the server,
 * so plotting is instant - no client-side geocoding needed.
 */
function plotContributions(contributions, fitBounds = true) {
  // Plot all markers
  contributions.forEach(contribution => {
    // Coordinates are already provided by the server
    const coords = {
      lat: contribution.lat,
      lng: contribution.lng
    };

    addMarker(contribution, coords);
  });

  // Fit map bounds to show all markers (only when requested)
  if (fitBounds && markersLayer.getLayers().length > 0) {
    try {
      const bounds = markersLayer.getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
    } catch (error) {
      console.log('Could not fit map bounds, using default view');
      // If fitBounds fails, just center on Jersey City
      map.setView(MAP_CONFIG.center, MAP_CONFIG.zoom);
    }
  }
}

/**
 * Calculate marker size based on contribution amount and sizing mode
 */
function calculateMarkerSize(amount) {
  const sizingMode = document.querySelector('input[name="marker-sizing"]:checked').value;

  if (sizingMode === 'fixed') {
    return 12; // Fixed size in pixels
  }

  // Area-proportional sizing
  // For area to be proportional to amount, radius must be proportional to sqrt(amount)
  // This ensures that a 2x larger contribution has 2x the area, not 4x

  const minSize = 4;   // Minimum radius in pixels
  const maxSize = 24;  // Maximum radius in pixels
  const minAmount = 50;   // Contributions below this get min size
  const maxAmount = 5000; // Contributions above this get max size

  // Clamp amount to range
  const clampedAmount = Math.max(minAmount, Math.min(maxAmount, amount));

  // Calculate size using square root for area proportionality
  // Normalize to 0-1 range, then apply sqrt, then scale to pixel range
  const normalized = (clampedAmount - minAmount) / (maxAmount - minAmount);
  const size = minSize + Math.sqrt(normalized) * (maxSize - minSize);

  return Math.round(size);
}

/**
 * Add a marker to the map for a contribution
 */
function addMarker(contribution, coords) {
  const isIndividual = contribution.isIndividual;
  const markerStyle = isIndividual ? MARKER_STYLES.individual : MARKER_STYLES.business;

  // Calculate marker size based on contribution amount
  const size = calculateMarkerSize(contribution.amount);

  // Create custom icon
  const icon = L.divIcon({
    className: markerStyle.className,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });

  // Create marker
  const marker = L.marker([coords.lat, coords.lng], { icon });

  // Create popup content
  const popupContent = createPopupContent(contribution);
  marker.bindPopup(popupContent);

  // Add to markers layer
  marker.addTo(markersLayer);
}

/**
 * Create HTML content for a marker popup
 */
function createPopupContent(contribution) {
  const type = contribution.isIndividual ? 'Individual' : 'Business';
  const amount = formatCurrency(contribution.amount);

  // Only show name if "streets" code has been entered
  const nameHtml = showContributorNames
    ? `<strong>${contribution.name}</strong><br>`
    : '';

  return `
    <div>
      ${nameHtml}
      <em>${type} Contribution</em><br>
      <strong>Amount:</strong> ${amount}<br>
      <strong>Date:</strong> ${contribution.date}<br>
      <strong>Location:</strong> ${contribution.city}, ${contribution.state}
    </div>
  `;
}

/**
 * Format a number as currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Clear all markers from the map
 */
function clearMarkers() {
  markersLayer.clearLayers();
}

/**
 * Update the contribution count display
 */
function updateContributionCount(count) {
  const countElement = document.getElementById('contribution-count');

  if (count === 0 || count === '') {
    countElement.textContent = '';
  } else if (typeof count === 'number') {
    countElement.textContent = `${count} contribution${count !== 1 ? 's' : ''} plotted`;
  } else {
    countElement.textContent = count;
  }
}
