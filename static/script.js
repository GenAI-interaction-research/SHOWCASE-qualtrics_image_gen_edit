let canvas;

// Global current edit count variable
let currentEditCount;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Fabric canvas
    canvas = new fabric.Canvas('canvas');

    // Set canvas display size based on container
    const container = document.querySelector('.canvas-container');
    const containerWidth = container.clientWidth;
    
    // Set both display and internal size to 1024x1024
    canvas.setWidth(containerWidth);
    canvas.setHeight(containerWidth);
    canvas.setDimensions({
        width: 1024,
        height: 1024
    }, { backstoreOnly: true });

    try {
        // Load and display the original image
        const img = await loadImage(originalImageUrl);
        const fabricImage = new fabric.Image(img);

        // Calculate scale to fit the image properly
        const scaleX = 1024 / fabricImage.width;
        const scaleY = 1024 / fabricImage.height;
        const scale = Math.min(scaleX, scaleY);

        fabricImage.set({
            scaleX: scale,
            scaleY: scale,
            left: (1024 - fabricImage.width * scale) / 2,
            top: (1024 - fabricImage.height * scale) / 2,
            selectable: false,
            evented: false
        });

        canvas.add(fabricImage);
        canvas.renderAll();

        // Setup drawing brush
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = 30;
        canvas.freeDrawingBrush.color = 'rgba(255, 255, 255, 0.5)';

        // Set up event listeners
        document.getElementById('drawButton').addEventListener('click', toggleDrawing);
        document.getElementById('clearButton').addEventListener('click', clearDrawing);
        document.getElementById('brushSize').addEventListener('input', updateBrushSize);
        document.getElementById('applyEditButton').addEventListener('click', submitEdit);

    } catch (error) {
        console.error('Error loading image:', error);
        showError('Error loading image. Please try again.');
    }
});

async function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `/proxy-image?url=${encodeURIComponent(url)}`;
    });
}

function toggleDrawing() {
    canvas.isDrawingMode = !canvas.isDrawingMode;
    const button = document.getElementById('drawButton');
    button.textContent = canvas.isDrawingMode ? 'Finish Drawing' : 'Draw Selection';
    button.classList.toggle('bg-green-600');
}

function clearDrawing() {
    const objects = canvas.getObjects();
    for (let i = objects.length - 1; i > 0; i--) {
        canvas.remove(objects[i]);
    }
    canvas.renderAll();
    clearMaskPreviews();
}

function clearMaskPreviews() {
    const existingPreviews = document.querySelectorAll('.mask-preview-container');
    existingPreviews.forEach(preview => preview.remove());
}

function updateBrushSize(e) {
    const size = parseInt(e.target.value);
    canvas.freeDrawingBrush.width = size;
}

async function createMaskFromCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1024;
    tempCanvas.height = 1024;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    
    // Fill with pure black background
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Set up for pure white drawing
    ctx.strokeStyle = 'rgb(255, 255, 255)';
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calculate scale factor between display canvas and output canvas
    const scaleFactor = 1024 / canvas.width;
    
    // Draw each path
    const paths = canvas.getObjects().slice(1);
    paths.forEach(path => {
        if (path.type === 'path' && path.path) {
            // Scale the line width
            ctx.lineWidth = path.strokeWidth * scaleFactor;
            
            ctx.beginPath();
            
            // Transform and draw the path
            path.path.forEach((point, index) => {
                // Get coordinates
                const x = point[1] * scaleFactor;
                const y = point[2] * scaleFactor;
                
                if (point[0] === 'M') {
                    ctx.moveTo(x, y);
                } else if (point[0] === 'L') {
                    ctx.lineTo(x, y);
                } else if (point[0] === 'Q') {
                    const controlX = point[1] * scaleFactor;
                    const controlY = point[2] * scaleFactor;
                    const endX = point[3] * scaleFactor;
                    const endY = point[4] * scaleFactor;
                    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
                }
            });
            
            ctx.stroke();
        }
    });

    // Convert to grayscale and ensure binary values
    const imageData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        // Average the RGB values and threshold
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const value = avg > 127 ? 255 : 0;
        
        // Set all channels to the same value
        data[i] = value;     // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = 255;   // A (full opacity)
    }
    
    ctx.putImageData(imageData, 0, 0);

    // Return as PNG blob without showing preview
    return new Promise(resolve => {
        tempCanvas.toBlob(blob => {
            console.log('Creating mask blob');
            console.log('Mask blob type:', blob.type);
            console.log('Mask blob size:', blob.size);
            resolve(blob);
        }, 'image/png', { quality: 1 });
    });
}

async function submitEdit() {
    const promptText = document.getElementById('prompt').value.trim();

    if (!promptText) {
        showError('Please enter a prompt.');
        return;
    }

    if (canvas.getObjects().length <= 1) {
        showError('Please draw a selection area first.');
        return;
    }

    const applyEditButton = document.getElementById('applyEditButton');
    const errorDiv = document.getElementById('error');
    const resultDiv = document.getElementById('result');
    const editedImage = document.getElementById('editedImage');
    const spinner = document.getElementById('spinner');

    try {
        applyEditButton.disabled = true;
        applyEditButton.textContent = 'Processing...';
        errorDiv.classList.add('hidden');
        spinner.style.display = 'block';

        const maskBlob = await createMaskFromCanvas();
        
        // Get the original image
        const response = await fetch(`/proxy-image?url=${encodeURIComponent(originalImageUrl)}`);
        if (!response.ok) throw new Error('Failed to fetch original image');
        
        const imageBlob = await response.blob();
        console.log('Original image type:', imageBlob.type);
        console.log('Original image size:', imageBlob.size);

        const formData = new FormData();
        formData.append('prompt', promptText);
        formData.append('image', imageBlob, 'image.png');
        formData.append('mask', maskBlob, 'mask.png');
        formData.append('model', 'recraftv3');
        formData.append('style', 'realistic_image');

        const apiResponse = await fetch('/direct-modification', {
            method: 'POST',
            body: formData
        });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            throw new Error(errorData.error || 'Failed to process edit');
        }

        const result = await apiResponse.json();
        if (result.success) {
            // Get current edit count from the template variable
            const nextEditCount = currentEditCount + 1;
            window.location.href = `/edit?url=${encodeURIComponent(result.image_url)}&count=${nextEditCount}`;
        } else {
            throw new Error(result.error || 'Failed to process edit');
        }

    } catch (err) {
        console.error('Edit error:', err);
        showError(err.message);
    } finally {
        applyEditButton.disabled = false;
        applyEditButton.textContent = 'Apply Changes';
        spinner.style.display = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

// Add event listener for Qualtrics button if it exists
document.addEventListener('DOMContentLoaded', () => {
    const qualtricsButton = document.getElementById('qualtricsButton');
    if (qualtricsButton) {
        qualtricsButton.addEventListener('click', (e) => {
            e.preventDefault();
            // Replace this URL with the actual Qualtrics survey URL when available
            window.location.href = 'https://placeholder-qualtrics-survey-url.com';
        });
    }
});