# Campaign Contributions Map

An interactive web application that visualizes campaign contribution data on a map using Google Maps Geocoding API, OpenStreetMap tiles, and Leaflet.js.

![Campaign Contributions Map](https://img.shields.io/badge/status-active-success)
![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)

## Features

- 🗺️ **Interactive Map** - Powered by Leaflet.js with CartoDB Positron tiles for a clean, minimal look
- 🎯 **Multi-Candidate Support** - Easy switching between different campaigns via dropdown selector
- 🔵🔴 **Visual Distinction** - Different marker colors for individual (blue) vs business (red) contributions
- 📏 **Area-Proportional Sizing** - Toggle between fixed-size markers and area-proportional sizing to visualize contribution amounts
- 🎨 **Drawing Tools** - Draw rectangles and polygons to filter contributions by geographic area
- 🔍 **Smart Filtering** - Filter by contributor type (All/Individual/Business)
- 🚀 **Pre-Geocoded Data** - Server-side geocoding with Google Maps API for instant map loads
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- 🏗️ **Well-Documented Code** - Comprehensive comments and documentation for easy extension

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Data Workflow](#data-workflow)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Technology Stack](#technology-stack)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd 2025-campaign

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your Google Maps API key

# 4. (Optional) Process and geocode your data
npm run dedupe    # Aggregate contributions by donor
npm run geocode   # Geocode all addresses

# 5. Start the server
npm start

# 6. Open in browser
open http://localhost:3000
```

## Installation

### Prerequisites

- **Node.js** >= 14.0.0
- **npm** >= 6.0.0
- **Google Maps API Key** (for geocoding)

### Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**

   Create a `.env` file in the project root:
   ```bash
   GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

   Get a Google Maps API key:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Geocoding API
   - Create an API key

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Access the application:**

   Open your browser to `http://localhost:3000`

## Project Structure

```
2025-campaign/
├── server.js              # Express server with API endpoints
├── geocode-data.js        # Pre-geocoding script for batch processing
├── dedupe-data.js         # Data deduplication script
├── package.json           # Project dependencies and scripts
├── .env                   # Environment variables (not in git)
├── .env.example           # Example environment variables
├── geocode-cache.json     # Cached geocoding results
├── data/                  # Processed CSV files (deduplicated)
│   ├── solomon.csv
│   ├── freeman.csv
│   ├── watterman.csv
│   ├── odea.csv
│   ├── mc_greevey.csv
│   └── ali.csv
├── raw/                   # Raw CSV files (original data)
│   └── *.csv
└── public/                # Static frontend files
    ├── index.html         # Main HTML page
    ├── styles.css         # Styling for fullscreen map layout
    └── app.js             # Client-side JavaScript for map functionality
```

## Data Workflow

### 1. Adding Raw Data

Place raw CSV files in the `raw/` directory. Each CSV should have these columns:

**Required Columns:**
- `IsIndividual` - "Y" or "N"
- `FirstName`, `MI`, `LastName`, `Suffix` - For individual contributors
- `NonIndName` - For business contributors
- `Street`, `City`, `State`, `ZIP` - Address information
- `ContributionAmount` - Numeric amount
- `ContributionDate` - Date of contribution
- `ContributorType` - Type of contributor

### 2. Deduplicating Data

Aggregate contributions by donor:

```bash
npm run dedupe
```

This script:
- Combines multiple contributions from the same donor
- Sums contribution amounts
- Outputs deduplicated CSV files to `data/` directory

### 3. Geocoding Addresses

Pre-geocode all addresses using Google Maps API:

```bash
npm run geocode
```

This script:
- Reads all CSV files from `data/` directory
- Geocodes each unique address using Google Maps API
- Handles PO Boxes (geocodes to city/state level)
- Cleans addresses (removes apartment numbers, building names, etc.)
- Caches results to `geocode-cache.json`
- Processes ~20 addresses/second (respects API rate limits)

**Address Cleaning Features:**
- Removes apartment designators (APT, UNIT, STE, etc.)
- Strips building names (e.g., "CAST IRON LOFTS II")
- Handles PO Boxes by geocoding city/state only
- Fallback extraction for complex addresses

### 4. Adding a New Candidate

After preparing the data, add the candidate to `server.js`:

```javascript
const CANDIDATES = [
  // ... existing candidates ...
  {
    id: 'new-candidate',           // Unique identifier (lowercase, no spaces)
    name: 'New Candidate Name',    // Display name
    csvFile: 'new_candidate.csv'   // Filename in data/ directory
  }
];
```

Also update `geocode-data.js` to include the new CSV file:

```javascript
const CANDIDATES = [
  // ... existing candidates ...
  { csvFile: 'new_candidate.csv' }
];
```

Then run:
```bash
npm run geocode  # Geocode the new candidate's addresses
npm start        # Start the server
```

## Configuration

### Environment Variables

Create a `.env` file with:

```bash
# Google Maps API Key (required for geocoding)
GOOGLE_MAPS_API_KEY=your_api_key_here

# Server Port (optional, defaults to 3000)
PORT=3000
```

### Map Configuration

Edit `public/app.js` to customize map settings:

```javascript
const MAP_CONFIG = {
  center: [40.7178, -74.0431],  // Default center (Jersey City, NJ)
  zoom: 14,                      // Default zoom level
  maxZoom: 18,
  minZoom: 2
};
```

### Marker Sizing

Edit `public/app.js` to adjust area-proportional sizing:

```javascript
function calculateMarkerSize(amount) {
  const minSize = 4;      // Minimum radius in pixels
  const maxSize = 24;     // Maximum radius in pixels
  const minAmount = 50;   // Contributions below this get min size
  const maxAmount = 5000; // Contributions above this get max size
  // ...
}
```

## API Endpoints

### GET /api/candidates

Returns a list of all available candidates.

**Response:**
```json
[
  {
    "id": "solomon",
    "name": "James Solomon"
  },
  {
    "id": "mcgreevey",
    "name": "Jim McGreevey"
  }
]
```

### GET /api/contributions/:candidateId

Returns geocoded contribution data for a specific candidate.

**Parameters:**
- `candidateId` - The unique identifier for the candidate

**Response:**
```json
{
  "candidate": "James Solomon",
  "totalContributions": 1523,
  "contributions": [
    {
      "isIndividual": true,
      "name": "John Doe",
      "address": "123 MAIN ST",
      "city": "JERSEY CITY",
      "state": "NJ",
      "zip": "07302",
      "lat": 40.7178,
      "lng": -74.0431,
      "amount": 500,
      "date": "12/16/24",
      "contributorType": "INDIVIDUAL"
    }
  ]
}
```

## Technology Stack

### Backend
- **Express.js** - Web framework for Node.js
- **csv-parser** - Streaming CSV parser
- **node-fetch** - HTTP client for API requests
- **dotenv** - Environment variable management

### Frontend
- **Leaflet.js** - Interactive map library
- **Leaflet.draw** - Drawing tools plugin
- **CartoDB Positron** - Minimal map tiles
- **Vanilla JavaScript** - No frameworks, just plain JS
- **CSS3** - Modern styling with flexbox

### APIs & Services
- **Google Maps Geocoding API** - Address to coordinates conversion
- **OpenStreetMap** - Map tiles via CartoDB

## Development

### NPM Scripts

```bash
# Start the development server
npm start

# Deduplicate raw data
npm run dedupe

# Geocode addresses (requires Google API key)
npm run geocode
```

### Key Files to Know

- **`server.js`** - Main server file, API endpoints, geocoding logic
- **`public/app.js`** - Frontend map logic, marker rendering, filtering
- **`geocode-data.js`** - Batch geocoding script
- **`dedupe-data.js`** - Data aggregation script

### Adding Features

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

**Common Extensions:**
1. Add new filter options (date range, amount range)
2. Add data export functionality
3. Add analytics/statistics views
4. Add marker clustering for performance
5. Add heatmap visualization option

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

ISC

## Support

For questions or issues:
1. Check existing [Issues](https://github.com/zalepa/jersey-city-2025-election-map/issues)
2. Open a new issue with detailed information
3. Include steps to reproduce any bugs

---

Built with ❤️ for transparent campaign finance visualization
