from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS
import logging
from PIL import Image
from io import BytesIO
import requests
import requests.exceptions
import time
import os
import base64
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ensure_grayscale_png(file_stream):
    """Convert mask to black and white PNG with no grey pixels"""
    img = Image.open(file_stream)
    
    # Convert to grayscale
    grayscale = img.convert('L')
    
    # Convert to pure black and white (no grey)
    threshold = 128  # Middle value between 0 and 255
    binary = grayscale.point(lambda x: 0 if x < threshold else 255, '1')
    
    # Convert back to RGB mode with only black and white values
    binary = binary.convert('RGB')
    
    output = BytesIO()
    binary.save(output, format='PNG')
    output.seek(0)
    return output

def create_app():
    # Load environment variables
    load_dotenv()
    app = Flask(__name__, static_url_path='', static_folder='static')
    
    # Configure max content length (16MB)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    
    # Configure request size limit
    app.wsgi_app = ProxyFix(app.wsgi_app)

    # Configure CORS
    CORS(app)

    # Setup Clipdrop API
    CLIPDROP_API_KEY = os.getenv('CLIPDROP_API_KEY')
    if not CLIPDROP_API_KEY:
        logger.error("No Clipdrop API key found")
        raise ValueError("CLIPDROP_API_KEY environment variable is required")

    # Root route
    @app.route('/')
    def index():
        return render_template('generate.html')

    # Generation routes
    @app.route('/generate', methods=['POST'])
    def generate():
        try:
            data = request.get_json()
            prompt = data.get('prompt')

            if not prompt:
                return jsonify({'success': False, 'error': 'No prompt provided'}), 400

            try:
                response = requests.post(
                    'https://clipdrop-api.co/text-to-image/v1',
                    files={'prompt': (None, prompt, 'text/plain')},
                    headers={'x-api-key': CLIPDROP_API_KEY}
                )
                
                if not response.ok:
                    response.raise_for_status()

                return Response(
                    response.content,
                    mimetype='image/png'
                )

            except requests.exceptions.RequestException as e:
                error_message = f"Error making request to Clipdrop API: {str(e)}"
                logger.error(error_message)
                return jsonify({'success': False, 'error': error_message}), 500

        except Exception as e:
            error_message = f"Server error: {str(e)}"
            logger.error(error_message)
            return jsonify({'success': False, 'error': error_message}), 500

    @app.route('/edit', methods=['GET', 'POST'])
    def edit():
        if request.method == 'POST':
            image_data = request.form.get('image')
            edit_count = request.form.get('edit_count', 1)
            return render_template('edit.html', image_data=image_data, edit_count=edit_count)
        else:
            return "No image provided", 400

    @app.route('/direct-modification', methods=['POST'])
    def direct_modification():
        try:
            # Get image data and convert from base64
            image_data = request.form.get('image')
            if not image_data:
                return jsonify({'success': False, 'error': 'No image data provided'}), 400
            
            # Remove base64 prefix if present
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            
            # Convert base64 to bytes
            image_bytes = BytesIO(base64.b64decode(image_data))
            
            # Get mask file and mode
            mask_file = request.files.get('mask')
            mode = request.form.get('mode', 'inpaint')  # 'inpaint' or 'cleanup'
            
            if not all([image_bytes, mask_file]):
                return jsonify({'success': False, 'error': 'Missing required fields'}), 400

            # Convert mask to proper format
            mask_grayscale = ensure_grayscale_png(mask_file)

            try:
                if mode == 'cleanup':
                    # Handle cleanup request
                    cleanup_mode = request.form.get('cleanup_mode', 'fast')  # 'fast' or 'quality'
                    response = requests.post(
                        'https://clipdrop-api.co/cleanup/v1',
                        files={
                            'image_file': ('image.jpg', image_bytes, 'image/jpeg'),
                            'mask_file': ('mask.png', mask_grayscale, 'image/png')
                        },
                        data={
                            'mode': cleanup_mode
                        },
                        headers={
                            'x-api-key': CLIPDROP_API_KEY
                        }
                    )
                    response_mime = 'image/png'
                else:
                    # Handle inpainting request
                    text_prompt = request.form.get('prompt')
                    if not text_prompt:
                        return jsonify({'success': False, 'error': 'Text prompt required for inpainting'}), 400
                        
                    response = requests.post(
                        'https://clipdrop-api.co/text-inpainting/v1',
                        files={
                            'image_file': ('image.jpg', image_bytes, 'image/jpeg'),
                            'mask_file': ('mask.png', mask_grayscale, 'image/png')
                        },
                        data={
                            'text_prompt': text_prompt
                        },
                        headers={
                            'x-api-key': CLIPDROP_API_KEY
                        }
                    )
                    response_mime = 'image/jpeg'

                if not response.ok:
                    response.raise_for_status()

                return Response(
                    response.content,
                    mimetype=response_mime,
                    headers={
                        'x-remaining-credits': response.headers.get('x-remaining-credits', ''),
                        'x-credits-consumed': response.headers.get('x-credits-consumed', '')
                    }
                )

            except requests.exceptions.RequestException as e:
                error_message = f"Error making request to Clipdrop API: {str(e)}"
                logger.error(error_message)
                return jsonify({'success': False, 'error': error_message}), 500

        except Exception as e:
            logger.error(f"Error in direct modification: {str(e)}")
            return jsonify({'success': False, 'error': str(e)})

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)