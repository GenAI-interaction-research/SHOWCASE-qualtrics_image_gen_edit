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
import cloudinary
import cloudinary.uploader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

STYLE_PROMPTS = {
  "realistic": "hyper-realistic, 8k resolution, detailed textures, realistic lighting, photorealistic",
  "cyberpunk": "cyberpunk style, neon lights, futuristic cityscape, rain effects, cinematic lighting",
  "oilpainting": "oil painting texture, brush strokes visible, classical art style, canvas texture", 
  "anime": "anime style, vibrant colors, cel-shaded, studio ghibli aesthetic",
  "digitalart": "concept art, digital painting, trending on artstation, sharp details",
  "pixelart": "pixel art, 8-bit style, retro gaming aesthetics, low resolution"
}

def build_full_prompt(user_prompt, style=None):
  base_prompt = user_prompt.strip().rstrip(',. ')
  style_prompt = STYLE_PROMPTS.get(style, '')
  
  components = []
  if base_prompt:
      components.append(base_prompt)
  if style_prompt:
      components.append(style_prompt)
  
  components.append("high quality, professional, detailed")
  
  full_prompt = ', '.join(components)
  return full_prompt[:1000]

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
  CORS(app)

  # Initialize Cloudinary
  cloudinary.config( 
      cloud_name = "ddzia7e31",
      api_key = "368358624844357", 
      api_secret = "z*uvIY_xR93aIlq0OE00zKI8z8"
  )

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
          user_prompt = data.get('prompt')
          style = data.get('style', '')
          
          if not user_prompt:
              return jsonify({'success': False, 'error': 'No prompt provided'}), 400

          full_prompt = build_full_prompt(user_prompt, style if style else None)
          
          response = requests.post(
              'https://clipdrop-api.co/text-to-image/v1',
              files={'prompt': (None, full_prompt)},
              headers={'x-api-key': CLIPDROP_API_KEY}
          )
          response.raise_for_status()
          return Response(response.content, mimetype='image/png')

      except Exception as e:
          logger.error(f"Generation error: {str(e)}")
          return jsonify({'success': False, 'error': str(e)}), 500

  @app.route('/edit', methods=['POST'])
  def edit():
      try:
          image_data = request.form.get('image')
          edit_count = request.form.get('edit_count', 1)
          style = request.form.get('style', '')
          mode = request.form.get('mode', 'inpaint')

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
                               mode=mode)

      except Exception as e:
          logger.error(f"Edit error: {str(e)}")
          return jsonify({'success': False, 'error': str(e)}), 500

  @app.route('/direct-modification', methods=['POST'])
  def direct_modification():
      try:
          image_data = request.form.get('image')
          style = request.form.get('style', '')
          
          if not image_data:
              return jsonify({'success': False, 'error': 'No image data'}), 400
          
          if ',' in image_data:
              image_data = image_data.split(',')[1]
          
          image_bytes = BytesIO(base64.b64decode(image_data))
          mode = request.form.get('mode', 'inpaint')

          if mode == 'replacebg':
              return handle_replace_background(image_bytes, style)
          elif mode == 'cleanup':
              return handle_cleanup(image_bytes)
          elif mode == 'reimagine':
              return handle_reimagine(image_bytes)
          else:
              return handle_inpainting(image_bytes, style)

      except Exception as e:
          logger.error(f"Processing error: {str(e)}")
          return jsonify({'success': False, 'error': str(e)}), 500

  def handle_replace_background(image_bytes, style):
      user_prompt = request.form.get('prompt')
      if not user_prompt:
          return jsonify({'success': False, 'error': 'Missing background description'}), 400

      full_prompt = build_full_prompt(user_prompt, style)

      response = requests.post(
          'https://clipdrop-api.co/replace-background/v1',
          files={'image_file': ('image.jpg', image_bytes, 'image/jpeg')},
          data={'prompt': full_prompt},
          headers={'x-api-key': CLIPDROP_API_KEY}
      )
      response.raise_for_status()
      return Response(response.content, mimetype='image/png')

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
      response = requests.post(
          'https://clipdrop-api.co/reimagine/v1/reimagine',
          files={'image_file': ('image.jpg', image_bytes, 'image/jpeg')},
          headers={'x-api-key': CLIPDROP_API_KEY}
      )
      response.raise_for_status()
      return Response(response.content, mimetype='image/png')

  def handle_inpainting(image_bytes, style):
      mask_file = request.files.get('mask')
      user_prompt = request.form.get('prompt')
      if not all([mask_file, user_prompt]):
          return jsonify({'success': False, 'error': 'Missing data'}), 400

      full_prompt = build_full_prompt(user_prompt, style)
      mask = ensure_grayscale_png(mask_file)

      response = requests.post(
          'https://clipdrop-api.co/text-inpainting/v1',
          files={
              'image_file': ('image.jpg', image_bytes, 'image/jpeg'),
              'mask_file': ('mask.png', mask, 'image/png')
          },
          data={'text_prompt': full_prompt},
          headers={'x-api-key': CLIPDROP_API_KEY}
      )
      response.raise_for_status()
      return Response(response.content, mimetype='image/jpeg')

  @app.route('/save-final-image', methods=['POST'])
  def save_final_image():
      try:
          data = request.get_json()
          if not data or 'imageData' not in data or 'prolificId' not in data:
              return jsonify({'success': False, 'error': 'Missing data'}), 400

          image_data = data['imageData']
          prolific_id = data['prolificId']
          
          result = cloudinary.uploader.upload(
              image_data,
              folder="prolific_images",
              public_id=f"{prolific_id}",
              upload_preset="qualtrics_upload",
              resource_type="image",
              overwrite=True
          )

          return jsonify({
              'success': True,
              'url': result['secure_url']
          }), 200

      except Exception as e:
          logger.error(f"Save image error: {str(e)}")
          return jsonify({'success': False, 'error': str(e)}), 500

  return app

if __name__ == '__main__':
  app = create_app()
  port = int(os.getenv('PORT', 8080))
  logger.info(f"Starting server on port {port}")
  app.run(host='0.0.0.0', port=port)