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
    const errorDiv = document.getElementById('error');
    if (spinner) spinner.style.display = 'none';
    if (errorDiv) errorDiv.classList.add('hidden');

    const initListener = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
        else console.error(`Element ${id} not found`);
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

    const initialMode = window.initialMode || 'inpaint';
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

        undoEdit();

    } catch (err) {
        console.error('Undo failed:', err);
        errorDiv.textContent = err.message || 'Failed to undo last edit';
        errorDiv.classList.remove('hidden');
        spinner.style.display = 'none';
        undoButton.disabled = false;
    }
}

function undoEdit() {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/edit';

    // Add session ID first
    const sessionInput = document.createElement('input');
    sessionInput.type = 'hidden';
    sessionInput.name = 'session_id';
    sessionInput.value = window.SESSION_ID;
    form.appendChild(sessionInput);
    console.log('Sending session_id in undo:', window.SESSION_ID);

    const imageInput = document.createElement('input');
    imageInput.type = 'hidden';
    imageInput.name = 'image';
    imageInput.value = window.imageData;
    form.appendChild(imageInput);

    const countInput = document.createElement('input');
    countInput.type = 'hidden';
    countInput.name = 'edit_count';
    countInput.value = window.editCount + 1;  // Increment edit count
    form.appendChild(countInput);

    const styleInput = document.createElement('input');
    styleInput.type = 'hidden';
    styleInput.name = 'style';
    styleInput.value = window.initialStyle;
    form.appendChild(styleInput);

    document.body.appendChild(form);
    form.submit();
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

function loadImage(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
    });
}

async function compressImage(blob, maxSize = 800, quality = 0.8) {
    const img = await loadImage(URL.createObjectURL(blob));
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
        }, 'image/jpeg', quality);
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
        }
        
        if (paths.length === 0 && !['reimagine', 'replacebg'].includes(mode)) {
            throw new Error('Please make a selection first');
        }

        form.classList.add('loading');
        button.disabled = true;
        button.textContent = 'Processing...';
        errorDiv.classList.add('hidden');
        spinner.style.display = 'block';

        const formData = new FormData();
        formData.append('image', window.imageData);
        formData.append('mode', mode);
        formData.append('style', window.initialStyle);

        if (mode === 'replacebg') {
            formData.append('prompt', promptInput.value.trim());
        } else if (mode === 'inpaint') {
            const maskBlob = await createMaskFromCanvas();
            formData.append('mask', maskBlob);
            formData.append('prompt', promptInput.value.trim());
        } else if (mode === 'cleanup') {
            const maskBlob = await createMaskFromCanvas();
            formData.append('mask', maskBlob);
        }

        const response = await fetch('/direct-modification', {
            method: 'POST',
            headers: {
                'X-SESSION-ID': window.SESSION_ID
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Request failed');
        }

        const editedBlob = await response.blob();
        const compressedBase64 = await compressImage(editedBlob, 800, 0.8);

        // After successful edit, save to Cloudinary and send to Qualtrics if we've reached 4 or more edits
        if (window.editCount >= 3) {
            try {
                console.log('SESSION_ID:', window.SESSION_ID);
                
                // Wait for SESSION_ID if not available
                if (!window.SESSION_ID) {
                    console.log('Waiting for SESSION_ID...');
                    await new Promise((resolve) => {
                        const checkID = setInterval(() => {
                            if (window.SESSION_ID) {
                                clearInterval(checkID);
                                resolve();
                            }
                        }, 100);
                        // Timeout after 5 seconds
                        setTimeout(() => {
                            clearInterval(checkID);
                            resolve();
                        }, 5000);
                    });
                    console.log('SESSION_ID after waiting:', window.SESSION_ID);
                }

                if (!window.SESSION_ID) {
                    throw new Error('SESSION_ID not available');
                }

                // Save to Cloudinary with SESSION_ID
                const uploadResponse = await fetch('/save-final-image', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        imageData: compressedBase64,
                        session_id: window.SESSION_ID
                    })
                });

                const uploadResult = await uploadResponse.json();
                console.log('Cloudinary upload result:', uploadResult);

                if (!uploadResult.success) {
                    throw new Error(uploadResult.error || 'Failed to upload to Cloudinary');
                }

                // Send to Qualtrics
                window.parent.postMessage({
                    action: 'setEmbeddedData',
                    key: 'Base64',
                    value: compressedBase64
                }, '*');

                window.parent.postMessage({
                    action: 'enableContinue',
                    completed: true
                }, '*');

            } catch (error) {
                console.error('Error saving to Cloudinary:', error);
                showError('Failed to save final image: ' + error.message);
                return;
            }
        }

        const submissionForm = document.createElement('form');
        submissionForm.method = 'POST';
        submissionForm.action = '/edit';
        submissionForm.innerHTML = `
            <input type="hidden" name="image" value="${compressedBase64}">
            <input type="hidden" name="edit_count" value="${window.editCount + 1}">
            <input type="hidden" name="style" value="${window.initialStyle}">
            <input type="hidden" name="mode" value="${mode}">
            <input type="hidden" name="session_id" value="${window.SESSION_ID}">
        `;
        document.body.appendChild(submissionForm);
        submissionForm.submit();

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