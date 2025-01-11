from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import logging
from openai import OpenAI
import traceback
from edit_app import create_edit_app

# Set up logging at module level
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    # Load environment variables
    load_dotenv()
    app = Flask(__name__)

    # Configure CORS
    CORS(app, resources={
        r"/*": {
            "origins": [
                "https://emlyonbs.eu.qualtrics.com"
            ],
            "methods": [
                "POST", "OPTIONS"
            ],
            "allow_headers": [
                "Content-Type", "Origin", "Accept"
            ],
            "supports_credentials": True,
            "expose_headers": [
                "Content-Type"
            ]
        }
    })

    # Setup Recraft client
    RECRAFT_API_TOKEN = os.getenv('RECRAFT_API_TOKEN')
    if not RECRAFT_API_TOKEN:
        logger.error("No Recraft API token found")
        raise ValueError("RECRAFT_API_TOKEN environment variable is required")

    logger.info("Initializing Recraft client...")
    try:
        recraft_client = OpenAI(
            api_key=RECRAFT_API_TOKEN,
            base_url='https://external.api.recraft.ai/v1'
        )
        logger.info("Recraft client initialized successfully")
        
        # Register the edit Blueprint with the initialized client
        edit_blueprint = create_edit_app(recraft_client)
        app.register_blueprint(edit_blueprint)
        logger.info("Edit Blueprint registered successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize Recraft client: {str(e)}")
        logger.error(traceback.format_exc())
        raise e

    @app.route('/')
    def home():
        return jsonify({
            'status': 'healthy',
            'message': 'Welcome to the Recraft Image Service'
        })

    @app.route('/health', methods=['GET', 'OPTIONS'])
    def health_check():
        if request.method == 'OPTIONS':
            return '', 204
        return jsonify({
            'status': 'healthy', 
            'message': 'Service is running'
        })

    @app.route('/generate-image', methods=['POST', 'OPTIONS'])
    def generate_image():
        if request.method == 'OPTIONS':
            return '', 204

        try:
            logger.info("Received generate-image request")
            data = request.get_json()
            logger.info(f"Request data: {data}")
            
            if not data or 'prompt' not in data:
                logger.error("No prompt in request data")
                return jsonify({
                    'success': False,
                    'error': 'No prompt provided'
                }), 400

            prompt = data['prompt']
            style = data.get('style', 'realistic_image')
            size = data.get('size', '1024x1024')
            
            logger.info(f"Processing prompt: {prompt}, style: {style}")

            try:
                logger.info(f"Making request to Recraft API with params: {prompt}, {style}, {size}")
                response = recraft_client.images.generate(
                    model="recraftv3",
                    prompt=prompt,
                    style=style,
                    size=size,
                    n=1
                )
                logger.info(f"Raw API response: {response}")
                
                if not response.data:
                    raise ValueError("No image data in response")
                    
                image_url = response.data[0].url
                logger.info(f"Generated image URL: {image_url}")
                
                return jsonify({
                    'success': True,
                    'image_url': image_url
                })

            except Exception as api_error:
                logger.error(f"API error: {str(api_error)}")
                logger.error(traceback.format_exc())
                return jsonify({
                    'success': False,
                    'error': f'API error: {str(api_error)}'
                }), 500

        except Exception as e:
            logger.error(f"Server error: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({
                'success': False,
                'error': f'Server error: {str(e)}'
            }), 500

    @app.errorhandler(404)
    def not_found_error(error):
        return jsonify({'error': 'Not Found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal Server Error'}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port)