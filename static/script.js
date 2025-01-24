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
        'inpaint': 'Add changes',
        'cleanup': 'Remove parts',
        'replacebg': 'Change background',
        'reimagine': 'Reimagine image'
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
        console.error('Undo failed:', err);
        errorDiv.textContent = err.message || 'Failed to undo last edit';
        errorDiv.classList.remove('hidden');
    } finally {
        spinner.style.display = 'none';
        undoButton.disabled = false;
    }
}

async function undoEdit(previousVersion) {
    try {
        window.editCount++;  // Increment the counter
        const editCountDisplay = document.querySelector('h1.text-2xl');
        if (editCountDisplay) {
            editCountDisplay.textContent = `Edit ${window.editCount}`;
        }

        // Update window variables
        window.imageData = previousVersion.imageData;

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
        
        console.log('Canvas updated with previous version');
    } catch (error) {
        console.error('Failed to restore previous version:', error);
        showError('Failed to restore previous version');
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

        historyManager.addVersion(window.imageData, window.editCount);

        if (promptInput.value.length > 1000) {
            promptInput.value = promptInput.value.substring(0, 1000);
        }

        if (['inpaint', 'replacebg'].includes(mode)) {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                throw new Error(mode === 'inpaint' 
                    ? 'Please describe what should appear in selected areas' 
                    : 'Please describe the new background');
            }
            console.log('Prompt:', prompt);
        }
        
        if (paths.length === 0 && !['reimagine', 'replacebg'].includes(mode)) {
            throw new Error('Please make a selection first');
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

    } catch (error) {
        console.error('Edit failed:', error);
        const errorMessage = error.message.includes('Payload') 
            ? 'Image too large - try smaller selections' 
            : error.message;
        showError(errorMessage);
    } finally {
        if (form) form.classList.remove('loading');
        if (button) {
            button.disabled = false;
            const currentTab = document.querySelector('[data-mode].border-blue-500');
            if (currentTab) {
                const buttonTexts = {
                    'inpaint': 'Add changes',
                    'cleanup': 'Remove parts',
                    'replacebg': 'Change background',
                    'reimagine': 'Reimagine image'
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