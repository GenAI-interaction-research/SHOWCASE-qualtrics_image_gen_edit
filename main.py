from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS
import logging
from openai import OpenAI
import os
from dotenv import load_dotenv
from PIL import Image
from io import BytesIO
import requests

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
    app = Flask(__name__)
    
    # Configure CORS
    CORS(app)

    # Setup Recraft client
    RECRAFT_API_TOKEN = os.getenv('RECRAFT_API_TOKEN')
    if not RECRAFT_API_TOKEN:
        logger.error("No Recraft API token found")
        raise ValueError("RECRAFT_API_TOKEN environment variable is required")

    recraft_client = OpenAI(
        api_key=RECRAFT_API_TOKEN,
        base_url='https://external.api.recraft.ai/v1'
    )

    # Generation routes
    @app.route('/generate')
    def generate_page():
        return render_template('generate.html')

    @app.route('/generate-image', methods=['POST'])
    def generate_image():
        try:
            data = request.get_json()
            if not data or 'prompt' not in data:
                return jsonify({'success': False, 'error': 'No prompt provided'})

            prompt = data['prompt']
            style = data.get('style', 'realistic_image')
            size = data.get('size', '1024x1024')

            logger.info(f"Generating image with prompt: {prompt}, style: {style}")
            
            response = recraft_client.images.generate(
                prompt=prompt,
                style=style
            )
            
            if not response.data:
                raise ValueError("No image data in response")
                
            image_url = response.data[0].url
            logger.info(f"Image generated successfully: {image_url}")
            
            return jsonify({
                'success': True,
                'image_url': image_url
            })
        except Exception as e:
            logger.error(f"Error generating image: {str(e)}")
            return jsonify({'success': False, 'error': str(e)})

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

            # Make the API request
            try:
                logger.info("Preparing to call Recraft API for inpainting")
                
                response = recraft_client.post(
                    path='/images/inpaint',
                    cast_to=object,
                    options={'headers': {'Content-Type': 'multipart/form-data'}},
                    files={
                        'image': image_output,
                        'mask': mask_grayscale
                    },
                    body={
                        'prompt': prompt
                    }
                )
                
                logger.info(f"Raw API response: {response}")
                
                edited_image_url = response['data'][0]['url']
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

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)