from openai import OpenAI
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key from environment
RECRAFT_API_TOKEN = os.getenv('RECRAFT_API_TOKEN')
if not RECRAFT_API_TOKEN:
    raise ValueError("Please set RECRAFT_API_TOKEN in your .env file")

# File paths
IMAGE_PATH = r"C:\Users\joerling\OneDrive - Aescra Emlyon Business School\Desktop\949b73ff-ce9f-402a-b627-5119ccc7bfe9.png"
MASK_PATH = r"C:\Users\joerling\OneDrive - Aescra Emlyon Business School\Desktop\mask_grayscale.png"  # Using the new grayscale mask

# Initialize the client
client = OpenAI(
    base_url='https://external.api.recraft.ai/v1',
    api_key=RECRAFT_API_TOKEN
)

def test_inpainting():
    try:
        print("\nStarting inpainting test with converted grayscale mask...")
        
        # Verify files exist
        for path, name in [(IMAGE_PATH, 'Original image'), (MASK_PATH, 'Mask')]:
            if not os.path.exists(path):
                raise FileNotFoundError(f"Could not find {name} at {path}")
            print(f"{name} found: {path}")
            print(f"{name} size: {os.path.getsize(path)} bytes")

        print("\nMaking API request...")
        
        with open(IMAGE_PATH, 'rb') as image_file, open(MASK_PATH, 'rb') as mask_file:
            response = client.post(
                path='/images/inpaint',
                cast_to=object,
                options={'headers': {'Content-Type': 'multipart/form-data'}},
                files={
                    'image': ('image.png', image_file, 'image/png'),
                    'mask': ('mask.png', mask_file, 'image/png')
                },
                body={
                    'prompt': 'add birds',
                    'model': 'recraftv3',
                    'style': 'realistic_image'  # Adding explicit style
                }
            )
            
            print('\nAPI Response type:', type(response))
            print('\nFull Response:', response)
            
            # Handle different response types
            if hasattr(response, 'data'):
                print('\nResponse data:', response.data)
            elif isinstance(response, dict):
                if 'data' in response:
                    print('\nSuccess! Generated image URL:', response['data'][0]['url'])
                else:
                    print('\nResponse content:', response)
            else:
                print('\nFull response:', response)

    except Exception as e:
        print('\nError occurred:')
        print(str(e))
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_inpainting()