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

// Map configuration
const MAP_CONFIG = {
  center: [40.7178, -74.0431], // Jersey City, NJ
  zoom: 12,
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
 * Apply the current filter to the contributions
 */
function applyFilter(fitBounds = true) {
  const filterValue = document.querySelector('input[name="contributor-filter"]:checked').value;

  // Clear existing markers
  clearMarkers();

  // Filter contributions based on selection
  let filteredContributions;
  if (filterValue === 'all') {
    filteredContributions = currentContributions;
  } else if (filterValue === 'individual') {
    filteredContributions = currentContributions.filter(c => c.isIndividual);
  } else if (filterValue === 'business') {
    filteredContributions = currentContributions.filter(c => !c.isIndividual);
  }

  // Plot filtered contributions
  plotContributions(filteredContributions, fitBounds);

  // Update count
  updateContributionCount(filteredContributions.length);
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
 * Add a marker to the map for a contribution
 */
function addMarker(contribution, coords) {
  const isIndividual = contribution.isIndividual;
  const markerStyle = isIndividual ? MARKER_STYLES.individual : MARKER_STYLES.business;

  // Create custom icon
  const icon = L.divIcon({
    className: markerStyle.className,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6]
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

  return `
    <div>
      <strong>${contribution.name}</strong><br>
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
