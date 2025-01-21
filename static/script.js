let paths = [];
let isDrawing = false;
let raster;
let path;

document.addEventListener('DOMContentLoaded', async () => {
    paper.setup('canvas');
    const container = document.querySelector('.canvas-container');
    const containerWidth = Math.min(container.clientWidth, 800);
    paper.view.viewSize = new paper.Size(containerWidth, containerWidth);

    try {
        const img = new Image();
        img.onload = function() {
            raster = new paper.Raster(img);
            const scale = Math.min(containerWidth / img.width, containerWidth / img.height);
            raster.scale(scale);
            raster.position = paper.view.center;
        };
        img.src = window.imageData;

        const tool = new paper.Tool();
        tool.onMouseDown = (event) => {
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
        
        tool.onMouseDrag = (event) => {
            if (isDrawing) path.add(event.point);
        };
        
        tool.onMouseUp = () => {
            if (isDrawing) {
                path.closed = true;
                isDrawing = false;
            }
        };

        document.getElementById('lassoButton').addEventListener('click', toggleDrawing);
        document.getElementById('clearButton').addEventListener('click', clearSelection);
        document.getElementById('applyEditButton').addEventListener('click', submitEdit);

        const tabs = document.querySelectorAll('[data-mode]');
        const sections = {
            prompt: document.getElementById('promptSection'),
            instructions: {
                inpaint: document.getElementById('inpaintInstructions'),
                cleanup: document.getElementById('cleanupInstructions'),
                reimagine: document.getElementById('reimagineInstructions')
            }
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.classList.remove('border-blue-500', 'text-blue-600');
                    t.classList.add('border-transparent', 'text-gray-500');
                });

                tab.classList.remove('border-transparent', 'text-gray-500');
                tab.classList.add('border-blue-500', 'text-blue-600');

                const mode = tab.dataset.mode;
                const isReimagine = mode === 'reimagine';
                
                // Toggle UI elements
                document.querySelector('.canvas-container').classList.toggle('hidden', isReimagine);
                document.getElementById('lassoButton').classList.toggle('hidden', isReimagine);
                document.getElementById('clearButton').classList.toggle('hidden', isReimagine);
                document.getElementById('promptLabel').textContent = isReimagine 
                    ? 'How should the image be transformed?' 
                    : 'What should appear in the selected areas?';

                sections.prompt.classList.toggle('hidden', mode === 'cleanup');
                sections.instructions.inpaint.classList.toggle('hidden', mode !== 'inpaint');
                sections.instructions.cleanup.classList.toggle('hidden', mode !== 'cleanup');
                sections.instructions.reimagine.classList.toggle('hidden', mode !== 'reimagine');
            });
        });

    } catch (error) {
        console.error('Initialization error:', error);
        showError('Error initializing editor. Please refresh.');
    }
});

function toggleDrawing() {
    const button = document.getElementById('lassoButton');
    if (isDrawing) {
        isDrawing = false;
        if (path) path.closed = true;
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
    paths.forEach(p => p.remove());
    paths = [];
    path = null;
    paper.view.update();
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
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
}

async function submitEdit() {
    const activeTab = document.querySelector('[data-mode].border-blue-500');
    const mode = activeTab.dataset.mode;
    const button = document.getElementById('applyEditButton');
    const errorDiv = document.getElementById('error');
    const spinner = document.getElementById('spinner');

    try {
        if (mode === 'reimagine') {
            if (!document.getElementById('prompt').value.trim()) {
                throw new Error('Please describe how to transform the image');
            }
        } else if (mode === 'inpaint') {
            if (!document.getElementById('prompt').value.trim()) {
                throw new Error('Please describe what should appear in selected areas');
            }
        }
        
        if (paths.length === 0 && mode !== 'reimagine') {
            throw new Error('Please make a selection first');
        }

        button.disabled = true;
        button.textContent = 'Processing...';
        errorDiv.classList.add('hidden');
        spinner.style.display = 'block';

        const formData = new FormData();
        formData.append('image', window.imageData);
        formData.append('mode', mode);

        if (mode === 'reimagine') {
            formData.append('prompt', document.getElementById('prompt').value.trim());
        } else {
            const maskBlob = await createMaskFromCanvas();
            formData.append('mask', maskBlob);
            
            if (mode === 'inpaint') {
                formData.append('prompt', document.getElementById('prompt').value.trim());
            } else {
                formData.append('cleanup_mode', 'quality');
            }
        }

        const response = await fetch('/direct-modification', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(await response.text());

        const editedBlob = await response.blob();
        const compressedBase64 = await compressImage(editedBlob, 800, 0.8);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/edit';
        form.innerHTML = `
            <input type="hidden" name="image" value="${compressedBase64}">
            <input type="hidden" name="edit_count" value="${window.editCount + 1}">
        `;
        document.body.appendChild(form);
        form.submit();

    } catch (err) {
        console.error('Edit failed:', err);
        showError(err.message.includes('Payload') ? 'Image too large - try smaller selections' : err.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Apply Changes';
        spinner.style.display = 'none';
    }
}

// Helper functions
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

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}