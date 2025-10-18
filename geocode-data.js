/**
 * Pre-geocoding Script
 *
 * This script geocodes all addresses in the CSV files from ./data directory
 * and saves the results to geocode-cache.json. After running this once, all
 * subsequent map loads will be instant.
 *
 * Usage: node geocode-data.js
 */

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

async function geocodeAddress(address, city, state, zip) {
  const addressParts = [address, city, state, zip].filter(Boolean);
  const fullAddress = addressParts.join(', ');

  // Check cache
  if (geocodeCache.hasOwnProperty(fullAddress)) {
    return geocodeCache[fullAddress];
  }

  try {
    const query = encodeURIComponent(fullAddress);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'CampaignContributionsMap/1.0' }
    });

    const results = await response.json();

    if (results && results.length > 0) {
      const coords = {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon)
      };
      geocodeCache[fullAddress] = coords;
      return coords;
    }
  } catch (error) {
    console.error('Geocoding error:', fullAddress, error.message);
  }

  geocodeCache[fullAddress] = null;
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
  console.log(`  This will take approximately ${Math.ceil(uncachedAddresses.length * 1.1 / 60)} minutes...\n`);

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

    // Rate limit: 1 request per second
    await sleep(1100);
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
