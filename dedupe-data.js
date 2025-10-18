/**
 * Data Aggregation Script
 *
 * This script aggregates contribution records by donor from CSV files.
 * Reads from ./raw directory and writes aggregated data to ./data directory.
 *
 * Records are grouped by:
 * - Contributor name (or business name)
 * - Address (street, city, state, zip)
 *
 * Multiple contributions from the same donor are aggregated into a single
 * record with the total contribution amount.
 *
 * Usage: node dedupe-data.js
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const RAW_DIR = path.join(__dirname, 'raw');
const DATA_DIR = path.join(__dirname, 'data');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
  console.log('Created ./data directory\n');
}

/**
 * Generate a unique key for a donor (not including amount or date)
 */
function generateDonorKey(row) {
  const isIndividual = row.IsIndividual === 'Y';

  // Build contributor name
  let name;
  if (isIndividual) {
    const parts = [row.FirstName, row.MI, row.LastName, row.Suffix].filter(Boolean);
    name = parts.join(' ').trim().toUpperCase();
  } else {
    name = (row.NonIndName || '').trim().toUpperCase();
  }

  // Build address
  const address = (row.Street || '').trim().toUpperCase();
  const city = (row.City || '').trim().toUpperCase();
  const state = (row.State || '').trim().toUpperCase();
  const zip = (row.ZIP || '').trim();

  // Create unique key for this donor
  return `${name}|${address}|${city}|${state}|${zip}`;
}

/**
 * Process a single CSV file
 */
async function processCSV(filename) {
  const rawPath = path.join(RAW_DIR, filename);
  const dataPath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(rawPath)) {
    console.log(`⚠️  File not found: ${filename}`);
    return;
  }

  console.log(`Processing ${filename}...`);

  const donorMap = new Map();
  let totalCount = 0;

  // Read all records and aggregate by donor
  await new Promise((resolve, reject) => {
    fs.createReadStream(rawPath)
      .pipe(csv())
      .on('data', (row) => {
        totalCount++;

        const key = generateDonorKey(row);
        const amount = parseFloat(row.ContributionAmount) || 0;

        if (donorMap.has(key)) {
          // Donor already exists, add to their total
          const existing = donorMap.get(key);
          existing.totalAmount += amount;
          existing.contributionCount++;

          // Keep track of all contribution dates
          existing.dates.push(row.ContributionDate);
        } else {
          // New donor, create entry
          donorMap.set(key, {
            record: row,
            totalAmount: amount,
            contributionCount: 1,
            dates: [row.ContributionDate]
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`  Total records: ${totalCount}`);
  console.log(`  Unique donors: ${donorMap.size}`);
  console.log(`  Aggregated ${totalCount - donorMap.size} duplicate contributions`);

  // Write aggregated data
  if (donorMap.size > 0) {
    const aggregatedRecords = [];

    // Convert map to array of records with aggregated amounts
    for (const [key, data] of donorMap) {
      const record = { ...data.record };

      // Update the contribution amount to the total
      record.ContributionAmount = data.totalAmount.toString();

      // Use the most recent date
      const sortedDates = data.dates.sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB - dateA;
      });
      record.ContributionDate = sortedDates[0];

      aggregatedRecords.push(record);
    }

    // Get headers from first record
    const headers = Object.keys(aggregatedRecords[0]);

    // Create CSV content
    const csvLines = [headers.join(',')];

    aggregatedRecords.forEach(record => {
      const values = headers.map(header => {
        const value = record[header] || '';
        // Escape values with commas or quotes
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvLines.push(values.join(','));
    });

    fs.writeFileSync(dataPath, csvLines.join('\n'));
    console.log(`  ✓ Wrote ${aggregatedRecords.length} records to ./data/${filename}\n`);
  } else {
    console.log(`  ⚠️  No records to write\n`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Aggregating Campaign Contributions Data by Donor');
  console.log('='.repeat(60));
  console.log();

  // Check if raw directory exists
  if (!fs.existsSync(RAW_DIR)) {
    console.error('❌ Error: ./raw directory not found');
    console.error('Please create ./raw directory and place your CSV files there.');
    process.exit(1);
  }

  // Get all CSV files in raw directory
  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.csv'));

  if (files.length === 0) {
    console.error('❌ Error: No CSV files found in ./raw directory');
    process.exit(1);
  }

  console.log(`Found ${files.length} CSV file(s) in ./raw\n`);

  // Process each file
  for (const file of files) {
    await processCSV(file);
  }

  console.log('='.repeat(60));
  console.log('Aggregation Complete!');
  console.log('Aggregated data is now in ./data directory');
  console.log('Each donor has one record with total contribution amount.');
  console.log('='.repeat(60));
}

main().catch(console.error);
