#!/bin/bash

# Configuration
DROPLET_IPS=(
    "146.190.127.235"
    "24.199.108.12"
    "24.199.103.191"
    "146.190.117.216"
    "146.190.55.253"
    "146.190.36.217"
    "146.190.120.213"
    "24.199.102.116"
    "146.190.61.16"
    "24.199.108.86"
)
SSH_KEY="C:/Users/joerling/Dropbox/0_Forschung/1_Paper/GPT Qualtrics/qualtrics_stable-diffusion_backed/SSH_KEY"

# Start SSH agent and add key
eval $(ssh-agent -s)
echo "Adding SSH key..."
ssh-add "$SSH_KEY"

# Function to deploy to a single droplet
deploy_to_droplet() {
    local DROPLET_IP=$1
    echo "Starting deployment to $DROPLET_IP..."

    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP '
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

    # Stop and remove existing containers
    docker stop $(docker ps -q) || true
    docker rm $(docker ps -a -q) || true

    # Build and run with Docker
    docker build -t flask-app .
    docker run -d --env-file .env -p 80:8080 --restart unless-stopped flask-app
    ' 2>&1 | tee "/tmp/deploy_${DROPLET_IP}.log"

    if [ $? -eq 0 ]; then
        echo "✅ Successfully deployed to $DROPLET_IP"
        return 0
    else
        echo "❌ Failed to deploy to $DROPLET_IP"
        return 1
    fi
}

# Initialize counters
successful_deploys=0
failed_deploys=0
failed_ips=()

echo "Starting batch deployment to ${#DROPLET_IPS[@]} droplets..."
echo "-------------------------------------------"

# Deploy to all droplets in parallel
for ip in "${DROPLET_IPS[@]}"; do
    deploy_to_droplet "$ip" &
done

# Wait for all deployments to complete
wait

# Count successes and failures from log files
for ip in "${DROPLET_IPS[@]}"; do
    if grep -q "Successfully deployed" "/tmp/deploy_${ip}.log"; then
        ((successful_deploys++))
    else
        ((failed_deploys++))
        failed_ips+=($ip)
    fi
    rm "/tmp/deploy_${ip}.log"
done

# Print summary
echo "-------------------------------------------"
echo "Deployment Summary:"
echo "✅ Successful deployments: $successful_deploys"
echo "❌ Failed deployments: $failed_deploys"
if [ ${#failed_ips[@]} -gt 0 ]; then
    echo "Failed IPs:"
    for ip in "${failed_ips[@]}"; do
        echo "  - $ip"
    done
fi
echo "-------------------------------------------"

# Cleanup SSH agent
ssh-agent -k

# Exit with status based on success
if [ $failed_deploys -eq 0 ]; then
    echo "All deployments completed successfully!"
    exit 0
else
    echo "Some deployments failed. Please check the logs above."
    exit 1
fi