/**
 * Campaign Contributions Mapping Server
 *
 * This Express server provides endpoints to visualize campaign contribution data.
 * The data is read from CSV files stored in the ./data directory.
 *
 * To add a new candidate:
 * 1. Add the raw CSV file to the ./raw directory
 * 2. Run `npm run dedupe` to aggregate contributions by donor
 * 3. Add the candidate configuration to the CANDIDATES array below
 * 4. Run `npm run geocode` to geocode all addresses
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Geocoding cache file path
const GEOCODE_CACHE_FILE = path.join(__dirname, 'geocode-cache.json');

// Load geocode cache or create empty cache
let geocodeCache = {};
if (fs.existsSync(GEOCODE_CACHE_FILE)) {
  try {
    geocodeCache = JSON.parse(fs.readFileSync(GEOCODE_CACHE_FILE, 'utf-8'));
    console.log(`Loaded ${Object.keys(geocodeCache).length} cached geocode results`);
  } catch (error) {
    console.error('Error loading geocode cache:', error);
  }
}

// Serve static files from the 'public' directory
app.use(express.static('public'));

/**
 * CANDIDATES Configuration
 *
 * Add new candidates here with their corresponding CSV file names.
 * Each candidate object should have:
 * - id: unique identifier (used in URLs)
 * - name: display name
 * - csvFile: name of the CSV file in the root directory
 */
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
  {
    id: 'freeman',
    name: 'Christina Freeman',
    csvFile: 'freeman.csv'
  },
  {
    id: 'odea',
    name: 'Bill O\'Dea',
    csvFile: 'odea.csv'
  },
  {
    id: 'watterman',
    name: 'Joyce Watterman',
    csvFile: 'watterman.csv'
  },
  {
    id: 'ali',
    name: 'Mussab Ali',
    csvFile: 'ali.csv'
  }
];

/**
 * Save geocode cache to disk
 */
function saveGeocodeCache() {
  try {
    fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(geocodeCache, null, 2));
  } catch (error) {
    console.error('Error saving geocode cache:', error);
  }
}

/**
 * Clean street address by removing apartment numbers, unit designators, and building names
 * that can confuse geocoding APIs.
 *
 * Examples:
 * "217 NEWARK AVE APT 515" -> "217 NEWARK AVE"
 * "300 COLES STREET CAST IRON LOFTS II APT 614" -> "300 COLES STREET"
 */
