from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS
import logging
from openai import OpenAI
import os
from dotenv import load_dotenv
from PIL import Image
from io import BytesIO
import requests
import requests.exceptions
import time

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ensure_grayscale_png(file_stream):
    img = Image.open(file_stream)
    grayscale = img.convert('L')
    output = BytesIO()
    grayscale.save(output, format='PNG')
    output.seek(0)
    return output

def create_app():
    # Load environment variables
    load_dotenv()
    app = Flask(__name__, static_url_path='', static_folder='static')

    # Configure CORS with more permissive settings
    CORS(app, resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })

    # Setup Recraft client
    RECRAFT_API_TOKEN = os.getenv('RECRAFT_API_TOKEN')
    if not RECRAFT_API_TOKEN:
        logger.error("No Recraft API token found")
        raise ValueError("RECRAFT_API_TOKEN environment variable is required")
    
    # Log token details (safely)
    logger.info(f"API Token details:")
    logger.info(f"- Length: {len(RECRAFT_API_TOKEN)}")
    logger.info(f"- First 4 chars: {RECRAFT_API_TOKEN[:4]}***")
    logger.info(f"- Environment variables: {list(os.environ.keys())}")
    
    recraft_client = OpenAI(
        api_key=RECRAFT_API_TOKEN,
        base_url='https://external.api.recraft.ai/v1',
        max_retries=3,
        timeout=30.0
    )
    logger.info("Recraft client initialized successfully")

    # Root route
    @app.route('/')
    def index():
        return render_template('generate.html')

    # Generation routes
    @app.route('/generate')
    def generate_page():
        return render_template('generate.html')

    @app.route('/generate-image', methods=['POST'])
    def generate_image():
        try:
            logger.info("Received generate-image request")
            data = request.get_json()
            logger.info(f"Request data: {data}")
            
            if not data or 'prompt' not in data:
                logger.error("No prompt provided in request")
                return jsonify({'success': False, 'error': 'No prompt provided'}), 400
            
            prompt = data['prompt']
            style = data.get('style', 'realistic_image')
            size = data.get('size', '1024x1024')

            logger.info(f"Generating image with prompt: {prompt}, style: {style}")
            
            try:
                response = recraft_client.images.generate(
                    prompt=prompt,
                    style=style
                )
                
                if not response.data:
                    logger.error("No image data in response")
                    return jsonify({'success': False, 'error': 'No image data in API response'}), 500
                    
                image_url = response.data[0].url
                logger.info(f"Image generated successfully: {image_url}")
                
                return jsonify({
                    'success': True,
                    'image_url': image_url
                })
            except requests.exceptions.ConnectionError as e:
                logger.error(f"Connection error to Recraft API: {str(e)}")
                return jsonify({'success': False, 'error': f'Connection error: {str(e)}'}), 503
            except requests.exceptions.Timeout as e:
                logger.error(f"Timeout error with Recraft API: {str(e)}")
                return jsonify({'success': False, 'error': f'Request timed out: {str(e)}'}), 504
            except Exception as e:
                logger.error(f"Unexpected error with Recraft API: {str(e)}")
                return jsonify({'success': False, 'error': f'Unexpected error: {str(e)}'}), 500
        except Exception as e:
            logger.error(f"Server Error: {str(e)}")
            return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500

    # Editing routes
    @app.route('/edit')
    def edit_page():
        image_url = request.args.get('url')
        if not image_url:
            return "No image URL provided", 400
        return render_template('edit.html', image_url=image_url)

    @app.route('/proxy-image', methods=['GET'])
    def proxy_image():
        image_url = request.args.get('url')
        if not image_url:
            return jsonify({'error': 'No URL provided'}), 400

        try:
            response = requests.get(image_url, stream=True)
            response.raise_for_status()

            # Convert to PNG using Pillow
            img_data = BytesIO(response.content)
            with Image.open(img_data) as img:
                output = BytesIO()
                img.save(output, format='PNG')
                output.seek(0)
                return Response(
                    output.getvalue(),
                    mimetype='image/png'
                )
        except Exception as e:
            logger.error(f"Error proxying image: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/direct-modification', methods=['POST'])
    def direct_modification():
        try:
            mask_file = request.files.get('mask')
            image_file = request.files.get('image')
            prompt = request.form.get('prompt')
            
            if not mask_file or not image_file or not prompt:
                logger.error(f"Missing required files or prompt. Files: mask={bool(mask_file)}, image={bool(image_file)}, prompt={bool(prompt)}")
                return jsonify({'success': False, 'error': 'Missing required files or prompt'})

            logger.info(f"Processing inpainting request with prompt: {prompt}")

            # Convert mask to proper grayscale PNG
            mask_grayscale = ensure_grayscale_png(mask_file)
            
            # Convert image to PNG
            with Image.open(image_file) as img:
                image_output = BytesIO()
                img.save(image_output, format='PNG')
                image_output.seek(0)

            try:
                logger.info("Preparing to call Recraft API for inpainting")
                
                # Using direct HTTP request instead of OpenAI client
                headers = {
                    'Authorization': f'Bearer {RECRAFT_API_TOKEN}'
                }
                files = {
                    'image': ('image.png', image_output, 'image/png'),
                    'mask': ('mask.png', mask_grayscale, 'image/png')
                }
                data = {'prompt': prompt}

                response = requests.post(
                    'https://external.api.recraft.ai/v1/images/inpaint',
                    headers=headers,
                    files=files,
                    data=data
                )
                
                response.raise_for_status()
                result = response.json()
                
                edited_image_url = result['data'][0]['url']
                logger.info(f"Image edited successfully: {edited_image_url}")
                
                return jsonify({
                    'success': True,
                    'image_url': edited_image_url
                })
            except Exception as e:
                logger.error(f"Error during API request: {str(e)}")
                return jsonify({'success': False, 'error': f'API request failed: {str(e)}'})
        except Exception as e:
            logger.error(f"Error in direct modification: {str(e)}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/health')
    def health_check():
        try:
            # Test connection to Recraft API
            response = requests.get('https://external.api.recraft.ai/v1/health',
                                 headers={'Authorization': f'Bearer {RECRAFT_API_TOKEN}'},
                                 timeout=10)
            logger.info(f"Health check response status: {response.status_code}")
            return jsonify({
                'status': 'healthy',
                'recraft_api': 'connected' if response.status_code == 200 else 'error',
                'recraft_status_code': response.status_code
            })
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Health check connection error: {str(e)}")
            return jsonify({
                'status': 'unhealthy',
                'error': f'Connection error: {str(e)}'
            }), 503
        except requests.exceptions.Timeout as e:
            logger.error(f"Health check timeout: {str(e)}")
            return jsonify({
                'status': 'unhealthy',
                'error': f'Timeout: {str(e)}'
            }), 504
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return jsonify({
                'status': 'unhealthy',
                'error': str(e)
            }), 500

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)