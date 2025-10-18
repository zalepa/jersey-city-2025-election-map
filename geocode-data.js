/**
 * Pre-geocoding Script
 *
 * This script geocodes all addresses in the CSV files from ./data directory
 * and saves the results to geocode-cache.json. After running this once, all
 * subsequent map loads will be instant.
 *
 * Usage: node geocode-data.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const fetch = require('node-fetch');

const DATA_DIR = path.join(__dirname, 'data');
const GEOCODE_CACHE_FILE = path.join(__dirname, 'geocode-cache.json');
const CANDIDATES = [
  { csvFile: 'solomon.csv' },
  { csvFile: 'freeman.csv' },
  { csvFile: 'watterman.csv' },
  { csvFile: 'odea.csv' },
  { csvFile: 'mc_greevey.csv' },
  { csvFile: 'ali.csv' },
];

// Load existing cache
let geocodeCache = {};
if (fs.existsSync(GEOCODE_CACHE_FILE)) {
  try {
    geocodeCache = JSON.parse(fs.readFileSync(GEOCODE_CACHE_FILE, 'utf-8'));
    console.log(`Loaded ${Object.keys(geocodeCache).length} existing cached results\n`);
  } catch (error) {
    console.error('Error loading cache:', error);
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

async function geocodeAddress(address, city, state, zip) {
  // Check cache using original address first
  const originalAddressParts = [address, city, state, zip].filter(Boolean);
  const originalFullAddress = originalAddressParts.join(', ');

  if (geocodeCache.hasOwnProperty(originalFullAddress)) {
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
  if (geocodeCache.hasOwnProperty(addressToGeocode)) {
    geocodeCache[originalFullAddress] = geocodeCache[addressToGeocode];
    return geocodeCache[addressToGeocode];
  }

  // First attempt: try with cleaned address
  try {
    const query = encodeURIComponent(addressToGeocode);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const coords = {
        lat: data.results[0].geometry.location.lat,
        lng: data.results[0].geometry.location.lng
      };
      geocodeCache[addressToGeocode] = coords;
      geocodeCache[originalFullAddress] = coords;
      return coords;
    } else if (data.status !== 'ZERO_RESULTS') {
      // Log non-zero-results errors (API errors, quota issues, etc.)
      console.error('Google Geocoding API error:', data.status, data.error_message || '');
    }
  } catch (error) {
    console.error('Geocoding error:', addressToGeocode, error.message);
  }

  // Second attempt: if not a PO Box and first attempt failed, try extracting core address
  if (!isPOBox && address) {
    const coreAddress = extractCoreStreetAddress(address);

    // Only try if we actually extracted something different
    if (coreAddress !== address && coreAddress !== cleanStreetAddress(address)) {
      const fallbackAddressToGeocode = [coreAddress, city, state, zip].filter(Boolean).join(', ');

      try {
        const query = encodeURIComponent(fallbackAddressToGeocode);
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const coords = {
            lat: data.results[0].geometry.location.lat,
            lng: data.results[0].geometry.location.lng
          };
          console.log(`  ✓ Fallback succeeded: "${originalFullAddress}" -> "${fallbackAddressToGeocode}"`);
          geocodeCache[addressToGeocode] = coords;
          geocodeCache[fallbackAddressToGeocode] = coords;
          geocodeCache[originalFullAddress] = coords;
          return coords;
        }
      } catch (error) {
        console.error('Fallback geocoding error:', fallbackAddressToGeocode, error.message);
      }
    }
  }

  // All attempts failed - cache null result
  console.log(`  ⚠️  FAILED TO GEOCODE: "${originalFullAddress}"`);
  geocodeCache[addressToGeocode] = null;
  geocodeCache[originalFullAddress] = null;
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processCSV(csvFile) {
  console.log(`\nProcessing ${csvFile}...`);

  const csvPath = path.join(DATA_DIR, csvFile);

  if (!fs.existsSync(csvPath)) {
    console.log(`  ⚠️  File not found: ${csvPath}`);
    return;
  }

  const addresses = new Set();

  // First pass: collect unique addresses
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        const city = row.City || '';
        const state = row.State || '';

        if (city && state) {
          const address = row.Street || '';
          const zip = row.ZIP || '';
          const addressParts = [address, city, state, zip].filter(Boolean);
          const fullAddress = addressParts.join(', ');
          addresses.add(fullAddress);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`  Found ${addresses.size} unique addresses`);

  // Filter to addresses not in cache
  const uncachedAddresses = Array.from(addresses).filter(addr => !geocodeCache.hasOwnProperty(addr));

  if (uncachedAddresses.length === 0) {
    console.log(`  All addresses already cached!`);
    return;
  }

  console.log(`  Need to geocode ${uncachedAddresses.length} new addresses`);
  console.log(`  Geocoding with Google Maps API (no rate limiting needed)...\n`);

  // Geocode new addresses
  for (let i = 0; i < uncachedAddresses.length; i++) {
    const addr = uncachedAddresses[i];
    const parts = addr.split(', ');
    const address = parts[0] || '';
    const city = parts[1] || '';
    const state = parts[2] || '';
    const zip = parts[3] || '';

    await geocodeAddress(address, city, state, zip);

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${uncachedAddresses.length} (${Math.round((i + 1) / uncachedAddresses.length * 100)}%)`);
      // Save periodically
      fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(geocodeCache, null, 2));
    }

    // Small delay to be respectful to the API (Google allows 50 req/sec)
    await sleep(50);
  }

  console.log(`  Completed ${csvFile}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Pre-Geocoding Campaign Contributions Data');
  console.log('='.repeat(60));

  for (const candidate of CANDIDATES) {
    await processCSV(candidate.csvFile);
  }

  // Final save
  fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(geocodeCache, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('Geocoding Complete!');
  console.log(`Total cached addresses: ${Object.keys(geocodeCache).length}`);
  console.log('All future map loads will now be instant.');
  console.log('='.repeat(60));
}

main().catch(console.error);