function cleanStreetAddress(address) {
  if (!address) return address;

  let cleaned = address.trim();

  // Common patterns for secondary address designators
  const patterns = [
    // Apartment variations (APT, APT., APARTMENT, etc.)
    /\s+(APT\.?|APARTMENT)\s+[A-Z0-9#\-]+.*$/i,
    // Unit variations (UNIT, UNIT#, etc.)
    /\s+(UNIT\.?|UNIT#)\s+[A-Z0-9#\-]+.*$/i,
    // Suite variations (STE, STE., SUITE, etc.)
    /\s+(STE\.?|SUITE)\s+[A-Z0-9#\-]+.*$/i,
    // Floor variations (FL, FL., FLOOR, etc.)
    /\s+(FL\.?|FLOOR)\s+[A-Z0-9#\-]+.*$/i,
    // Building or room numbers (BLDG, RM, etc.)
    /\s+(BLDG\.?|BUILDING|RM\.?|ROOM)\s+[A-Z0-9#\-]+.*$/i,
    // Hash/pound sign followed by number (common for unit numbers)
    /\s+#[A-Z0-9\-]+.*$/i,
  ];

  // Apply each pattern
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // After removing explicit designators, clean up building/complex names
  // Match building keywords that are preceded by a complete street address
  // This ensures we don't remove "STREET" or "AVENUE" which are part of the street name
  // We look for patterns after common street suffixes
  const streetSuffixPattern = /^(.*?(?:STREET|ST|AVENUE|AVE|ROAD|RD|BOULEVARD|BLVD|LANE|LN|DRIVE|DR|COURT|CT|PLACE|PL|CIRCLE|CIR|WAY|PKWY|PARKWAY))\s+(.*)$/i;
  const match = cleaned.match(streetSuffixPattern);

  if (match) {
    const streetPart = match[1];  // e.g., "300 COLES STREET"
    const remainder = match[2];    // e.g., "CAST IRON LOFTS II"

    // Check if remainder contains building keywords
    const hasBuildingKeyword = /(?:BUILDING|LOFTS?|TOWERS?|PLAZA|CENTER|CENTRE|MANOR|ESTATES?|VILLAGE|COMPLEX|HOMES|APARTMENTS?)/i.test(remainder);

    if (hasBuildingKeyword) {
      // Keep only the street part
      cleaned = streetPart;
    }
  }

  return cleaned.trim();
}

/**
 * Extract core street address by finding street type keywords
 * Examples:
 * "70 CHRISTOPHER COLUMBUS DR PH 6" -> "70 CHRISTOPHER COLUMBUS DR"
 * "29 CLAREMONT AVE # 5N" -> "29 CLAREMONT AVE"
 */
function extractCoreStreetAddress(address) {
  if (!address) return address;

  const parts = address.split(/\s+/);

  // Common street type abbreviations and full names
  const streetTypes = [
    'STREET', 'ST', 'AVENUE', 'AVE', 'ROAD', 'RD', 'BOULEVARD', 'BLVD',
    'LANE', 'LN', 'DRIVE', 'DR', 'COURT', 'CT', 'PLACE', 'PL', 'CIRCLE', 'CIR',
    'WAY', 'PARKWAY', 'PKWY', 'PLAZA', 'PLZ', 'TERRACE', 'TER', 'TRAIL', 'TRL',
    'HIGHWAY', 'HWY', 'EXPRESSWAY', 'EXPY', 'CREEK', 'PATH', 'LOOP'
  ];

  // Find the last occurrence of a street type
  let lastStreetTypeIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (streetTypes.includes(parts[i].toUpperCase())) {
      lastStreetTypeIndex = i;
      break;
    }
  }

  // If we found a street type, take everything up to and including it
  if (lastStreetTypeIndex >= 0) {
    return parts.slice(0, lastStreetTypeIndex + 1).join(' ');
  }

  return address;
}

/**
 * Geocode an address using Nominatim
 * Results are cached to avoid repeated API calls
 */
async function geocodeAddress(address, city, state, zip) {
  // Check cache using original address first
  const originalAddressParts = [address, city, state, zip].filter(Boolean);
  const originalFullAddress = originalAddressParts.join(', ');

  if (geocodeCache[originalFullAddress]) {
    return geocodeCache[originalFullAddress];
  }

  // Handle PO BOX addresses - just geocode city/state
  const isPOBox = address && /^PO\s+BOX/i.test(address.trim());

  let addressToGeocode;
  if (isPOBox) {
    // For PO Boxes, only use city, state, zip
    addressToGeocode = [city, state, zip].filter(Boolean).join(', ');
  } else {
    // Clean the street address before geocoding
    const cleanedAddress = cleanStreetAddress(address);
    addressToGeocode = [cleanedAddress, city, state, zip].filter(Boolean).join(', ');
  }

  // Check cache with cleaned/processed address
  if (geocodeCache[addressToGeocode]) {
    geocodeCache[originalFullAddress] = geocodeCache[addressToGeocode];
    saveGeocodeCache();
    return geocodeCache[addressToGeocode];
  }

  // First attempt: try with cleaned address
  try {
    const query = encodeURIComponent(addressToGeocode);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CampaignContributionsMap/1.0'
      }
    });

    const results = await response.json();

    if (results && results.length > 0) {
      const coords = {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon)
      };
      geocodeCache[addressToGeocode] = coords;
      geocodeCache[originalFullAddress] = coords;
      saveGeocodeCache();
      return coords;
    }
  } catch (error) {
    console.error('Geocoding error for:', addressToGeocode, error.message);
  }

  // Second attempt: if not a PO Box and first attempt failed, try extracting core address
  if (!isPOBox && address) {
    const coreAddress = extractCoreStreetAddress(address);

    // Only try if we actually extracted something different
    if (coreAddress !== address && coreAddress !== cleanStreetAddress(address)) {
      const fallbackAddressToGeocode = [coreAddress, city, state, zip].filter(Boolean).join(', ');

      try {
        const query = encodeURIComponent(fallbackAddressToGeocode);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'CampaignContributionsMap/1.0'
          }
        });

        const results = await response.json();

        if (results && results.length > 0) {
          const coords = {
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon)
          };
          console.log(`  ✓ Fallback succeeded: "${originalFullAddress}" -> "${fallbackAddressToGeocode}"`);
          geocodeCache[addressToGeocode] = coords;
          geocodeCache[fallbackAddressToGeocode] = coords;
          geocodeCache[originalFullAddress] = coords;
          saveGeocodeCache();
          return coords;
        }
      } catch (error) {
        console.error('Fallback geocoding error for:', fallbackAddressToGeocode, error.message);
      }
    }
  }

  // All attempts failed - cache null result
  geocodeCache[addressToGeocode] = null;
  geocodeCache[originalFullAddress] = null;
  saveGeocodeCache();

  return null;
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * GET /api/candidates
 *
 * Returns a list of all available candidates.
 * This is used to populate the candidate selector in the UI.
 */
