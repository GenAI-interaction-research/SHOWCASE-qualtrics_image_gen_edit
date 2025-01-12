from flask import Blueprint, request, jsonify, render_template, Response
import logging
import requests
from io import BytesIO
from PIL import Image

logger = logging.getLogger(__name__)

def ensure_grayscale_png(file_stream):
    # Read the image data
    img = Image.open(file_stream)
    # Convert to grayscale
    grayscale = img.convert('L')
    # Save to a new BytesIO object
    output = BytesIO()
    grayscale.save(output, format='PNG')
    output.seek(0)
    return output

def create_edit_app(recraft_client):
    edit_app = Blueprint('edit', __name__, static_folder='static')

    @edit_app.route('/')
    def edit():
        image_url = request.args.get('url')
        if not image_url:
            return "No image URL provided", 400
        return render_template('edit.html', image_url=image_url)

    @edit_app.route('/proxy-image', methods=['GET'])
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

    @edit_app.route('/direct-modification', methods=['POST'])
    def direct_modification():
        try:
            # Get the files and data from form data
            mask_file = request.files.get('mask')
            image_url = request.form.get('image_url')
            prompt = request.form.get('prompt')
            
            if not mask_file or not image_url or not prompt:
                return jsonify({'success': False, 'error': 'Missing required files or prompt'})

            logger.info(f"Processing inpainting request with prompt: {prompt}")

            # Download the original image
            try:
                response = requests.get(image_url, stream=True)
                response.raise_for_status()
                image_data = BytesIO(response.content)
            except Exception as e:
                logger.error(f"Error downloading image: {str(e)}")
                return jsonify({'success': False, 'error': f'Failed to download image: {str(e)}'})

            # Convert mask to proper grayscale PNG
            mask_grayscale = ensure_grayscale_png(mask_file)
            
            # Convert image to PNG
            with Image.open(image_data) as img:
                image_output = BytesIO()
                img.save(image_output, format='PNG')
                image_output.seek(0)

            # Make the API request
            try:
                response = recraft_client.post(
                    path='/images/inpaint',
                    cast_to=dict,
                    options={'headers': {'Content-Type': 'multipart/form-data'}},
                    files={
                        'image': ('image.png', image_output, 'image/png'),
                        'mask': ('mask.png', mask_grayscale, 'image/png')
                    },
                    body={
                        'prompt': prompt,
                        'model': 'recraftv3',
                        'style': 'realistic_image',
                        'n': 1,
                        'response_format': 'url'
                    }
                )
                
                logger.info(f"Raw API response: {response}")
                
                # Check if response is valid and has data
                if not response or 'data' not in response:
                    logger.error("Empty response or no data from API")
                    return jsonify({
                        'success': False,
                        'error': 'Empty response or no data from API'
                    })
                
                # Extract URL from response
                try:
                    image_url = response['data'][0]['url']
                    if image_url:
                        logger.info(f"Successfully got image URL: {image_url}")
                        return jsonify({
                            'success': True,
                            'image_url': image_url
                        })
                    else:
                        logger.error("No URL in response data")
                        return jsonify({
                            'success': False,
                            'error': 'No URL in response data'
                        })
                except (KeyError, IndexError) as e:
                    logger.error(f"Error extracting URL from response: {str(e)}")
                    return jsonify({
                        'success': False,
                        'error': f'Error extracting URL from response: {str(e)}'
                    })
                
            except Exception as e:
                logger.error(f"Recraft API error: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': f'API error: {str(e)}'
                })

        except Exception as e:
            logger.error(f"Server error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)})

    return edit_app