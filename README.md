# Qualtrics Recraft Image Generation API

A Flask-based API service that integrates with Recraft AI for image generation, designed to be used with Qualtrics surveys.

## Features

- Image generation using Recraft AI
- CORS support for Qualtrics domains
- Error handling and logging
- Docker containerization
- Google Cloud Run deployment ready

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables:
```bash
RECRAFT_API_TOKEN=your_token_here
```

3. Run locally:
```bash
python main.py
```

## Deployment

The service is designed to be deployed to Google Cloud Run:

```bash
gcloud run deploy qualtrics-recraft-api --source . --region europe-west1 --allow-unauthenticated
```

## Usage

Send POST requests to `/generate-image` endpoint with:

```json
{
    "prompt": "your image description",
    "style": "style_name",
    "size": "1024x1024"
}
```

## Qualtrics Integration

Use the provided JavaScript code in your Qualtrics survey to integrate with this API.
