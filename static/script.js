let paths = [];  // Array to store all paths
let isDrawing = false;
let raster;
let path;

document.addEventListener('DOMContentLoaded', async () => {
    // Set up Paper.js
    paper.setup('canvas');
    
    // Set canvas display size based on container
    const container = document.querySelector('.canvas-container');
    const containerWidth = Math.min(container.clientWidth, 800); // Max width of 800px
    
    // Set both display size
    paper.view.viewSize = new paper.Size(containerWidth, containerWidth);
    
    try {
        // Get the image data from the template
        const imageData = window.imageData;
        
        // Create an image element
        const img = new Image();
        img.onload = function() {
            // Create raster once image is loaded
            raster = new paper.Raster(img);
            
            // Calculate scale to fit the image properly
            const scale = Math.min(containerWidth / img.width, containerWidth / img.height);
            
            raster.scale(scale);
            raster.position = paper.view.center;
        };
        img.src = imageData;

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
                // Add point to create continuous line
                path.add(event.point);
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

        // Set up tab handling
        const tabs = document.querySelectorAll('[data-mode]');
        const promptSection = document.getElementById('promptSection');
        const cleanupSection = document.getElementById('cleanupSection');
        const inpaintInstructions = document.getElementById('inpaintInstructions');
        const cleanupInstructions = document.getElementById('cleanupInstructions');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active classes from all tabs
                tabs.forEach(t => {
                    t.classList.remove('border-blue-500', 'text-blue-600');
                    t.classList.add('border-transparent', 'text-gray-500');
                });
                
                // Add active classes to clicked tab
                tab.classList.remove('border-transparent', 'text-gray-500');
                tab.classList.add('border-blue-500', 'text-blue-600');

                // Show/hide sections based on selected tab
                const mode = tab.dataset.mode;
                if (mode === 'cleanup') {
                    promptSection.classList.add('hidden');
                    cleanupSection.classList.remove('hidden');
                    inpaintInstructions.classList.add('hidden');
                    cleanupInstructions.classList.remove('hidden');
                } else {
                    promptSection.classList.remove('hidden');
                    cleanupSection.classList.add('hidden');
                    inpaintInstructions.classList.remove('hidden');
                    cleanupInstructions.classList.add('hidden');
                }
            });
        });

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
        button.classList.remove('bg-green-600');
        button.classList.add('bg-blue-600');
    } else {
        button.textContent = 'Finish Selection';
        button.classList.remove('bg-blue-600');
        button.classList.add('bg-green-600');
    }
}

function clearSelection() {
    // Remove all paths from canvas
    paths.forEach(p => p.remove());
    paths = [];  // Clear the array
    path = null; // Reset current path
    paper.view.update();
}

async function createMaskFromCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Get original image dimensions
    const img = new Image();
    img.src = window.imageData;
    await new Promise(resolve => img.onload = resolve);
    
    // Set canvas to image dimensions
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Fill with black background (pixels to keep)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw white for areas to modify
    if (paths.length > 0) {
        ctx.fillStyle = 'white';
        
        // Calculate scale factor from Paper.js canvas to actual image size
        const scaleFactor = img.width / paper.view.viewSize.width;
        
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

    // Ensure binary black and white
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
        canvas.toBlob(blob => {
            resolve(blob);
        }, 'image/png', { quality: 1 });
    });
}

async function submitEdit() {
    const activeTab = document.querySelector('[data-mode].border-blue-500');
    const mode = activeTab.dataset.mode;
    const applyEditButton = document.getElementById('applyEditButton');
    const errorDiv = document.getElementById('error');
    const spinner = document.getElementById('spinner');

    try {
        if (mode === 'inpaint') {
            const prompt = document.getElementById('prompt').value.trim();
            if (!prompt) {
                throw new Error('Please enter what you want to appear in the selected areas');
            }
        }

        if (paths.length === 0) {
            throw new Error('Please draw a selection area first');
        }

        applyEditButton.disabled = true;
        applyEditButton.textContent = 'Processing...';
        errorDiv.classList.add('hidden');
        spinner.style.display = 'block';

        const maskBlob = await createMaskFromCanvas();
        
        // Log sizes
        console.log(`Image data size: ${((window.imageData.length * 0.75) / (1024 * 1024)).toFixed(2)} MB`);  // Approximate base64 size
        console.log(`Mask blob size: ${(maskBlob.size / (1024 * 1024)).toFixed(2)} MB`);
        
        // Create form data
        const formData = new FormData();
        formData.append('image', window.imageData);
        formData.append('mask', maskBlob);
        formData.append('mode', mode);

        if (mode === 'inpaint') {
            formData.append('prompt', document.getElementById('prompt').value.trim());
        }

        const apiResponse = await fetch('/direct-modification', {
            method: 'POST',
            body: formData
        });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            throw new Error(errorData.error || 'Failed to process edit');
        }

        // Handle the response as a blob
        const imageBlob = await apiResponse.blob();
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(imageBlob);
        reader.onloadend = function() {
            const base64data = reader.result;
            
            // Create form for submitting to next edit page
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/edit';

            const imageInput = document.createElement('input');
            imageInput.type = 'hidden';
            imageInput.name = 'image';
            imageInput.value = base64data;
            form.appendChild(imageInput);

            const countInput = document.createElement('input');
            countInput.type = 'hidden';
            countInput.name = 'edit_count';
            countInput.value = (window.editCount + 1).toString();
            form.appendChild(countInput);

            document.body.appendChild(form);
            form.submit();
        };

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