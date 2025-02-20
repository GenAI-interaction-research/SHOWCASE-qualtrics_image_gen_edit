// Image history management
class ImageHistory {
    constructor(maxSize = 10) {
        this.maxSize = maxSize;
        this.storageKey = 'imageEditHistory';
    }

    getHistory() {
        try {
            const history = localStorage.getItem(this.storageKey);
            return history ? JSON.parse(history) : [];
        } catch (error) {
            console.error('Error reading history:', error);
            return [];
        }
    }

    addVersion(imageData, editCount) {
        try {
            let history = this.getHistory();
            history.push({
                imageData,
                editCount,
                timestamp: Date.now()
            });
            if (history.length > this.maxSize) {
                history = history.slice(-this.maxSize);
            }
            localStorage.setItem(this.storageKey, JSON.stringify(history));
            this.updateUndoButton();
        } catch (error) {
            console.error('Error adding version:', error);
        }
    }

    undo() {
        try {
            let history = this.getHistory();
            if (history.length === 0) return null;
            const lastVersion = history.pop();
            localStorage.setItem(this.storageKey, JSON.stringify(history));
            this.updateUndoButton();
            return {
                imageData: lastVersion.imageData,
                editCount: lastVersion.editCount,
                canUndo: history.length > 0
            };
        } catch (error) {
            console.error('Error during undo:', error);
            return null;
        }
    }

    canUndo() {
        return this.getHistory().length > 0;
    }

    updateUndoButton() {
        const undoButton = document.getElementById('undoButton');
        if (undoButton) {
            undoButton.classList.toggle('hidden', !this.canUndo());
        }
    }
}

// Global variables for Paper.js
let paths = [];
let isDrawing = false;
let raster;
let path;
let historyManager;
let addPrompts = [];
let backgroundPrompts = [];
let totalInteractions = 0;

// Initialize Paper.js canvas and tools
function initializePaperCanvas() {
    paper.setup('canvas');
    const container = document.querySelector('.canvas-container');
    const containerWidth = Math.min(container.clientWidth, 800);
    paper.view.viewSize = new paper.Size(containerWidth, containerWidth);

    // Initialize image
    const img = new Image();
    img.onload = function() {
        raster = new paper.Raster(img);
        const scale = Math.min(containerWidth / img.width, containerWidth / img.height);
        raster.scale(scale);
        raster.position = paper.view.center;
    };
    img.src = window.imageData;

    // Setup drawing tool
    const tool = new paper.Tool();
    
    tool.onMouseDown = function(event) {
        if (!isDrawing) {
            isDrawing = true;
            path = new paper.Path({
                segments: [event.point],
                strokeColor: 'white',
                strokeWidth: 2,
                dashArray: [5, 5],
                fillColor: new paper.Color(1, 1, 1, 0.2)
            });
            paths.push(path);
        }
    };

    tool.onMouseDrag = function(event) {
        if (isDrawing && path) {
            path.add(event.point);
        }
    };

    tool.onMouseUp = function() {
        if (isDrawing) {
            if (path) {
                path.closed = true;
            }
            isDrawing = false;
        }
    };
}
document.addEventListener('DOMContentLoaded', async () => {
    historyManager = new ImageHistory();
    // Initialize edit count to 1 when entering edit page
    window.editCount = 1;
    updateEditCountDisplay();
    initializePaperCanvas();

    const spinner = document.getElementById('spinner');
    const undoButton = document.getElementById('undoButton');
    const errorDiv = document.getElementById('error');
    if (spinner) spinner.style.display = 'none';
    if (errorDiv) errorDiv.classList.add('hidden');
    if (undoButton) {
        undoButton.classList.add('hidden');
    }

    const initListener = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    };

    initListener('lassoButton', 'click', toggleDrawing);
    initListener('clearButton', 'click', clearSelection);
    initListener('applyEditButton', 'click', submitEdit);
    initListener('undoButton', 'click', handleUndo);

    historyManager.updateUndoButton();

    const tabs = document.querySelectorAll('[data-mode]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activateTab(tab);
            if (tab.dataset.mode === 'reimagine') {
                document.getElementById('prompt').value = '';
            }
        });
    });

    const initialMode = 'inpaint';
    let activeTab = document.querySelector(`[data-mode="${initialMode}"]`);
    if (!activeTab) activeTab = document.querySelector('[data-mode]');
    if (activeTab) activateTab(activeTab);

    setupPromptValidation();
});

