from flask import Flask, request, jsonify, render_template, Response, session
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
import cloudinary
import cloudinary.uploader
from uuid import uuid4
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def build_full_prompt(user_prompt, style=None):
    return user_prompt.strip().rstrip(',. ')[:1000]

def ensure_grayscale_png(file_stream):
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
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
    app.wsgi_app = ProxyFix(app.wsgi_app)
    app.secret_key = os.getenv('SECRET_KEY', 'dev-key-123')
    
    CORS(app, supports_credentials=True, resources={
        r"/*": {
            "origins": [
                "https://survey.eu.qualtrics.com",
                "https://*.qualtrics.com",
                "https://eu.qualtrics.com",
                "https://emlyonbs.qualtrics.com",
                "http://localhost:5000"
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "expose_headers": ["Access-Control-Allow-Origin"],
            "supports_credentials": True,
            "max_age": 3600
        }
    })

    cloudinary.config( 
        cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME'),
        api_key = os.getenv('CLOUDINARY_API_KEY'),
        api_secret = os.getenv('CLOUDINARY_API_SECRET')
    )

    CLIPDROP_API_KEY = os.getenv('CLIPDROP_API_KEY')
    RECRAFT_API_KEY = os.getenv('RECRAFT_API_KEY')
    
    if not all([CLIPDROP_API_KEY, RECRAFT_API_KEY]):
        logger.error("Both CLIPDROP_API_KEY and RECRAFT_API_KEY are required")
        raise ValueError("Missing API keys")

    @app.route('/')
    def index():
        session_id = str(uuid4())
        logger.info(f"Generated new session ID: {session_id}")
        return render_template('generate.html', session_id=session_id)

    @app.route('/generate', methods=['POST'])
    def generate():
        try:
            data = request.get_json()
            user_prompt = data.get('prompt')
            style = data.get('style', '')
            
            if not user_prompt:
                return jsonify({'success': False, 'error': 'No prompt provided'}), 400

            response = requests.post(
                'https://external.api.recraft.ai/v1/images/generations',
                headers={'Authorization': f'Bearer {RECRAFT_API_KEY}'},
                json={
                    'prompt': user_prompt,
                    'model': 'recraftv3'
                }
            )
            response.raise_for_status()
            
            image_url = response.json()['data'][0]['url']
            image_response = requests.get(image_url)
            image_response.raise_for_status()
            
            return Response(image_response.content, mimetype='image/png')
        except Exception as e:
            logger.error(f"Generation error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/edit', methods=['POST'])
    def edit():
        try:
            image_data = request.form.get('image')
            edit_count = request.form.get('edit_count', 1)
            style = request.form.get('style', '')
            mode = request.form.get('mode', '')
            session_id = request.form.get('session_id', '')
            
            logger.info(f"Edit route received session_id: {session_id}")

            if not image_data:
                return jsonify({'success': False, 'error': 'No image data provided'}), 400

            try:
                edit_count = int(edit_count)
            except ValueError:
                edit_count = 1

            return render_template('edit.html',
                                image_data=image_data,
                                edit_count=edit_count,
                                style=style,
                                mode=mode,
                                session_id=session_id)

        except Exception as e:
            logger.error(f"Edit error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/direct-modification', methods=['POST'])
    def direct_modification():
        try:
            logger.info("Received direct-modification request")
            prolific_id = request.headers.get('X-PROLIFIC-PID')
            logger.info(f"Prolific ID: {prolific_id}")
            
            # Log request data
            logger.info(f"Form data keys: {list(request.form.keys())}")
            logger.info(f"Files keys: {list(request.files.keys())}")
            logger.info(f"Mode: {request.form.get('mode', 'not provided')}")
            
            image_data = request.form.get('image')
            if not image_data:
                logger.error("No image data received")
                return jsonify({'success': False, 'error': 'No image data'}), 400
            
            logger.info(f"Image data length: {len(image_data) if image_data else 0}")
            
            try:
                # Handle base64 data URL format
                if ',' in image_data:
                    logger.info("Splitting base64 data URL")
                    image_data = image_data.split(',')[1]
                
                # Decode base64 and ensure PNG format
                logger.info("Decoding base64 data")
                image_bytes = BytesIO(base64.b64decode(image_data))
                logger.info("Opening image with PIL")
                img = Image.open(image_bytes)
                logger.info(f"Image format: {img.format}, Size: {img.size}")
                png_bytes = BytesIO()
                logger.info("Converting to PNG")
                img.save(png_bytes, format='PNG')
                png_bytes.seek(0)
                
                mode = request.form.get('mode', 'inpaint')
                logger.info(f"Processing image with mode: {mode}")

                if mode == 'replacebg':
                    return handle_replace_background(png_bytes)
                elif mode == 'cleanup':
                    return handle_cleanup(png_bytes)
                elif mode == 'reimagine':
                    return handle_reimagine(png_bytes)
                else:
                    return handle_inpainting(png_bytes)
            except Exception as e:
                logger.error(f"Image processing error: {str(e)}")
                return jsonify({'success': False, 'error': f"Image processing error: {str(e)}"}), 500
                
        except Exception as e:
            logger.error(f"Processing error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def handle_replace_background(image_bytes):
        logger.info("Starting replace background operation")
        user_prompt = request.form.get('prompt')
        if not user_prompt:
            logger.error("Missing background description")
            return jsonify({'success': False, 'error': 'Missing background description'}), 400
        
        logger.info(f"Prompt: {user_prompt}")
        full_prompt = build_full_prompt(user_prompt)
        
        try:
            logger.info("Sending request to ClipDrop API")
            response = requests.post(
                'https://clipdrop-api.co/replace-background/v1',
                files={'image_file': ('image.png', image_bytes, 'image/png')},
                data={'prompt': full_prompt},
                headers={'x-api-key': CLIPDROP_API_KEY}
            )
            logger.info(f"ClipDrop API response status: {response.status_code}")
            response.raise_for_status()
            return Response(response.content, mimetype='image/png')
        except requests.exceptions.RequestException as e:
            logger.error(f"ClipDrop API error (replace-background): {str(e)}")
            return jsonify({'success': False, 'error': f"API error: {str(e)}"}), 500

    def handle_cleanup(image_bytes):
        logger.info("Starting cleanup operation")
        mask_file = request.files.get('mask')
        if not mask_file:
            logger.error("Missing mask file")
            return jsonify({'success': False, 'error': 'Missing mask'}), 400
        
        try:
            logger.info("Processing mask file")
            mask = ensure_grayscale_png(mask_file)
            
            logger.info("Sending request to ClipDrop API")
            response = requests.post(
                'https://clipdrop-api.co/cleanup/v1',
                files={
                    'image_file': ('image.png', image_bytes, 'image/png'),
                    'mask_file': ('mask.png', mask, 'image/png')
                },
                data={'mode': 'quality'},
                headers={'x-api-key': CLIPDROP_API_KEY}
            )
            logger.info(f"ClipDrop API response status: {response.status_code}")
            response.raise_for_status()
            return Response(response.content, mimetype='image/png')
        except requests.exceptions.RequestException as e:
            logger.error(f"ClipDrop API error (cleanup): {str(e)}")
            return jsonify({'success': False, 'error': f"API error: {str(e)}"}), 500

    def handle_reimagine(image_bytes):
        logger.info("Starting reimagine operation")
        try:
            logger.info("Sending request to ClipDrop API")
            response = requests.post(
                'https://clipdrop-api.co/reimagine/v1/reimagine',
                files={'image_file': ('image.png', image_bytes, 'image/png')},
                headers={'x-api-key': CLIPDROP_API_KEY}
            )
            logger.info(f"ClipDrop API response status: {response.status_code}")
            response.raise_for_status()
            return Response(response.content, mimetype='image/png')
        except requests.exceptions.RequestException as e:
            logger.error(f"ClipDrop API error (reimagine): {str(e)}")
            return jsonify({'success': False, 'error': f"API error: {str(e)}"}), 500

    def handle_inpainting(image_bytes):
        logger.info("Starting inpainting operation")
        mask_file = request.files.get('mask')
        user_prompt = request.form.get('prompt')
        if not all([mask_file, user_prompt]):
            logger.error(f"Missing data. Mask: {bool(mask_file)}, Prompt: {bool(user_prompt)}")
            return jsonify({'success': False, 'error': 'Missing data'}), 400
        
        try:
            logger.info(f"Prompt: {user_prompt}")
            full_prompt = build_full_prompt(user_prompt)
            logger.info("Processing mask file")
            mask = ensure_grayscale_png(mask_file)
            
            logger.info("Sending request to ClipDrop API")
            response = requests.post(
                'https://clipdrop-api.co/text-inpainting/v1',
                files={
                    'image_file': ('image.png', image_bytes, 'image/png'),
                    'mask_file': ('mask.png', mask, 'image/png')
                },
                data={'text_prompt': full_prompt},
                headers={'x-api-key': CLIPDROP_API_KEY}
            )
            logger.info(f"ClipDrop API response status: {response.status_code}")
            response.raise_for_status()
            return Response(response.content, mimetype='image/png')
        except requests.exceptions.RequestException as e:
            logger.error(f"ClipDrop API error (inpainting): {str(e)}")
            return jsonify({'success': False, 'error': f"API error: {str(e)}"}), 500

    @app.route('/set-prolific-id', methods=['POST'])
    def set_prolific_id():
        try:
            data = request.get_json()
            if not data or 'prolific_id' not in data:
                return jsonify({'success': False, 'error': 'Missing PROLIFIC_ID'}), 400
            
            session['PROLIFIC_PID'] = data['prolific_id']
            logger.info(f"Stored PROLIFIC_PID in session: {data['prolific_id']}")
            return jsonify({'success': True}), 200
        except Exception as e:
            logger.error(f"Error storing PROLIFIC_PID: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/check-prolific-id', methods=['GET'])
    def check_prolific_id():
        prolific_id = session.get('PROLIFIC_PID', '')
        logger.info(f"Checking PROLIFIC_PID in session: {prolific_id}")
        return jsonify({
            'success': True,
            'prolific_id': prolific_id
        })

    @app.route('/save-final-image', methods=['POST'])
    def save_final_image():
        try:
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'error': 'No data provided'}), 400

            image_data = data.get('image')
            session_id = data.get('session_id')

            if not image_data:
                return jsonify({'success': False, 'error': 'No image data provided'}), 400
            if not session_id:
                return jsonify({'success': False, 'error': 'No session ID provided'}), 400

            image_data = image_data.split(',')[1]
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            public_id = f"qualtrics_images/{session_id}_{timestamp}"
            
            logger.info(f"Uploading image for session ID: {session_id}")
            
            upload_result = cloudinary.uploader.upload(
                f"data:image/jpeg;base64,{image_data}",
                public_id=public_id,
                tags=[session_id]
            )

            logger.info(f"Upload successful. URL: {upload_result['secure_url']}")
            return jsonify({
                'success': True,
                'url': upload_result['secure_url'],
                'public_id': upload_result['public_id']
            })

        except Exception as e:
            logger.error(f"Error saving image: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port)