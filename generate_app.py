from flask import Blueprint, request, jsonify, render_template
import logging

logger = logging.getLogger(__name__)

def create_generate_app(recraft_client):
    generate_app = Blueprint('generate', __name__)
    
    @generate_app.route('/')
    def home():
        return render_template('generate.html')

    @generate_app.route('/generate-image', methods=['POST'])
    def generate_image():
        try:
            data = request.get_json()
            
            if not data or 'prompt' not in data:
                return jsonify({'success': False, 'error': 'No prompt provided'})

            prompt = data['prompt']
            style = data.get('style', 'realistic_image')
            size = data.get('size', '1024x1024')

            logger.info(f"Generating image with prompt: {prompt}, style: {style}, size: {size}")
            
            response = recraft_client.post(
                "/images/generations",
                json={
                    "model": "recraftv3",
                    "prompt": prompt,
                    "style": style,
                    "size": size,
                    "n": 1
                }
            )
            
            response_data = response.json()
            if not response_data.get('data'):
                raise ValueError("No image data in response")
                
            image_url = response_data['data'][0]['url']
            logger.info(f"Image generated successfully: {image_url}")
            
            return jsonify({
                'success': True,
                'image_url': image_url
            })

        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'success': False, 'error': str(e)})
            
    return generate_app