function activateTab(tab) {
    const tabs = document.querySelectorAll('[data-mode]');
    tabs.forEach(t => {
        t.classList.remove('border-blue-500', 'text-blue-600');
        t.classList.add('border-transparent', 'text-gray-500');
    });

    tab.classList.remove('border-transparent', 'text-gray-500');
    tab.classList.add('border-blue-500', 'text-blue-600');

    const mode = tab.dataset.mode;
    updateUIForMode(mode);
}

function updateUIForMode(mode) {
    const isReimagine = mode === 'reimagine';
    const isReplaceBg = mode === 'replacebg';
    
    const buttonTexts = {
        'inpaint': 'Add Elements',
        'cleanup': 'Remove Elements',
        'replacebg': 'Change Background',
        'reimagine': 'Reimagine Image'
    };
    
    const applyButton = document.getElementById('applyEditButton');
    if (applyButton) applyButton.textContent = buttonTexts[mode] || 'Apply Changes';
    
    const lassoButton = document.getElementById('lassoButton');
    const clearButton = document.getElementById('clearButton');
    if (lassoButton) lassoButton.classList.toggle('hidden', isReimagine || isReplaceBg);
    if (clearButton) clearButton.classList.toggle('hidden', isReimagine || isReplaceBg);

    const promptSection = document.getElementById('promptSection');
    if (promptSection) {
        promptSection.classList.toggle('hidden', !['inpaint', 'replacebg'].includes(mode));
    }

    const promptLabel = document.getElementById('promptLabel');
    if (promptLabel) {
        promptLabel.textContent = mode === 'replacebg' 
            ? 'What should the new background be?' 
            : 'What should appear in the selected areas?';
    }

    const sections = {
        inpaint: document.getElementById('inpaintInstructions'),
        cleanup: document.getElementById('cleanupInstructions'),
        reimagine: document.getElementById('reimagineInstructions'),
        replacebg: document.getElementById('replaceBgInstructions')
    };
    Object.entries(sections).forEach(([key, element]) => {
        if (element) element.classList.toggle('hidden', mode !== key);
    });
}

function toggleDrawing() {
    const button = document.getElementById('lassoButton');
    if (!button) return;

    isDrawing = !isDrawing;
    if (isDrawing) {
        button.textContent = 'Finish Selection';
        button.classList.replace('bg-blue-600', 'bg-green-600');
    } else {
        button.textContent = 'Draw Selection';
        button.classList.replace('bg-green-600', 'bg-blue-600');
        if (path) path.closed = true;
    }
}

function clearSelection() {
    paths.forEach(p => p.remove());
    paths = [];
    path = null;
    paper.view.update();
}

// Add this helper function at the top
function logError(error, context) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        context: context,
        message: error.message || 'Unknown error',
        stack: error.stack ? error.stack.split('\n')[0] : undefined,  // Only keep the first line of the stack trace
        editCount: window.editCount
    };

    // Send to Qualtrics
    window.parent.postMessage({
        action: 'setEmbeddedData',
        key: 'ERROR_LOG',
        value: JSON.stringify(errorLog)
    }, '*');

    console.error('Error logged:', errorLog);
}

async function handleUndo() {
    const undoButton = document.getElementById('undoButton');
    const spinner = document.getElementById('spinner');
    const errorDiv = document.getElementById('error');

    try {
        spinner.style.display = 'block';
        undoButton.disabled = true;
        errorDiv.classList.add('hidden');

        const previousVersion = historyManager.undo();
        if (!previousVersion) {
            throw new Error('No history available');
        }

        await undoEdit(previousVersion);

    } catch (err) {
        logError(err, 'handleUndo');
        showError('Unable to undo at this time. Please try again.');
    } finally {
        spinner.style.display = 'none';
        undoButton.disabled = false;
    }
}

