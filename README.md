# Intercom to Caplena Chat Transcript Extractor

This application extracts entire chat transcripts from Intercom and posts them to Caplena for analysis.

## Features

- Extract complete chat conversations from Intercom
- Transform chat data into Caplena-compatible format
- Post transcripts to Caplena for sentiment analysis and insights
- Configurable rate limiting and error handling
- Comprehensive logging

## Setup

### Prerequisites

- Node.js 16.0.0 or higher
- Intercom API access token
- Caplena API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd intercom_to_caplena
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
```

4. Edit `.env` file with your API credentials:
```env
INTERCOM_ACCESS_TOKEN=your_intercom_access_token_here
CAPLENA_API_KEY=your_caplena_api_key_here
```

### Configuration

The application uses the following environment variables:

- `INTERCOM_ACCESS_TOKEN`: Your Intercom API access token
- `INTERCOM_BASE_URL`: Intercom API base URL (defaults to https://api.intercom.io)
- `CAPLENA_API_KEY`: Your Caplena API key
- `CAPLENA_BASE_URL`: Caplena API base URL (defaults to https://api.caplena.com)
- `NODE_ENV`: Environment (development, test, production)
- `LOG_LEVEL`: Logging level (info, debug, warn, error)

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Testing

```bash
npm test
```

## Project Structure

```
intercom_to_caplena/
├── src/
│   ├── index.js              # Main application entry point
│   ├── services/
│   │   ├── intercom.js       # Intercom API integration
│   │   └── caplena.js        # Caplena API integration
│   ├── utils/
│   │   ├── logger.js         # Logging configuration
│   │   └── transformers.js   # Data transformation utilities
│   └── config/
│       └── index.js          # Configuration management
├── tests/                    # Test files
├── .env                      # Environment variables (create from env.example)
├── .gitignore               # Git ignore rules
├── package.json             # Project dependencies and scripts
└── README.md               # This file
```

## API Integration

### Intercom API

The application connects to Intercom's API to:
- Retrieve conversation lists
- Extract full conversation transcripts
- Handle pagination for large datasets

### Caplena API

The application posts data to Caplena's API to:
- Upload conversation transcripts
- Configure analysis parameters
- Retrieve analysis results

## Error Handling

The application includes comprehensive error handling for:
- API rate limiting
- Network connectivity issues
- Invalid API responses
- Data transformation errors

## Logging

All operations are logged using Winston with configurable levels:
- `info`: General application flow
- `debug`: Detailed API interactions
- `warn`: Non-critical issues
- `error`: Critical errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details 