# Architecture Documentation

This document provides a detailed technical overview of the Campaign Contributions Map application.

## Table of Contents

- [System Overview](#system-overview)
- [Data Flow](#data-flow)
- [Geocoding Strategy](#geocoding-strategy)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Performance Considerations](#performance-considerations)
- [Security Considerations](#security-considerations)

## System Overview

The Campaign Contributions Map is a full-stack JavaScript application that visualizes campaign finance data on an interactive map.

### Technology Stack

```
Frontend:
├── Leaflet.js 1.9.4        # Map rendering
├── Leaflet.draw 1.0.4      # Drawing tools
├── Vanilla JavaScript       # No frameworks
└── CSS3                     # Styling

Backend:
├── Node.js 14+             # Runtime
├── Express.js 5.1.0        # Web server
├── csv-parser 3.2.0        # CSV parsing
├── node-fetch 2.7.0        # HTTP client
└── dotenv                  # Config management

External APIs:
├── Google Maps Geocoding API  # Address → Coordinates
└── CartoDB (OpenStreetMap)    # Map tiles
```

## Data Flow

### Complete Data Pipeline

```
┌────────────────────────────────────────────────────────────────┐
│                         RAW DATA IMPORT                         │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  raw/*.csv                                                     │
│  - Original contribution reports from campaign finance system  │
│  - Multiple contributions per donor                            │
│  - Contains all transaction history                            │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ dedupe-data.js  │
                    └─────────────────┘
                              │
                   Aggregation Logic:
                   • Group by: Name + Address
                   • Sum: Contribution amounts
                   • Keep: First date
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  data/*.csv                                                    │
│  - Deduplicated contributions                                  │
│  - One row per unique donor                                    │
│  - Total amount contributed                                    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │ geocode-data.js  │
                   └──────────────────┘
                              │
                  Geocoding Pipeline:
                  1. Extract unique addresses
                  2. Clean address strings
                  3. Call Google Maps API
                  4. Apply fallback strategies
                  5. Cache all results
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  geocode-cache.json                                            │
│  {                                                             │
│    "123 MAIN ST, CITY, STATE, ZIP": {                         │
│      "lat": 40.7178,                                           │
│      "lng": -74.0431                                           │
│    }                                                           │
│  }                                                             │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                       RUNTIME (server.js)                       │
└────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
    ┌─────────────┐                    ┌─────────────┐
    │ Load Cache  │                    │  Load CSVs  │
    └─────────────┘                    └─────────────┘
            │                                   │
            └─────────────────┬─────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   Merge Data     │
                    │ CSV + Coordinates│
                    └──────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      API ENDPOINT                              │
│  GET /api/contributions/:candidateId                           │
│                                                                │
│  Returns: Enriched contribution data with lat/lng              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │   Frontend      │
                     │ (public/app.js) │
                     └─────────────────┘
                              │
                    Rendering Pipeline:
                    1. Fetch contributions
                    2. Apply filters
                    3. Calculate marker sizes
                    4. Render on Leaflet map
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                     INTERACTIVE MAP                             │
│  - Pan/zoom                                                    │
│  - Click markers for details                                   │
│  - Draw shapes to filter                                       │
│  - Toggle filters and sizing                                   │
└────────────────────────────────────────────────────────────────┘
```

## Geocoding Strategy

### Multi-Stage Approach

The application uses a sophisticated geocoding strategy with multiple fallback mechanisms to maximize successful address resolution.

#### Stage 1: Cache Lookup

```javascript
// Check if address already geocoded
if (geocodeCache.hasOwnProperty(originalFullAddress)) {
  return geocodeCache[originalFullAddress];
}
```

**Benefits:**
- Instant lookup (O(1))
- No API calls
- Consistent results across sessions

#### Stage 2: Address Cleaning

```javascript
function cleanStreetAddress(address) {
  // Remove apartment numbers: "APT 123", "UNIT 4B", etc.
  // Remove building names: "CAST IRON LOFTS II"
  // Remove floor designators: "FL 3", "FLOOR 5"
  // ... etc
  return cleanedAddress;
}
```

**Patterns Removed:**
- Apartment designators: `APT`, `APARTMENT`, `UNIT`, `STE`, `SUITE`
- Floor indicators: `FL`, `FLOOR`
- Building names: Complex regex for loft/tower/plaza names
- Hash symbols: `#123`, `# 4B`

**Example Transformations:**
```
Input:  "217 NEWARK AVE APT 515"
Output: "217 NEWARK AVE"

Input:  "300 COLES STREET CAST IRON LOFTS II APT 614"
Output: "300 COLES STREET"
```

#### Stage 3: PO Box Handling

```javascript
const isPOBox = address && /^PO\s+BOX/i.test(address.trim());

if (isPOBox) {
  // Geocode city/state only, ignore PO Box number
  addressToGeocode = [city, state, zip].filter(Boolean).join(', ');
}
```

**Rationale:**
- PO Boxes don't have geographic coordinates
- City/state gives approximate location
- Better than failing to geocode entirely

#### Stage 4: Google Maps API Call

```javascript
const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;
const response = await fetch(url);
const data = await response.json();

if (data.status === 'OK' && data.results && data.results.length > 0) {
  const coords = {
    lat: data.results[0].geometry.location.lat,
    lng: data.results[0].geometry.location.lng
  };
  // Cache and return
}
```

#### Stage 5: Fallback Core Extraction

If the cleaned address fails, extract just the core street address:

```javascript
function extractCoreStreetAddress(address) {
  const parts = address.split(/\s+/);
  const streetTypes = ['STREET', 'ST', 'AVENUE', 'AVE', 'ROAD', 'RD', ...];

  // Find last street type keyword
  let lastStreetTypeIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (streetTypes.includes(parts[i].toUpperCase())) {
      lastStreetTypeIndex = i;
      break;
    }
  }

  // Return everything up to and including street type
  if (lastStreetTypeIndex >= 0) {
    return parts.slice(0, lastStreetTypeIndex + 1).join(' ');
  }
}
```

**Example:**
```
Input:  "70 CHRISTOPHER COLUMBUS DR PH 6"
Parts:  ["70", "CHRISTOPHER", "COLUMBUS", "DR", "PH", "6"]
Found:  "DR" at index 3
Output: "70 CHRISTOPHER COLUMBUS DR"
```

### Geocoding Performance

**Batch Script Performance:**
- **Rate:** ~20 requests/second
- **Delay:** 50ms between requests
- **Limit:** 50 req/sec (Google allows 50 req/sec by default)
- **Cost:** $5 per 1,000 requests (beyond $200/month free tier)

**Success Rates:**
- Stage 1 (Cache): 100% (if cached)
- Stage 3 (Cleaned): ~85-90%
- Stage 5 (Fallback): ~5-10% additional
- Total: ~95-98% success rate

## Frontend Architecture

### Component Hierarchy

```
index.html
├── Header
│   ├── Title
│   └── Controls
│       ├── Candidate Selector
│       ├── Contributor Filter (All/Individual/Business)
│       ├── Marker Sizing (Fixed/Area Proportional)
│       └── Contribution Count
├── Map Container (Leaflet)
│   ├── Base Layer (CartoDB Positron tiles)
│   ├── Markers Layer (Contribution points)
│   └── Draw Layer (User-drawn shapes)
└── Footer
    └── Legend
```

### State Management

All state is managed in global variables in `app.js`:

```javascript
// Core state
let map;                    // Leaflet map instance
let markersLayer;           // Layer containing all markers
let currentContributions;   // Current dataset
let drawnItems;             // Layer for drawn shapes
let currentShape;           // Active drawn shape

// Configuration
const MAP_CONFIG = { /* ... */ };
const MARKER_STYLES = { /* ... */ };
```

### Event Flow

```
User Action
    │
    ├─ Select Candidate ────────────────────┐
    │                                       │
    ├─ Toggle Filter ───────────────────────┤
    │                                       │
    ├─ Toggle Sizing ───────────────────────┤
    │                                       │
    ├─ Draw Shape ──────────────────────────┤
    │                                       │
    └─ Delete Shape ────────────────────────┤
                                            │
                                            ▼
                                   applyFilter(fitBounds)
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
            Filter by Type          Filter by Shape        Calculate Sizes
                    │                       │                       │
                    └───────────────────────┼───────────────────────┘
                                            │
                                            ▼
                                  clearMarkers()
                                            │
                                            ▼
                                  plotContributions()
                                            │
                                            ▼
                              For each contribution: addMarker()
                                            │
                                            ▼
                                   Render on Leaflet map
```

### Marker Rendering

#### Fixed Size Mode
```javascript
const size = 12; // All markers are 12px
```

#### Area-Proportional Mode
```javascript
function calculateMarkerSize(amount) {
  const minSize = 4;      // 4px radius
  const maxSize = 24;     // 24px radius
  const minAmount = 50;   // $50
  const maxAmount = 5000; // $5,000

  const clampedAmount = Math.max(minAmount, Math.min(maxAmount, amount));
  const normalized = (clampedAmount - minAmount) / (maxAmount - minAmount);

  // Square root for area proportionality
  const size = minSize + Math.sqrt(normalized) * (maxSize - minSize);

  return Math.round(size);
}
```

**Math Explanation:**

For area to be proportional to amount:
- Area = π × radius²
- If amount doubles, area should double
- If area doubles, radius increases by √2 ≈ 1.41
- Therefore: radius ∝ √(amount)

**Example:**
```
$100  → normalized = 0.01  → √0.01 = 0.1  → size ≈ 6px
$500  → normalized = 0.09  → √0.09 = 0.3  → size ≈ 10px
$2500 → normalized = 0.49  → √0.49 = 0.7  → size ≈ 18px
$5000 → normalized = 1.0   → √1.0  = 1.0  → size = 24px
```

## Backend Architecture

### Server Structure

```
server.js
├── Configuration
│   ├── Environment variables
│   ├── CANDIDATES array
│   └── Port setup
│
├── Geocode Cache Management
│   ├── Load from file
│   └── Save to file
│
├── Address Utilities
│   ├── cleanStreetAddress()
│   └── extractCoreStreetAddress()
│
├── Geocoding Logic
│   └── geocodeAddress() with fallbacks
│
└── API Routes
    ├── GET /api/candidates
    └── GET /api/contributions/:candidateId
```

### Request/Response Flow

```
Client Request
    │
    ▼
GET /api/contributions/solomon
    │
    ▼
┌─────────────────────────────┐
│ Find candidate in config    │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Stream CSV file             │
│ (data/solomon.csv)          │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ For each row:               │
│ 1. Parse contributor info   │
│ 2. Build address key        │
│ 3. Lookup in geocode cache  │
│ 4. Build contribution object│
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Filter: Only with coords    │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Return JSON response        │
│ {                           │
│   candidate: "...",         │
│   totalContributions: N,    │
│   contributions: [...]      │
│ }                           │
└─────────────────────────────┘
    │
    ▼
Client receives data
```

## Performance Considerations

### Caching Strategy

**Server-Side:**
- Geocode cache loaded once at startup
- Kept in memory for duration of server runtime
- Saved to disk only when modified
- ~415KB file size for 5,000+ addresses

**Client-Side:**
- Browser caches static assets (HTML/CSS/JS)
- Map tiles cached by Leaflet
- No client-side geocoding (all pre-computed)

### Optimization Techniques

**1. Pre-Geocoding**
- All addresses geocoded before deployment
- Eliminates runtime API calls
- Instant map rendering

**2. Efficient CSV Streaming**
- Uses `csv-parser` for streaming
- Processes row-by-row (low memory)
- No need to load entire file

**3. Marker Rendering**
- Leaflet handles efficient canvas rendering
- ~2,000 markers render smoothly
- Drawing tools don't re-render all markers

**4. Filtered Rendering**
- Only geocoded contributions rendered
- Geographic shape filtering done client-side
- Minimal DOM manipulation

### Scalability

**Current Limits:**
- Candidates: ~10-20 (dropdown stays manageable)
- Contributions per candidate: ~5,000 (tested)
- Total markers on screen: ~2,000 (smooth performance)

**If scaling needed:**
- Add marker clustering (Leaflet.markercluster)
- Implement server-side filtering
- Add pagination for large datasets
- Consider tile-based heatmaps

## Security Considerations

### API Key Protection

**Environment Variables:**
```bash
# .env file (git-ignored)
GOOGLE_MAPS_API_KEY=***
```

**Server-Side Only:**
- API key never exposed to client
- All geocoding happens server-side or in batch script
- No client-side API calls

### Input Validation

**CSV Parsing:**
- Validates required fields exist
- Sanitizes string inputs
- Handles missing/malformed data gracefully

**API Endpoints:**
- Validates candidate IDs
- Checks file existence
- Returns 404 for invalid requests

### Rate Limiting

**Google API:**
- 50 requests/second max (enforced by 50ms delay)
- Free tier: $200/month credit
- ~40,000 free geocodes/month

**No User Rate Limiting:**
- Static website, pre-geocoded data
- No user-generated geocoding requests
- DOS risk minimal (static assets)

### Data Privacy

**Public Data Only:**
- Campaign contributions are public record
- No personal identifiable information beyond public filings
- Addresses are public (on official reports)

---

## Maintenance

### Regular Tasks

1. **Update geocode cache** when new data added
2. **Monitor Google API usage** (check console monthly)
3. **Clear old candidates** if no longer relevant
4. **Update dependencies** (security patches)

### Troubleshooting

**Geocoding failures:**
```bash
# Check failed addresses in console
npm run geocode | grep "FAILED TO GEOCODE"

# Manual investigation
# Look up address in geocode-cache.json
# Try address directly in Google Maps
```

**Map not loading:**
- Check browser console for errors
- Verify API endpoint returns data
- Check network tab for failed requests

---

For questions about this architecture, see [CONTRIBUTING.md](CONTRIBUTING.md)
