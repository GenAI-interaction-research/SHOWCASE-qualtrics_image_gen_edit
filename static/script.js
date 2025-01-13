let paths = [];  // Array to store all paths
let isDrawing = false;
let raster;

// Global current edit count variable
let currentEditCount;

document.addEventListener('DOMContentLoaded', async () => {
    // Set up Paper.js
    paper.setup('canvas');
    
    // Set canvas display size based on container
    const container = document.querySelector('.canvas-container');
    const containerWidth = Math.min(container.clientWidth, 800); // Max width of 800px
    
    // Set both display size
    paper.view.viewSize = new paper.Size(containerWidth, containerWidth);
    
    try {
        // Load and display the original image
        const img = await loadImage(originalImageUrl);
        raster = new paper.Raster(img);
        
        // Calculate scale to fit the image properly
        const scale = Math.min(containerWidth / img.width, containerWidth / img.height);
        
        raster.scale(scale);
        raster.position = paper.view.center;

        // Set up selection tool
        const tool = new paper.Tool();
        
        tool.onMouseDown = (event) => {
            if (!isDrawing) {
                isDrawing = true;
                // Create a new path with dashed stroke
                path = new paper.Path({
                    segments: [event.point],
                    strokeColor: 'white',
                    strokeWidth: 2,
                    dashArray: [5, 5], // Create dashed line effect
                    fillColor: new paper.Color(1, 1, 1, 0.2)
                });
                paths.push(path);  // Add new path to array
            }
        };
        
        tool.onMouseDrag = (event) => {
            if (isDrawing) {
                // Get the actual canvas element
                const canvas = document.getElementById('canvas');
                // Get canvas bounds
                const bounds = canvas.getBoundingClientRect();
                
                // Calculate the scaled point
                const x = (event.event.clientX - bounds.left) * (canvas.width / bounds.width);
                const y = (event.event.clientY - bounds.top) * (canvas.height / bounds.height);
                
                // Add point to create continuous line
                path.add(new paper.Point(x, y));
            }
        };
        
        tool.onMouseUp = (event) => {
            if (isDrawing) {
                // Close the path to create a complete selection
                path.closed = true;
                isDrawing = false;
            }
        };

        // Set up event listeners
        document.getElementById('lassoButton').addEventListener('click', toggleDrawing);
        document.getElementById('clearButton').addEventListener('click', clearSelection);
        document.getElementById('applyEditButton').addEventListener('click', submitEdit);

    } catch (error) {
        console.error('Error loading image:', error);
        showError('Error loading image. Please try again.');
    }
});

function toggleDrawing() {
    const button = document.getElementById('lassoButton');
    if (isDrawing) {
        isDrawing = false;
        if (path) {
            path.closed = true;
        }
        button.textContent = 'Draw Selection';
    } else {
        button.textContent = 'Finish Selection';
    }
    button.classList.toggle('bg-green-600');
}

function clearSelection() {
    // Remove all paths from canvas
    paths.forEach(p => p.remove());
    paths = [];  // Clear the array
    path = null; // Reset current path
    paper.view.update();
}

async function createMaskFromCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1024;
    tempCanvas.height = 1024;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    
    // Fill with pure black background
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Draw all paths
    if (paths.length > 0) {
        // Set up for pure white drawing
        ctx.fillStyle = 'rgb(255, 255, 255)';
        
        // Scale the path points to 1024x1024
        const scaleFactor = 1024 / paper.view.viewSize.width;
        
        paths.forEach(path => {
            ctx.beginPath();
            path.segments.forEach((segment, index) => {
                const x = segment.point.x * scaleFactor;
                const y = segment.point.y * scaleFactor;
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.closePath();
            ctx.fill();
        });
    }

    // Convert to grayscale and ensure binary values
    const imageData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const value = avg > 127 ? 255 : 0;
        
        data[i] = value;     // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = 255;   // A
    }
    
    ctx.putImageData(imageData, 0, 0);

    return new Promise(resolve => {
        tempCanvas.toBlob(blob => {
            resolve(blob);
        }, 'image/png', { quality: 1 });
    });
}

async function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `/proxy-image?url=${encodeURIComponent(url)}`;
    });
}

async function submitEdit() {
    const prompt = document.getElementById('prompt').value.trim();
    const style = document.getElementById('style').value;
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
        
        // Create form data with mask, prompt, and style
        const formData = new FormData();
        formData.append('image', await fetch(originalImageUrl).then(r => r.blob()));
        formData.append('mask', maskBlob);
        formData.append('prompt', prompt);
        formData.append('style', style);
        formData.append('model', 'recraftv3');

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
            // Get current edit count and redirect to new edit page
            const nextEditCount = window.editCount + 1;
            // Pass the current image as previous_url for potential undo
            window.location.href = `/edit?url=${encodeURIComponent(result.image_url)}&count=${nextEditCount}&previous_url=${encodeURIComponent(window.originalImageUrl)}`;
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
            
            // Get the current image URL
            const finalImageUrl = window.originalImageUrl;
            
            // Prepare the data for Qualtrics
            const qualtricsData = {
                final_image: finalImageUrl,
                edit_count: window.editCount,
                PROLIFIC_PID: window.prolificId  // Include Prolific ID
            };

            // Construct the return URL with data
            // Note: Replace 'YOUR_QUALTRICS_URL' with the actual survey URL
            const baseUrl = 'YOUR_QUALTRICS_URL';
            const params = new URLSearchParams(qualtricsData);

            // Redirect back to Qualtrics with the data
            window.location.href = `${baseUrl}?${params.toString()}`;
        });
    }
});

// Add event listener for undo button
document.addEventListener('DOMContentLoaded', () => {
    const undoButton = document.getElementById('undoButton');
    if (undoButton && window.previousImageUrl) {
        undoButton.addEventListener('click', () => {
            // Redirect to previous image, incrementing the edit count as it's a new edit
            const nextEditCount = window.editCount + 1;
            window.location.href = `/edit?url=${encodeURIComponent(window.previousImageUrl)}&count=${nextEditCount}`;
        });
    }
});