// Helper function to update edit count display
function updateEditCountDisplay() {
    const editCountDisplay = document.querySelector('h1');
    if (editCountDisplay) {
        editCountDisplay.textContent = 'Edit';  // Just show "Edit" without the count
    }
}

async function undoEdit(previousVersion) {
    try {
        // Update window variables
        window.imageData = previousVersion.imageData;
        window.editCount++;  // Increment the counter
        updateEditCountDisplay();  // Update display

        // Update the canvas with the previous image
        const img = await loadImage(previousVersion.imageData);
        paper.project.clear();
        raster = new paper.Raster(img);
        const scale = Math.min(paper.view.viewSize.width / img.width, paper.view.viewSize.height / img.height);
        raster.scale(scale);
        raster.position = paper.view.center;
        paper.view.draw();

        // Clear any existing paths
        paths = [];
        
        // Save to Cloudinary
        console.log('Converting to base64 for Cloudinary...');
        const response = await fetch(previousVersion.imageData);
        const blob = await response.blob();
        const reader = new FileReader();
        const base64Data = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });

        // Save to Cloudinary using saveToCloudinary function instead of direct endpoint call
        console.log('Saving to Cloudinary...');
        await saveToCloudinary(base64Data);  // Changed this line to use saveToCloudinary function
        
        console.log('Canvas updated with previous version');

        // Keep this - it's for tracking edit count, not interactions
        window.parent.postMessage({
            action: 'setEmbeddedData',
            key: 'EDIT_COUNT',
            value: window.editCount
        }, '*');

    } catch (error) {
        logError(error, 'undoEdit');
        showError('Failed to undo last edit. Please try again.');
    }
}

function loadImage(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
    });
}