app.get('/api/candidates', (req, res) => {
  const candidateList = CANDIDATES.map(c => ({
    id: c.id,
    name: c.name
  }));
  res.json(candidateList);
});

/**
 * GET /api/contributions/:candidateId
 *
 * Returns contribution data for a specific candidate with geocoded coordinates.
 * The data includes:
 * - isIndividual: boolean indicating if contributor is an individual
 * - name: contributor name (FirstName LastName for individuals, NonIndName for businesses)
 * - address: formatted address string
 * - city, state, zip: location data
 * - lat, lng: geocoded coordinates (null if geocoding failed)
 * - amount: contribution amount
 * - date: contribution date
 * - contributorType: type of contributor
 *
 * Addresses are geocoded server-side and cached for performance.
 * Cached results load instantly; new addresses are geocoded with rate limiting.
 */
app.get('/api/contributions/:candidateId', async (req, res) => {
  const candidateId = req.params.candidateId;
  const candidate = CANDIDATES.find(c => c.id === candidateId);

  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const csvPath = path.join(__dirname, 'data', candidate.csvFile);

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: 'Data file not found' });
  }

  const contributions = [];

  // Parse CSV file
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        // Determine if this is an individual or business contribution
        const isIndividual = row.IsIndividual === 'Y';

        // Build contributor name
        let name;
        if (isIndividual) {
          const parts = [row.FirstName, row.MI, row.LastName, row.Suffix].filter(Boolean);
          name = parts.join(' ').trim();
        } else {
          name = row.NonIndName || 'Unknown';
        }

        // Build address components
        const address = row.Street || '';
        const city = row.City || '';
        const state = row.State || '';
        const zip = row.ZIP || '';

        // Only include contributions with at least city and state
        if (city && state) {
          contributions.push({
            isIndividual,
            name,
            address,
            city,
            state,
            zip,
            amount: parseFloat(row.ContributionAmount) || 0,
            date: row.ContributionDate,
            contributorType: row.ContributorType
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Reload cache from disk (in case geocoding script has updated it)
  // Use try-catch to handle race conditions when file is being written
  if (fs.existsSync(GEOCODE_CACHE_FILE)) {
    try {
      const cacheContent = fs.readFileSync(GEOCODE_CACHE_FILE, 'utf-8');
      if (cacheContent && cacheContent.length > 0) {
        const freshCache = JSON.parse(cacheContent);
        if (freshCache && typeof freshCache === 'object') {
          geocodeCache = freshCache;
        }
      }
    } catch (error) {
      // File might be mid-write, keep using existing cache in memory
      console.log('  (Cache file currently being updated, using in-memory cache)');
    }
  }

  // Only use cached geocode results (no on-demand geocoding)
  console.log(`Loading ${contributions.length} contributions for ${candidate.name}...`);

  let cachedCount = 0;

  for (const contrib of contributions) {
    // Build address key for cache lookup
    const addressParts = [contrib.address, contrib.city, contrib.state, contrib.zip].filter(Boolean);
    const fullAddress = addressParts.join(', ');

    // Only include if already in cache
    if (geocodeCache.hasOwnProperty(fullAddress)) {
      const coords = geocodeCache[fullAddress];
      contrib.lat = coords ? coords.lat : null;
      contrib.lng = coords ? coords.lng : null;
      cachedCount++;
    } else {
      // Not yet geocoded - skip it
      contrib.lat = null;
      contrib.lng = null;
    }
  }

  console.log(`  Found ${cachedCount} cached addresses`);

  // Filter out contributions without coordinates
  const validContributions = contributions.filter(c => c.lat !== null && c.lng !== null);

  res.json({
    candidate: candidate.name,
    totalContributions: validContributions.length,
    contributions: validContributions
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Campaign Contributions Server running on http://localhost:${PORT}`);
  console.log(`Available candidates: ${CANDIDATES.map(c => c.name).join(', ')}`);
});
