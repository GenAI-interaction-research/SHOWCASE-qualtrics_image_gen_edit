#!/bin/bash

# Configuration
DROPLET_IP="146.190.127.235"
SSH_KEY="C:/Users/joerling/Dropbox/0_Forschung/1_Paper/GPT Qualtrics/qualtrics_stable-diffusion_backed/SSH_KEY"

echo "Deploying to droplet at $DROPLET_IP..."

ssh -i "$SSH_KEY" root@$DROPLET_IP '
# Install Docker if not present
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    apt-get update
    apt-get install -y git
fi

# Clone or update the repository
cd /root
rm -rf app
git clone https://mojoe3987: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@github.com/mojoe3987/qualtrics_stable-diffusion_backed.git app
cd app

# Create Dockerfile
echo "FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Set Flask environment variables
ENV FLASK_APP=main.py
ENV FLASK_ENV=production
ENV MAX_CONTENT_LENGTH=52428800

CMD [\"python\", \"main.py\"]" > Dockerfile

# Create requirements.txt if it doesnt exist
echo "flask==2.0.1
cloudinary==1.37.0
Pillow==10.2.0
flask-cors==4.0.0
python-dotenv==1.0.0
requests==2.31.0
Werkzeug==2.0.1" > requirements.txt

# Create .env file
echo "CLIPDROP_API_KEY=6e51e9b7ff359c9fa50d086fe7abeb6a24dfe423fc4122e85e2d04b69924718bc2f9aff73c1d778df43b21d74092c192
RECRAFT_API_KEY=6gu41BkgNuKrkox2lLjKIHV3sWWeoiAum6BK6jQKxMIJSTKvvDjUOPsK2xSKbu5k
CLOUDINARY_CLOUD_NAME=ddzia7e31
CLOUDINARY_API_KEY=368358624844357
CLOUDINARY_API_SECRET=_z_uvIY_xR93aIlq0OE00zKI8z8
SECRET_KEY=dev-key-123
MAX_CONTENT_LENGTH=52428800" > .env

# Build and run with Docker
docker build -t flask-app .
docker stop $(docker ps -q) || true
docker run -d --env-file .env -p 80:8080 --restart unless-stopped flask-app
'

echo "Deployment completed!"