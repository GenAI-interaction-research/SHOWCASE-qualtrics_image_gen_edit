# Qualtrics Image Generation & Editing Tool

This Flask-based web application provides an interface for generating and editing images using various AI APIs, designed specifically for integration within Qualtrics surveys.

It allows users participating in a survey to:
1. Generate initial images based on text prompts using **Recraft AI**.
2. Perform various direct modifications on images (inpainting, background replacement, cleanup, reimagine) using the **ClipDrop API**.
3. Save the final edited image to **Cloudinary**.

## Features

-   **Image Generation:** Creates images from text prompts via Recraft AI.
-   **Image Editing:**
    -   Text-based inpainting (modify parts of an image based on a mask and prompt) via ClipDrop.
    -   Background replacement via ClipDrop.
    -   Object cleanup/removal via ClipDrop.
    -   Image reimagine/variation via ClipDrop.
-   **Cloudinary Integration:** Uploads final images for storage and retrieval.
-   **Qualtrics Compatibility:** Configured CORS and security headers for seamless embedding in Qualtrics surveys.
-   **Session Management:** Basic session handling for user context.
-   **Dockerized:** Includes a `Dockerfile` for easy containerization and deployment.

## Prerequisites

-   Python 3.8+
-   pip (Python package installer)
-   Git
-   Docker (Optional, for containerized running/deployment)
-   API Keys for:
    -   Recraft AI
    -   ClipDrop
    -   Cloudinary (Cloud Name, API Key, API Secret)

## Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/mojoe3987/qualtrics_image_gen_edit.git
    cd qualtrics_image_gen_edit
    ```

2.  **Create a Virtual Environment:**
    ```bash
    python -m venv venv
    # Activate it (Windows PowerShell)
    .\venv\Scripts\Activate.ps1
    # Activate it (macOS/Linux bash)
    # source venv/bin/activate
    ```

3.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables:**
    *   Copy the example file:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file with your actual API keys and secrets:
        ```dotenv
        # Flask
        SECRET_KEY=generate_a_strong_random_key_here # Important for session security
        PORT=8080 # Optional: Default port

        # API Keys
        CLIPDROP_API_KEY=your_clipdrop_api_key
        RECRAFT_API_KEY=your_recraft_api_key

        # Cloudinary Credentials
        CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
        CLOUDINARY_API_KEY=your_cloudinary_api_key
        CLOUDINARY_API_SECRET=your_cloudinary_api_secret
        ```
    *   **IMPORTANT:** The `.env` file contains secrets. Ensure it is listed in your `.gitignore` and **NEVER** commit it to version control.

## Running the Application

### 1. Locally (using Flask Development Server)

```bash
flask run --host=0.0.0.0 --port=8080
# Or use the port defined in your .env if different
```
Access the application at `http://localhost:8080` (or your configured port).

### 2. Using Docker

1.  **Build the Docker Image:**
    ```bash
    docker build -t qualtrics-image-app .
    ```

2.  **Run the Docker Container:**
    ```bash
    docker run -d --env-file .env -p 8080:8080 --name qualtrics-app qualtrics-image-app
    ```
    This runs the container in detached mode, mapping port 8080 on your host to port 8080 in the container, and loads environment variables from your `.env` file. Access the application at `http://localhost:8080`.

## API Endpoints Overview

(Note: These are primarily accessed via the frontend UI)

-   `/`: Serves the initial image generation page (`generate.html`).
-   `/generate` (POST): Takes a prompt, calls Recraft API, returns generated image.
-   `/edit` (POST): Prepares the editing interface (`edit.html`) with the image to be modified.
-   `/direct-modification` (POST): Handles various editing tasks (inpainting, cleanup, etc.) by calling the appropriate ClipDrop API based on the `mode` parameter and expects image/mask data.
-   `/save-final-image` (POST): Receives the final image data (base64) and uploads it to Cloudinary.
-   `/set-prolific-id` (POST): Stores a Prolific ID in the session (likely for tracking study participants).
-   `/check-prolific-id` (GET): Retrieves the Prolific ID from the session.
-   `/health`: Basic health check endpoint.

## Qualtrics Integration

The frontend (`templates/generate.html`, `templates/edit.html`, `static/script.js`) is designed to be embedded within a Qualtrics survey using an iframe. The CORS settings in `main.py` are configured to allow requests from `*.qualtrics.com` domains. You will need to adapt the Qualtrics survey flow to present the generation/editing pages and capture the final image URL or relevant data saved from the `/save-final-image` endpoint.

## Security Considerations

*   **NEVER commit your `.env` file or any other file containing secrets (API Keys, Secret Keys) to Git.** Use the `.gitignore` file correctly.
*   **NEVER commit private SSH keys (`id_rsa`, `SSH_KEY`, etc.) to Git.**
*   **If you ever accidentally commit sensitive data, remove it from your Git history immediately.** Simply deleting the file in a new commit is not enough. See GitHub's documentation on removing sensitive data.
*   The `SECRET_KEY` in your `.env` file should be a long, random, and unpredictable string for security.
*   Review CORS settings in `main.py` if you need to allow embedding from domains other than Qualtrics or localhost.

## Deployment

This application can be deployed using various methods:

*   **Docker:** Build the image and run it on any server or cloud platform that supports Docker containers (e.g., DigitalOcean Droplets, AWS EC2, Google Compute Engine). Use a production-grade WSGI server like Gunicorn (as configured in the `Dockerfile`) instead of the Flask development server.
*   **Platform-as-a-Service (PaaS):** Platforms like Google Cloud Run, Heroku (requires Procfile), or AWS Elastic Beanstalk can often deploy directly from a Dockerfile or source code. Ensure environment variables are configured securely through the platform's interface.

Remember to configure environment variables securely on your deployment target. Do not include the `.env` file directly in deployment artifacts if possible; use the platform's secret management tools.
