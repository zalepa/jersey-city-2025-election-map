# Contributing to Campaign Contributions Map

Thank you for your interest in contributing! This guide will help you understand the codebase and make meaningful contributions.

## Table of Contents

- [Getting Started](#getting-started)
- [Architecture Overview](#architecture-overview)
- [Code Organization](#code-organization)
- [Development Workflow](#development-workflow)
- [Adding Features](#adding-features)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

## Getting Started

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/zalepa/jersey-city-2025-election-map.git
   cd jersey-city-2025-election-map
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your Google Maps API key
   ```

4. **Start development server:**
   ```bash
   npm start
   ```

5. **Access the app:**

   Open http://localhost:3000 in your browser

## Architecture Overview

### System Flow

```
┌─────────────┐
│  Raw Data   │
│  (CSV files)│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ dedupe-data.js  │ ← Aggregates contributions by donor
└──────┬──────────┘
       │
       ▼
┌──────────────────┐
│  Data Directory  │
│  (Deduplicated)  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ geocode-data.js  │ ← Pre-geocodes all addresses
└──────┬───────────┘
       │
       ▼
┌───────────────────┐
│ geocode-cache.json│ ← Cached coordinates
└──────┬────────────┘
       │
       ▼
┌──────────────────┐
│    server.js     │ ← Express API server
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Frontend (Pub)  │ ← Interactive map UI
│  - index.html    │
│  - app.js        │
│  - styles.css    │
└──────────────────┘
```

### Key Components

#### Backend (`server.js`)

**Purpose:** Express server that serves the frontend and provides API endpoints

**Key Functions:**
- `cleanStreetAddress(address)` - Removes apartment numbers, building names
- `extractCoreStreetAddress(address)` - Extracts base street address using street type keywords
- `geocodeAddress(address, city, state, zip)` - Geocodes addresses with fallback strategies
- `/api/candidates` - Returns list of available candidates
- `/api/contributions/:candidateId` - Returns geocoded contributions for a candidate

**Geocoding Strategy:**
1. Check cache for original address
2. Handle PO Boxes (geocode city/state only)
3. Try geocoding with cleaned address
4. Fallback: extract core street address and try again
5. Cache result (success or failure)

#### Frontend (`public/app.js`)

**Purpose:** Client-side map interface and interaction logic

**Key Functions:**
- `initMap()` - Initializes Leaflet map with CartoDB tiles
- `loadContributions(candidateId)` - Fetches and displays contribution data
- `plotContributions(contributions, fitBounds)` - Renders markers on map
- `calculateMarkerSize(amount)` - Computes area-proportional marker size
- `addMarker(contribution, coords)` - Creates a single marker
- `applyFilter(fitBounds)` - Filters contributions by type and/or drawn shape
- `isPointInShape(point, shape)` - Checks if a point is within a drawn polygon/rectangle

**Event Handlers:**
- Candidate selection
- Filter toggle (All/Individual/Business)
- Sizing toggle (Fixed/Area Proportional)
- Map drawing (polygon/rectangle creation/deletion)

#### Geocoding Script (`geocode-data.js`)

**Purpose:** Batch geocodes all addresses before deployment

**Key Features:**
- Processes unique addresses only
- Uses Google Maps Geocoding API
- Implements address cleaning and fallback strategies
- Respects API rate limits (50ms delay between requests)
- Saves progress periodically
- Logs failed geocodes for review

#### Deduplication Script (`dedupe-data.js`)

**Purpose:** Aggregates multiple contributions from same donor

**Logic:**
- Groups by donor name + address
- Sums contribution amounts
- Keeps first date (earliest contribution)
- Outputs to `data/` directory

## Code Organization

### File Structure

```
server.js           # Backend server and API
  ├── Configuration (CANDIDATES array)
  ├── Cache management
  ├── Address cleaning utilities
  ├── Geocoding logic with fallbacks
  └── API endpoints

public/app.js       # Frontend logic
  ├── Map initialization
  ├── Data loading and caching
  ├── Marker rendering
  ├── Filter logic
  ├── Drawing tools integration
  └── UI event handlers

public/styles.css   # Styling
  ├── Layout (header, map, footer)
  ├── Controls and filters
  ├── Marker styles
  ├── Responsive design
  └── Map customization

geocode-data.js     # Batch geocoding
  ├── CSV reading
  ├── Address deduplication
  ├── Geocoding with Google API
  ├── Progress tracking
  └── Cache management

dedupe-data.js      # Data aggregation
  ├── CSV parsing
  ├── Donor grouping
  ├── Amount summation
  └── CSV output
```

## Development Workflow

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow the code style guidelines below
   - Add comments for complex logic
   - Test your changes locally

3. **Test thoroughly:**
   - Load different candidates
   - Try all filter combinations
   - Test area-proportional sizing
   - Draw shapes and verify filtering
   - Test on mobile/desktop viewports

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Add feature: description"
   ```

### Common Development Tasks

#### Adding a New Filter

1. **Add UI toggle to `public/index.html`:**
   ```html
   <div class="your-filter-toggle">
     <label>
       <input type="radio" name="your-filter" value="option1" checked>
       Option 1
     </label>
     <!-- more options -->
   </div>
   ```

2. **Add CSS styling to `public/styles.css`:**
   ```css
   .your-filter-toggle {
     display: flex;
     gap: 0.25rem;
     /* ... */
   }
   ```

3. **Add event listener in `public/app.js`:**
   ```javascript
   function setupEventListeners() {
     // ... existing listeners ...
     const yourFilterRadios = document.querySelectorAll('input[name="your-filter"]');
     yourFilterRadios.forEach(radio => {
       radio.addEventListener('change', handleYourFilterChange);
     });
   }
   ```

4. **Implement filter logic:**
   ```javascript
   function handleYourFilterChange() {
     applyFilter(false); // Redraw with new filter
   }

   function applyFilter(fitBounds = true) {
     // ... existing filters ...

     // Add your filter logic
     const yourFilterValue = document.querySelector('input[name="your-filter"]:checked').value;
     if (yourFilterValue === 'something') {
       filteredContributions = filteredContributions.filter(c => /* your condition */);
     }

     // ... rest of function ...
   }
   ```

#### Adding a New API Endpoint

1. **Define endpoint in `server.js`:**
   ```javascript
   app.get('/api/your-endpoint', async (req, res) => {
     try {
       // Your logic here
       const data = await fetchYourData();
       res.json(data);
     } catch (error) {
       console.error('Error:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });
   ```

2. **Call from frontend `public/app.js`:**
   ```javascript
   async function fetchYourData() {
     try {
       const response = await fetch('/api/your-endpoint');
       if (!response.ok) {
         throw new Error(`HTTP error! status: ${response.status}`);
       }
       const data = await response.json();
       return data;
     } catch (error) {
       console.error('Error fetching data:', error);
     }
   }
   ```

#### Modifying the Geocoding Logic

**Address Cleaning Patterns** are in both `server.js` and `geocode-data.js`:

```javascript
function cleanStreetAddress(address) {
  // Add your pattern here
  const patterns = [
    // Existing patterns...
    /\s+(YOUR_PATTERN)\s+[A-Z0-9#\-]+.*$/i,
  ];
  // ... rest of function
}
```

**Street Type Keywords** are in `extractCoreStreetAddress()`:

```javascript
const streetTypes = [
  'STREET', 'ST', 'AVENUE', 'AVE', // ... existing
  'YOUR_TYPE', 'YT', // Add your street types
];
```

## Code Style Guidelines

### JavaScript

- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Use them
- **Comments:** Use JSDoc-style comments for functions
- **Variable names:** camelCase
- **Constants:** UPPER_SNAKE_CASE for true constants
- **Functions:** Descriptive names, single responsibility

**Example:**
```javascript
/**
 * Calculate the total contribution amount for a given candidate
 * @param {Array} contributions - Array of contribution objects
 * @returns {number} Total amount
 */
function calculateTotalAmount(contributions) {
  return contributions.reduce((sum, contrib) => sum + contrib.amount, 0);
}
```

### CSS

- **Indentation:** 2 spaces
- **Naming:** Use kebab-case for class names
- **Organization:** Group related styles together
- **Comments:** Use `/* Comment */` for section headers

**Example:**
```css
/* Header Controls */
.filter-toggle {
  display: flex;
  gap: 0.25rem;
  background: rgba(255, 255, 255, 0.1);
}

.filter-toggle label {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}
```

### HTML

- **Indentation:** 2 spaces
- **Semantic elements:** Use semantic HTML5 elements
- **Accessibility:** Include ARIA labels where appropriate

## Testing

### Manual Testing Checklist

Before submitting changes, test:

- [ ] Load each candidate successfully
- [ ] Filter by Individual/Business/All
- [ ] Toggle between Fixed and Area Proportional sizing
- [ ] Draw a polygon and verify filtering
- [ ] Draw a rectangle and verify filtering
- [ ] Delete a drawn shape
- [ ] Click markers and verify popup content
- [ ] Test on mobile viewport (< 768px)
- [ ] Test on tablet viewport (768px - 1200px)
- [ ] Test on desktop viewport (> 1200px)
- [ ] Verify no console errors

### Testing Geocoding

If you modified geocoding logic:

```bash
# Test with a small dataset first
# Edit geocode-data.js temporarily to limit addresses
npm run geocode

# Check for failed addresses in output
# Verify coordinates in geocode-cache.json
```

## Submitting Changes

### Pull Request Process

1. **Push your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request:**
   - Provide a clear title and description
   - Reference any related issues
   - Include screenshots for UI changes
   - List testing performed

3. **PR Description Template:**
   ```markdown
   ## What does this PR do?
   Brief description of changes

   ## Why is this needed?
   Problem this solves or feature it adds

   ## How to test
   Step-by-step testing instructions

   ## Screenshots (if applicable)
   [Add screenshots]

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Tested locally
   - [ ] No console errors
   - [ ] Works on mobile
   - [ ] Documentation updated (if needed)
   ```

4. **Respond to feedback:**
   - Address review comments promptly
   - Make requested changes
   - Re-test after changes

### Commit Message Guidelines

Use clear, descriptive commit messages:

**Good:**
```
Add date range filter to contributions
Fix marker sizing for small contributions
Update README with new features
```

**Bad:**
```
fix bug
changes
WIP
```

## Questions?

If you have questions about contributing:
1. Check existing documentation
2. Look at similar code in the project
3. Open an issue for discussion
4. Ask in pull request comments

---

Thank you for contributing to Campaign Contributions Map!
