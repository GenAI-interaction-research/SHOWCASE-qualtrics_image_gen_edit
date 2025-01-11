Qualtrics.SurveyEngine.addOnload(function() {
    var that = this;
    that.disableNextButton();
    
    // Canvas setup for drawing
    var canvas, ctx, isDrawing = false;
    var lastX = 0, lastY = 0;
    
    function createCanvas() {
        canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        canvas.style.border = '1px solid black';
        canvas.style.cursor = 'crosshair';
        ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Load and draw the original image
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            ctx.drawImage(img, 0, 0, 1024, 1024);
        };
        img.src = Qualtrics.SurveyEngine.getEmbeddedData('InitialImageURL');
        
        // Set default drawing style
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Fill with black background for mask
        // ctx.fillStyle = 'black';
        // ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add mouse/touch event listeners
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        
        // Touch events
        canvas.addEventListener('touchstart', handleTouch);
        canvas.addEventListener('touchmove', handleTouch);
        canvas.addEventListener('touchend', stopDrawing);
        
        return canvas;
    }
    
    function startDrawing(e) {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
    
    function draw(e) {
        if (!isDrawing) return;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    function handleTouch(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        
        if (e.type === 'touchstart') {
            startDrawing({
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top
            });
        } else if (e.type === 'touchmove') {
            draw({
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top
            });
        }
    }
    
    function clearDrawing() {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            ctx.drawImage(img, 0, 0, 1024, 1024);
        };
        img.src = Qualtrics.SurveyEngine.getEmbeddedData('InitialImageURL');
    }
    
    async function editImage() {
        const prompt = jQuery('#editPromptInput').val().trim();
        if (!prompt) {
            showError('Please enter a prompt');
            return;
        }
        
        const loadingMessage = jQuery('#loadingMessage');
        const errorMessage = jQuery('#errorMessage');
        const editButton = jQuery('#editButton');
        
        try {
            loadingMessage.show();
            errorMessage.hide();
            editButton.prop('disabled', true);
            
            // Get the mask as PNG blob
            const maskBlob = await new Promise(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/png');
            });
            
            // Create form data
            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('mask', maskBlob, 'mask.png');
            formData.append('image_url', Qualtrics.SurveyEngine.getEmbeddedData('InitialImageURL'));
            
            // Send to your backend
            const response = await fetch('https://qualtrics-recraft-api-129769591311.europe-west1.run.app/direct-modification', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process edit');
            }
            
            const result = await response.json();
            if (result.success) {
                Qualtrics.SurveyEngine.setEmbeddedData('EditPrompt', prompt);
                Qualtrics.SurveyEngine.setEmbeddedData('EditedImageURL', result.image_url);
                that.enableNextButton();
                that.clickNextButton();
            } else {
                throw new Error(result.error || 'Failed to edit image');
            }
            
        } catch (error) {
            showError('Error: ' + error.message);
            loadingMessage.hide();
            editButton.prop('disabled', false);
        }
    }
    
    function showError(message) {
        jQuery('#errorMessage').text(message).show();
    }
    
    // Create and setup the UI
    const container = document.createElement('div');
    container.id = 'editingContainer';
    container.style.maxWidth = '800px';
    container.style.margin = '0 auto';
    container.style.padding = '20px';
    
    // Instructions
    const instructions = document.createElement('div');
    instructions.innerHTML = `
        <h3>Instructions:</h3>
        <ol>
            <li>Draw on the areas of the image you want to change</li>
            <li>Enter a description of what you want in those areas</li>
            <li>Click "Apply Changes" to edit the image</li>
        </ol>
    `;
    
    // Create display container
    const displayContainer = document.createElement('div');
    displayContainer.style.marginBottom = '20px';
    
    // Add canvas
    displayContainer.appendChild(createCanvas());
    
    // Add brush size control
    const brushSizeContainer = document.createElement('div');
    brushSizeContainer.style.marginBottom = '10px';
    brushSizeContainer.style.marginTop = '10px';
    
    const brushSizeLabel = document.createElement('label');
    brushSizeLabel.textContent = 'Brush Size: ';
    brushSizeLabel.htmlFor = 'brushSize';
    
    const brushSize = document.createElement('input');
    brushSize.type = 'range';
    brushSize.id = 'brushSize';
    brushSize.min = '5';
    brushSize.max = '50';
    brushSize.value = '20';
    brushSize.onchange = (e) => ctx.lineWidth = parseInt(e.target.value);
    
    brushSizeContainer.appendChild(brushSizeLabel);
    brushSizeContainer.appendChild(brushSize);
    displayContainer.appendChild(brushSizeContainer);
    
    // Add prompt input
    const promptInput = document.createElement('textarea');
    promptInput.id = 'editPromptInput';
    promptInput.placeholder = 'Describe what you want to change in the image...';
    promptInput.style.width = '100%';
    promptInput.style.marginBottom = '10px';
    promptInput.style.padding = '10px';
    promptInput.style.height = '80px';  // Make textarea taller
    
    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginBottom = '20px';
    
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Drawing';
    clearButton.onclick = clearDrawing;
    clearButton.style.marginRight = '10px';
    
    const editButton = document.createElement('button');
    editButton.id = 'editButton';
    editButton.textContent = 'Apply Changes';
    editButton.onclick = editImage;
    
    buttonContainer.appendChild(clearButton);
    buttonContainer.appendChild(editButton);
    
    // Add messages
    const loadingMessage = document.createElement('div');
    loadingMessage.id = 'loadingMessage';
    loadingMessage.style.display = 'none';
    loadingMessage.innerHTML = '<p>Editing image... Please wait.</p>';
    
    const errorMessage = document.createElement('div');
    errorMessage.id = 'errorMessage';
    errorMessage.style.display = 'none';
    errorMessage.style.color = 'red';
    
    // Assemble the UI
    container.appendChild(instructions);
    container.appendChild(displayContainer);
    container.appendChild(promptInput);
    container.appendChild(buttonContainer);
    container.appendChild(loadingMessage);
    container.appendChild(errorMessage);
    
    // Add the container to the question
    this.getQuestionContainer().appendChild(container);
});