async function createMaskFromCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = await loadImage(window.imageData);
    
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (paths.length > 0) {
        ctx.fillStyle = 'white';
        const scaleFactor = img.width / paper.view.viewSize.width;
        
        paths.forEach(path => {
            ctx.beginPath();
            path.segments.forEach((segment, index) => {
                const x = segment.point.x * scaleFactor;
                const y = segment.point.y * scaleFactor;
                index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fill();
        });
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const value = avg > 127 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
}

async function compressImage(input, maxSize = 800, quality = 0.8) {
    // Handle both Blob/File objects and data URLs
    const img = await loadImage(typeof input === 'string' ? input : URL.createObjectURL(input));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let width = img.width;
    let height = img.height;
    if (width > height && width > maxSize) {
        height *= maxSize / width;
        width = maxSize;
    } else if (height > maxSize) {
        width *= maxSize / height;
        height = maxSize;
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    
    return new Promise(resolve => {
        canvas.toBlob(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        }, 'image/png', quality);
    });
}

function containsWritingPrompt(prompt) {
    const writingKeywords = [
        'text', 'write', 'writing', 'written', 'caption', 'word', 'words', 'letter',
        'letters', 'font', 'label', 'labels', 'type', 'typed',
        'handwriting', 'signature', 'write out', 'spell', 'spelling'
    ];
    
    const promptLower = prompt.toLowerCase();
    return writingKeywords.some(keyword => promptLower.includes(keyword));
}

async function submitEdit() {
    const form = document.getElementById('editForm');
    const promptInput = document.getElementById('prompt');
    const button = document.getElementById('applyEditButton');
    const errorDiv = document.getElementById('error');
    const spinner = document.getElementById('spinner');
    
    if (!form || !promptInput || !button || !errorDiv || !spinner) {
        console.error('Missing critical UI components');
        return;
    }

    try {
        const activeTab = document.querySelector('[data-mode].border-blue-500');
        if (!activeTab) throw new Error('No editing mode selected');
        const mode = activeTab.dataset.mode;
        console.log('Selected mode:', mode);

        // Check for prompt in modes that require it
        if (['inpaint', 'replacebg'].includes(mode)) {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                throw new Error('Please make a text input.');
            }
        }
        
        // Check for selection in modes that require it
        if (paths.length === 0 && !['reimagine', 'replacebg'].includes(mode)) {
            throw new Error('Please make a selection first');
        }

        historyManager.addVersion(window.imageData, window.editCount);

        if (promptInput.value.length > 1000) {
            promptInput.value = promptInput.value.substring(0, 1000);
        }

        // Store prompts based on mode
        if (['inpaint', 'replacebg'].includes(mode)) {
            const prompt = promptInput.value.trim();
            
            // Store add element prompts
            if (mode === 'inpaint') {
                addPrompts.push(prompt);
                window.parent.postMessage({
                    action: 'setEmbeddedData',
                    key: 'ADD_PROMPT',
                    value: addPrompts.join(' || ')
                }, '*');
            }
            
            // Store background change prompts
            if (mode === 'replacebg') {
                backgroundPrompts.push(prompt);
                window.parent.postMessage({
                    action: 'setEmbeddedData',
                    key: 'BACKGROUND_PROMPT',
                    value: backgroundPrompts.join(' || ')
                }, '*');
            }
        }
        
        button.disabled = true;
        form.classList.add('loading');
        errorDiv.classList.add('hidden');
        spinner.style.display = 'block';

        console.log('Creating mask and compressing images...');
        const mask = await createMaskFromCanvas();
        console.log('Mask created');
        const compressedMask = await compressImage(mask);
        console.log('Mask compressed');
        const compressedBase64 = await compressImage(window.imageData);
        console.log('Image compressed');

        // Create FormData
        const formData = new FormData();
        formData.append('image', compressedBase64);
        window.editCount++;  // Increment before sending
        updateEditCountDisplay();  // Update display
        formData.append('edit_count', window.editCount);
        formData.append('mode', mode);
        formData.append('session_id', window.SESSION_ID);
        
        if (['inpaint', 'replacebg', 'cleanup'].includes(mode)) {
            if (['inpaint', 'replacebg'].includes(mode)) {
                formData.append('prompt', promptInput.value);
            }
            // Convert base64 mask to blob
            const maskBlob = await fetch(compressedMask).then(r => r.blob());
            formData.append('mask', maskBlob, 'mask.png');
        }
        
        console.log('Sending request to server...');
        // Use fetch API
        const response = await fetch('/direct-modification', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to process image');
        }
        
        console.log('Processing response...');
        // Handle the modified image
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.imageData = url;
        
        console.log('Updating canvas...');
        // Refresh the canvas with the new image
        const img = await loadImage(url);
        paper.project.clear();
        raster = new paper.Raster(img);
        const scale = Math.min(paper.view.viewSize.width / img.width, paper.view.viewSize.height / img.height);
        raster.scale(scale);
        raster.position = paper.view.center;
        paper.view.draw();
        console.log('Canvas updated');

        // Convert blob URL to base64 for Cloudinary
        console.log('Converting to base64...');
        const response2 = await fetch(url);
        const blob2 = await response2.blob();
        const reader = new FileReader();
        const base64Data = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob2);
        });
        
        // Save to Cloudinary
        console.log('Saving to Cloudinary...');
        const result = await saveToCloudinary(base64Data);
        console.log('Saved to Cloudinary');

        // Now we can safely use result
        if (result && result.url) {
            // Send the Cloudinary URL to Qualtrics
            window.parent.postMessage({
                action: 'setEmbeddedData',
                key: 'lastGeneratedImage',
                value: result.url
            }, '*');
            console.log('Sent Cloudinary URL to Qualtrics:', result.url);
        }

        // Only increment edit count if we're actually making changes
        // (i.e., if we get to this point in the code)
        window.editCount++;
        updateEditCountDisplay();

        // Update Qualtrics with new edit count
        window.parent.postMessage({
            action: 'setEmbeddedData',
            key: 'EDIT_COUNT',
            value: window.editCount
        }, '*');

    } catch (error) {
        logError(error, 'submitEdit');
        showError(error.message);
    } finally {
        if (form) form.classList.remove('loading');
        if (button) {
            button.disabled = false;
            const currentTab = document.querySelector('[data-mode].border-blue-500');
            if (currentTab) {
                const buttonTexts = {
                    'inpaint': 'Add Elements',
                    'cleanup': 'Remove Elements',
                    'replacebg': 'Change Background',
                    'reimagine': 'Reimagine Image'
                };
                button.textContent = buttonTexts[currentTab.dataset.mode] || 'Apply Changes';
            }
        }
        if (spinner) spinner.style.display = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

// Add this function to check prompt in real-time
function setupPromptValidation() {
    const promptInput = document.getElementById('prompt');
    const submitButton = document.getElementById('applyEditButton');
    const errorDiv = document.getElementById('error');

    if (promptInput) {
        promptInput.addEventListener('input', () => {
            const hasTextPrompt = containsWritingPrompt(promptInput.value);
            if (hasTextPrompt) {
                submitButton.disabled = true;
                errorDiv.textContent = 'Sorry, generating text or writing in images is not allowed';
                errorDiv.classList.remove('hidden');
            } else {
                submitButton.disabled = false;
                errorDiv.classList.add('hidden');
            }
        });
    }
}

// Add this check at the start of script.js
const editButton = document.getElementById('editButton');
if (editButton) {  // Only add listener if button exists
    editButton.addEventListener('click', async () => {
        try {
            const img = document.getElementById('generatedImage');
            if (!img || !img.src) {
                throw new Error('No image available to edit');
            }

            // Show loading state
            const loadingDiv = document.createElement('div');
            loadingDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; ' +
                'background: rgba(255,255,255,0.9); display: flex; justify-content: center; align-items: center; z-index: 9999;';
            loadingDiv.innerHTML = `
                <div style="text-align: center;">
                    <div class="spinner" style="margin-bottom: 10px;"></div>
                    <p>Loading edit page...</p>
                </div>
            `;
            document.body.appendChild(loadingDiv);

            // Create and submit form with retry logic
            let attempts = 0;
            const maxAttempts = 3;

            const submitForm = async () => {
                try {
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = '/edit';

                    // Add all necessary fields
                    const fields = {
                        'image': img.src,
                        'edit_count': '1',
                        'session_id': window.SESSION_ID
                    };

                    for (const [key, value] of Object.entries(fields)) {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = key;
                        input.value = value;
                        form.appendChild(input);
                    }

                    document.body.appendChild(form);
                    form.submit();
                } catch (error) {
                    attempts++;
                    if (attempts < maxAttempts) {
                        console.log(`Form submission failed, attempt ${attempts}. Retrying...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));  // Wait 1 second
                        await submitForm();  // Try again
                    } else {
                        throw new Error('Failed to load edit page after multiple attempts');
                    }
                }
            };

            await submitForm();

        } catch (error) {
            // Show error message with retry button
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); ' +
                'background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); ' +
                'text-align: center; max-width: 80%; z-index: 9999;';
            errorDiv.innerHTML = `
                <h3 style="color: #333; margin-bottom: 10px;">Unable to load edit page</h3>
                <p style="color: #666; margin-bottom: 15px;">${error.message}</p>
                <button onclick="window.location.reload()" style="background: #007bff; color: white; 
                    border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Try Again
                </button>
            `;
            document.body.appendChild(errorDiv);
            
            // Log error to Qualtrics
            logError(error, 'editPageTransition');
        }
    });
}

function incrementInteractionCount() {
    // Just send message to Qualtrics to increment
    window.parent.postMessage({
        action: 'incrementInteraction'
    }, '*');
}

window.addEventListener('message', function(event) {
    if (event.data.action === 'updateInteractions') {
        totalInteractions = event.data.value;
        updateProgressBar();
    }
});

async function saveToCloudinary(imageData) {
    if (!window.SESSION_ID) {
        throw new Error('No session ID available for saving to Cloudinary');
    }

    try {
        const response = await fetch('/save-final-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageData,
                session_id: window.SESSION_ID
            })
        });
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to save image');
        }
        
        // Send the image URL back to Qualtrics
        window.parent.postMessage({
            action: 'setEmbeddedData',
            key: 'Base64',
            value: result.url
        }, '*');

        // Add this: Increment interaction count whenever an image is saved
        window.parent.postMessage({
            action: 'incrementInteraction'
        }, '*');
        
        return result;
    } catch (error) {
        console.error('Error saving to Cloudinary:', error);
        throw error;
    }
}