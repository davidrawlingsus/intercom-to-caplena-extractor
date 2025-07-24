# Intercom to Caplena Extractor

Extract chat transcripts from Intercom and post them to Caplena for text analysis.

## Features

- 🔄 **Bulk Export**: Extract all historical conversations from Intercom
- 📊 **CSV Export**: Save transcripts to CSV format
- 🚀 **Caplena Integration**: Upload conversations to Caplena for analysis
- ⚡ **Daily Sync**: Automated daily sync of new conversations
- 🧪 **Test Mode**: Test sync functionality with custom time windows

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your API keys
4. Run the application: `npm start`

## Usage

### Initial Bulk Export

To export all historical conversations and upload to Caplena:

```bash
npm start
```

This will:
- Fetch all conversations from Intercom
- Extract user messages and transcripts
- Export to CSV file
- Upload to Caplena project

### Daily Sync

To sync new conversations from the last 24 hours:

```bash
npm run sync
```

### Testing Daily Sync

Test the sync functionality with different time windows:

```bash
# Test with last 24 hours (default)
npm run sync:test

# Test with last 1 hour
npm run sync:test:1h

# Test with last 6 hours
npm run sync:test:6h

# Test with custom hours
node src/dailySyncCLI.js --test --hours=12
```

### Manual CSV Upload

To upload existing CSV data to Caplena:

```bash
npm start
```

(When CSV file exists, it will upload the data instead of fetching from Intercom)

## Configuration

Create a `.env` file with your API credentials:

```env
# Intercom API
INTERCOM_ACCESS_TOKEN=your_intercom_token

# Caplena API
CAPLENA_API_KEY=your_caplena_api_key
CAPLENA_BASE_URL=https://api.caplena.com

# Output settings
OUTPUT_CSV_PATH=./exports/intercom_transcripts.csv
```

## Railway Deployment

Railway is perfect for running the daily sync as a managed service. Here's how to deploy:

### 1. Connect to Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Link your project: `railway link`

### 2. Set Environment Variables

```bash
railway variables set INTERCOM_ACCESS_TOKEN=your_intercom_token
railway variables set CAPLENA_API_KEY=your_caplena_api_key
railway variables set CAPLENA_BASE_URL=https://api.caplena.com
railway variables set OUTPUT_CSV_PATH=./exports/intercom_transcripts.csv
```

### 3. Deploy

```bash
railway up
```

### 4. Monitor

- **Logs**: `railway logs`
- **Status**: `railway status`
- **Manual sync**: Visit `https://your-app.railway.app/sync`
- **Test sync**: Visit `https://your-app.railway.app/test?hours=6`

### Railway Features

- **Automatic scheduling**: Runs daily at 9 AM UTC
- **Health checks**: `/health` endpoint for monitoring
- **Manual triggers**: `/sync` endpoint for immediate sync
- **Test endpoints**: `/test?hours=24` for testing
- **Auto-restart**: On failure with retry logic
- **Logging**: All logs available in Railway dashboard

## Cron Job Setup

To run the daily sync automatically, add to your crontab:

```bash
# Run daily sync at 9 AM every day
0 9 * * * cd /path/to/intercom-to-caplena && npm run sync >> /var/log/intercom-sync.log 2>&1
```

## API Endpoints

### Intercom API
- Fetches conversations with pagination
- Extracts full conversation transcripts
- Filters for user messages only

### Caplena API
- Creates/finds projects
- Bulk uploads conversations (20 rows per batch)
- Rate limiting (10 requests per second)

## File Structure

```
src/
├── index.js              # Main application (bulk export)
├── dailySync.js          # Daily sync functionality
├── dailySyncCLI.js       # CLI for daily sync
├── services/
│   ├── intercom.js       # Intercom API service
│   └── caplena.js        # Caplena API service
└── utils/
    ├── csvExporter.js    # CSV export utilities
    └── logger.js         # Logging configuration
```

## Logging

All operations are logged to:
- Console output
- `logs/combined.log` (all levels)
- `logs/error.log` (errors only)

## Error Handling

- Automatic retry for API failures
- Graceful handling of rate limits
- Detailed error logging
- Fallback modes for partial failures

## Rate Limits

- **Intercom**: 10 requests per second
- **Caplena**: 10 requests per second
- Built-in delays between API calls

## Data Format

### CSV Export
- Conversation ID, timestamps, subject
- Message content, author type, message metadata
- UTF-8 encoding with proper escaping

### Caplena Upload
- Text field: Combined user messages
- Metadata: Conversation ID, timestamps, message counts
- Proper data type conversion (timestamps as strings) 