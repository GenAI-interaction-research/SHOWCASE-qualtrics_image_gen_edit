from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS
import logging
from PIL import Image
from io import BytesIO
import requests
import requests.exceptions
import os
import base64
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ensure_grayscale_png(file_stream):
    """Convert mask to black and white PNG"""
    img = Image.open(file_stream)
    grayscale = img.convert('L')
    threshold = 128
    binary = grayscale.point(lambda x: 0 if x < threshold else 255, '1')
    binary = binary.convert('RGB')
    output = BytesIO()
    binary.save(output, format='PNG')
    output.seek(0)
    return output

def create_app():
    load_dotenv()
    app = Flask(__name__, static_url_path='', static_folder='static')
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB
    app.wsgi_app = ProxyFix(app.wsgi_app)
    CORS(app)

    CLIPDROP_API_KEY = os.getenv('CLIPDROP_API_KEY')
    if not CLIPDROP_API_KEY:
        logger.error("CLIPDROP_API_KEY environment variable is required")
        raise ValueError("Missing API key")

    @app.route('/')
    def index():
        return render_template('generate.html')

    @app.route('/generate', methods=['POST'])
    def generate():
        try:
            data = request.get_json()
            prompt = data.get('prompt')
            if not prompt:
                return jsonify({'success': False, 'error': 'No prompt provided'}), 400

            response = requests.post(
                'https://clipdrop-api.co/text-to-image/v1',
                files={'prompt': (None, prompt)},
                headers={'x-api-key': CLIPDROP_API_KEY}
            )
            response.raise_for_status()
            return Response(response.content, mimetype='image/png')

        except Exception as e:
            logger.error(f"Generation error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/edit', methods=['POST'])
    def edit():
        image_data = request.form.get('image')
        edit_count = request.form.get('edit_count', 1)
        return render_template('edit.html', 
                             image_data=image_data,
                             edit_count=edit_count)

    @app.route('/direct-modification', methods=['POST'])
    def direct_modification():
        try:
            # Common image handling
            image_data = request.form.get('image')
            if not image_data:
                return jsonify({'success': False, 'error': 'No image data'}), 400
            
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            
            image_bytes = BytesIO(base64.b64decode(image_data))
            mode = request.form.get('mode', 'inpaint')

            # Route based on operation type
            if mode == 'cleanup':
                return handle_cleanup(image_bytes)
            elif mode == 'reimagine':
                return handle_reimagine(image_bytes)
            else:  # Default to inpainting
                return handle_inpainting(image_bytes)

        except Exception as e:
            logger.error(f"Processing error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def handle_cleanup(image_bytes):
        mask_file = request.files.get('mask')
        if not mask_file:
            return jsonify({'success': False, 'error': 'Missing mask'}), 400

        mask = ensure_grayscale_png(mask_file)
        response = requests.post(
            'https://clipdrop-api.co/cleanup/v1',
            files={
                'image_file': ('image.jpg', image_bytes, 'image/jpeg'),
                'mask_file': ('mask.png', mask, 'image/png')
            },
            data={'mode': 'quality'},
            headers={'x-api-key': CLIPDROP_API_KEY}
        )
        response.raise_for_status()
        return Response(response.content, mimetype='image/png')

    def handle_reimagine(image_bytes):
        """Reimagine endpoint implementation (no prompt needed)"""
        response = requests.post(
            'https://clipdrop-api.co/reimagine/v1/reimagine',
            files={'image_file': ('image.jpg', image_bytes, 'image/jpeg')},
            headers={'x-api-key': CLIPDROP_API_KEY}
        )
        response.raise_for_status()
        return Response(response.content, mimetype='image/png')

    def handle_inpainting(image_bytes):
        mask_file = request.files.get('mask')
        prompt = request.form.get('prompt')
        if not all([mask_file, prompt]):
            return jsonify({'success': False, 'error': 'Missing data'}), 400

        mask = ensure_grayscale_png(mask_file)
        response = requests.post(
            'https://clipdrop-api.co/text-inpainting/v1',
            files={
                'image_file': ('image.jpg', image_bytes, 'image/jpeg'),
                'mask_file': ('mask.png', mask, 'image/png')
            },
            data={'text_prompt': prompt},
            headers={'x-api-key': CLIPDROP_API_KEY}
        )
        response.raise_for_status()
        return Response(response.content, mimetype='image/jpeg')

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port)