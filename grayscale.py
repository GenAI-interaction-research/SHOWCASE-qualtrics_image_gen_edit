from PIL import Image
import os

def ensure_grayscale(input_path, output_path=None):
    # If no output path specified, create one
    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_grayscale{ext}"
    
    # Open the image
    with Image.open(input_path) as img:
        # Print original image info
        print(f"Original image mode: {img.mode}")
        print(f"Original image size: {img.size}")
        print(f"Original image format: {img.format}")
        
        # Convert to grayscale ('L' mode)
        grayscale = img.convert('L')
        
        # Save with specific parameters for PNG
        grayscale.save(output_path, 'PNG', optimize=False)
        print(f"\nSaved grayscale image to: {output_path}")
        
        # Verify the saved image
        with Image.open(output_path) as verified:
            print(f"Verified image mode: {verified.mode}")
            print(f"Verified image size: {verified.size}")
            print(f"Verified image format: {verified.format}")

if __name__ == "__main__":
    # Path to your mask
    input_mask = r"C:\Users\joerling\OneDrive - Aescra Emlyon Business School\Desktop\download (1).png"
    output_mask = r"C:\Users\joerling\OneDrive - Aescra Emlyon Business School\Desktop\mask_grayscale.png"
    
    ensure_grayscale(input_mask, output_mask)