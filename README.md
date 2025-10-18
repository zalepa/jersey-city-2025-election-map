# Campaign Contributions Map

A simple ExpressJS application that visualizes campaign contribution data on an interactive map using OpenStreetMap and Leaflet.js.

## Features

- Interactive map with OpenStreetMap tiles (no API key required)
- Candidate selector to switch between different campaigns
- Different marker colors for individual vs business contributions
- Detailed popups showing contributor information
- Fullscreen map with small header and footer
- Responsive design
- Well-documented code for easy extension

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
2025-campaign/
├── server.js           # Express server with API endpoints
├── public/             # Static files
│   ├── index.html      # Main HTML page
│   ├── styles.css      # Styling for fullscreen map layout
│   └── app.js          # Client-side JavaScript for map functionality
├── solomon.csv         # James Solomon contribution data
├── mc_greevey.csv      # Jim McGreevey contribution data
└── package.json        # Project dependencies
```

## How to Add a New Candidate

Adding a new candidate is straightforward:

### Step 1: Add the CSV File

Place the new candidate's CSV file in the root directory. The CSV should have the following columns:
- `IsIndividual` (Y/N)
- `FirstName`, `MI`, `LastName`, `Suffix` (for individuals)
- `NonIndName` (for businesses)
- `Street`, `City`, `State`, `ZIP`
- `ContributionAmount`
- `ContributionDate`
- `ContributorType`

### Step 2: Update Server Configuration

In `server.js`, add the candidate to the `CANDIDATES` array (around line 26):

```javascript
const CANDIDATES = [
  {
    id: 'solomon',
    name: 'James Solomon',
    csvFile: 'solomon.csv'
  },
  {
    id: 'mcgreevey',
    name: 'Jim McGreevey',
    csvFile: 'mc_greevey.csv'
  },
  // Add your new candidate here:
  {
    id: 'new-candidate',      // Unique identifier (lowercase, no spaces)
    name: 'New Candidate',    // Display name
    csvFile: 'newcandidate.csv'  // CSV file name
  }
];
```

### Step 3: Restart the Server

```bash
npm start
```

The new candidate will automatically appear in the selector dropdown!

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
Returns contribution data for a specific candidate.

**Response:**
```json
{
  "candidate": "James Solomon",
  "totalContributions": 2178,
  "contributions": [
    {
      "isIndividual": false,
      "name": "PAVONIA PHARMACY",
      "address": "600 PAVONIA AVE",
      "city": "JERSEY CITY",
      "state": "NJ",
      "zip": "07306-2929",
      "amount": 500,
      "date": "12/16/24",
      "contributorType": "BUSINESS/CORP"
    }
  ]
}
```

## Technology Stack

- **Backend:** Express.js (Node.js web framework)
- **CSV Parsing:** csv-parser
- **Frontend:** Vanilla JavaScript (no frameworks)
- **Styling:** Vanilla CSS
- **Map:** Leaflet.js with OpenStreetMap tiles
- **Geocoding:** Nominatim (OpenStreetMap's free geocoding service)

## Key Features Explained

### Marker Colors
- **Blue markers:** Individual contributions
- **Red markers:** Business/corporate contributions

### Geocoding
Addresses are geocoded client-side using Nominatim. The app:
- Processes contributions in batches to respect rate limits
- Caches geocoded addresses to avoid repeated requests
- Shows progress as markers are plotted

### Map Controls
- Pan and zoom the map to explore contributions
- Click on markers to see detailed contribution information
- Use the candidate selector to switch between campaigns

## Customization Ideas

Here are some ways you can extend this application:

1. **Add Filtering:**
   - Filter by contribution amount ranges
   - Filter by date ranges
   - Filter by contributor type

2. **Add Analytics:**
   - Show total contribution amounts
   - Display contribution statistics
   - Add charts and graphs

3. **Improve Performance:**
   - Add marker clustering for better performance with many markers
   - Implement server-side geocoding and caching

4. **Additional Visualizations:**
   - Add heatmap layer option
   - Show contribution trends over time
   - Add district/ward boundaries

5. **Export Features:**
   - Export filtered data to CSV
   - Generate reports
   - Print map views

## Notes

- Geocoding is done client-side using Nominatim, which is free but rate-limited
- The app processes contributions in batches to respect rate limits
- Not all addresses may geocode successfully (some may be incomplete or invalid)
- The map is centered on Jersey City by default (can be changed in `public/app.js`)

## License

ISC
