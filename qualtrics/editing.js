Qualtrics.SurveyEngine.addOnload(function() {
    var that = this;
    that.disableNextButton();
    
    let canvas;
    
    const initializeCanvas = function() {
        // Create canvas element
        const canvasEl = document.createElement('canvas');
        canvasEl.id = 'editCanvas';
        
        // Create container for canvas and controls
        const container = document.createElement('div');
        container.id = 'editingContainer';
        container.style.maxWidth = '800px';
        container.style.margin = '20px auto';
        container.appendChild(canvasEl);
        
        // Add container to Qualtrics question
        that.getQuestionContainer().appendChild(container);
        
        // Initialize Fabric canvas
        canvas = new fabric.Canvas('editCanvas');
        
        // Set canvas size
        const containerWidth = 800;
        canvas.setWidth(containerWidth);
        canvas.setHeight(containerWidth);
        canvas.setDimensions({
            width: 1024,
            height: 1024
        }, { backstoreOnly: true });
        
        // Load and display the original image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
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
            canvas.freeDrawingBrush.width = 20;
            canvas.freeDrawingBrush.color = 'rgba(255, 255, 255, 0.5)';
        };
        img.src = Qualtrics.SurveyEngine.getEmbeddedData('InitialImageURL');
        
        // Create UI controls
        const controls = document.createElement('div');
        controls.style.marginTop = '20px';
        controls.innerHTML = `
            <div style="margin-bottom: 20px;">
                <input type="text" id="promptInput" placeholder="Enter your edit prompt" style="width: 100%; padding: 8px; margin-bottom: 10px;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button id="drawButton" style="padding: 8px 16px;">Draw Selection</button>
                    <button id="clearButton" style="padding: 8px 16px;">Clear Selection</button>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <label for="brushSize">Brush Size:</label>
                        <input type="range" id="brushSize" min="5" max="50" value="20">
                    </div>
                </div>
            </div>
            <button id="editButton" style="padding: 8px 16px; background-color: #007bff; color: white; border: none; border-radius: 4px;">Apply Edit</button>
            <div id="loadingMessage" style="display: none; margin-top: 10px;">Processing your edit...</div>
            <div id="errorMessage" style="display: none; color: red; margin-top: 10px;"></div>
            <div id="debugOutput" style="margin-top: 10px; padding: 10px; background: #f5f5f5; display: none;"></div>
        `;
        container.appendChild(controls);
        
        // Add event listeners
        document.getElementById('drawButton').addEventListener('click', toggleDrawing);
        document.getElementById('clearButton').addEventListener('click', clearDrawing);
        document.getElementById('brushSize').addEventListener('input', updateBrushSize);
        document.getElementById('editButton').addEventListener('click', editImage);
    };
    
    const toggleDrawing = function() {
        canvas.isDrawingMode = !canvas.isDrawingMode;
        const button = document.getElementById('drawButton');
        button.textContent = canvas.isDrawingMode ? 'Finish Drawing' : 'Draw Selection';
        button.style.backgroundColor = canvas.isDrawingMode ? '#28a745' : '';
    };
    
    const clearDrawing = function() {
        const objects = canvas.getObjects();
        for (let i = objects.length - 1; i > 0; i--) {
            canvas.remove(objects[i]);
        }
        canvas.renderAll();
    };
    
    const updateBrushSize = function(e) {
        const size = parseInt(e.target.value);
        canvas.freeDrawingBrush.width = size;
    };

    const debugLog = function(message) {
        console.log(message);
        const debugOutput = document.getElementById('debugOutput');
        debugOutput.style.display = 'block';
        debugOutput.innerHTML += `<div>${message}</div>`;
    };
	const createMaskFromCanvas = async function() {
        debugLog('Creating mask from canvas...');
        
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
        debugLog(`Scale factor: ${scaleFactor}`);
        
        // Draw each path
        const paths = canvas.getObjects().slice(1);
        debugLog(`Number of paths to draw: ${paths.length}`);
        
        paths.forEach((path, index) => {
            if (path.type === 'path' && path.path) {
                // Scale the line width
                ctx.lineWidth = path.strokeWidth * scaleFactor;
                
                ctx.beginPath();
                
                // Transform and draw the path
                path.path.forEach((point, pointIndex) => {
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
        
        debugLog('Converting to binary grayscale...');
        
        let hasNonBinaryValues = false;
        for (let i = 0; i < data.length; i += 4) {
            // Strict binary threshold
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const value = avg > 127 ? 255 : 0;
            
            // Check for non-binary values before conversion
            if (data[i] !== 0 && data[i] !== 255) {
                hasNonBinaryValues = true;
            }
            
            // Set all channels to the same binary value
            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            data[i + 3] = 255;   // A
        }
        
        debugLog(`Found non-binary values: ${hasNonBinaryValues}`);
        
        ctx.putImageData(imageData, 0, 0);

        // Add debug preview
        const debugPreview = document.createElement('div');
        debugPreview.innerHTML = `
            <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <p style="margin: 0;">Debug: Mask Preview</p>
                        <small style="color: #666;">
                            Canvas size: ${tempCanvas.width}x${tempCanvas.height},
                            Scale factor: ${scaleFactor.toFixed(2)}
                        </small>
                    </div>
                    <button id="downloadMaskBtn" style="padding: 5px 10px; cursor: pointer;">
                        Download Mask
                    </button>
                </div>
                <img src="${tempCanvas.toDataURL('image/png')}" style="max-width: 200px; border: 1px solid #ccc;">
            </div>
        `;
        
        // Remove any existing debug preview
        const existingPreview = document.querySelector('#maskPreview');
        if (existingPreview) {
            existingPreview.remove();
        }
        
        // Add new preview
        debugPreview.id = 'maskPreview';
        document.getElementById('editingContainer').appendChild(debugPreview);

        // Add download handler
        document.getElementById('downloadMaskBtn').onclick = () => {
            const link = document.createElement('a');
            link.href = tempCanvas.toDataURL('image/png');
            link.download = 'mask.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        // Return the mask as a PNG blob with explicit encoding options
        return new Promise((resolve) => {
            tempCanvas.toBlob((blob) => {
                debugLog(`Created mask blob: ${blob.size} bytes, type: ${blob.type}`);
                resolve(blob);
            }, 'image/png', { quality: 1 });
        });
    };
    
    const editImage = async function() {
        const editButton = document.getElementById('editButton');
        const loadingMessage = document.getElementById('loadingMessage');
        const prompt = document.getElementById('promptInput').value.trim();

        if (!prompt) {
            showError('Please enter a prompt.');
            return;
        }

        if (canvas.getObjects().length <= 1) {
            showError('Please draw a selection area first.');
            return;
        }

        editButton.disabled = true;
        loadingMessage.style.display = 'block';
        debugLog('Starting image edit process...');

        try {
            // Create mask
            const maskBlob = await createMaskFromCanvas();
            debugLog(`Mask created successfully: ${maskBlob.size} bytes`);

            // Get original image URL
            const originalImageUrl = Qualtrics.SurveyEngine.getEmbeddedData('InitialImageURL');
            debugLog(`Original image URL: ${originalImageUrl}`);

            // Fetch original image
            const imageResponse = await fetch(originalImageUrl);
            if (!imageResponse.ok) {
                throw new Error('Failed to fetch original image');
            }
            
            // Convert response to image
            const imageBlob = await new Promise(async (resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1024;
                    canvas.height = 1024;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, 1024, 1024);
                    canvas.toBlob(blob => resolve(blob), 'image/png', 1.0);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.crossOrigin = 'anonymous';
                const blob = await imageResponse.blob();
                img.src = URL.createObjectURL(blob);
            });

            debugLog(`Prepared image blob: ${imageBlob.size} bytes, type: ${imageBlob.type}`);

            // Create FormData
            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('image', imageBlob, 'image.png');
            formData.append('mask', maskBlob, 'mask.png');
            formData.append('model', 'recraftv3');
            formData.append('style', 'realistic_image');
            
            debugLog('Sending request to Recraft API...');
            
            // Send to Recraft API
            const apiResponse = await fetch('https://external.api.recraft.ai/v1/images/inpaint', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer 6gu41BkgNuKrkox2lLjKIHV3sWWeoiAum6BK6jQKxMIJSTKvvDjUOPsK2xSKbu5k',
                    'Accept': 'application/json'
                },
                body: formData
            });
            
            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                debugLog(`API Error Response: ${errorText}`);
                throw new Error('API request failed: ' + errorText);
            }
            
            const data = await apiResponse.json();
            debugLog('API Response received');
            
            if (data && data.data && data.data[0] && data.data[0].url) {
                const newImageUrl = data.data[0].url;
                debugLog(`New image URL: ${newImageUrl}`);
                
                // Update Qualtrics embedded data
                const currentIteration = parseInt(Qualtrics.SurveyEngine.getEmbeddedData('CurrentIteration') || '1');
                Qualtrics.SurveyEngine.setEmbeddedData('Iter' + currentIteration + 'ImageURL', newImageUrl);
                Qualtrics.SurveyEngine.setEmbeddedData('Iter' + currentIteration + 'Prompt', prompt);
                
                that.enableNextButton();
                that.clickNextButton();
            } else {
                throw new Error('Invalid response from API');
            }
        } catch (error) {
            console.error('Error:', error);
            debugLog(`Error occurred: ${error.message}`);
            showError('Failed to edit image: ' + error.message);
        } finally {
            loadingMessage.style.display = 'none';
            editButton.disabled = false;
        }
    };
    
    const showError = function(message) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        debugLog(`Error shown to user: ${message}`);
    };
    
    // Initialize the canvas
    initializeCanvas();
});