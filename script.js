// State management
let audioContext;
let audioBuffer;
let audioSource;
let currentAudio;
let isPlaying = false;
let startTime = 0;
let pauseTime = 0;
let animationId;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const infoSection = document.getElementById('infoSection');
const visualizationSection = document.getElementById('visualizationSection');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const waveformCanvas = document.getElementById('waveformCanvas');
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');

// File info elements
const fileName = document.getElementById('fileName');
const fileDuration = document.getElementById('fileDuration');
const fileSampleRate = document.getElementById('fileSampleRate');
const fileChannels = document.getElementById('fileChannels');

// Initialize
function init() {
    // Initialize Web Audio API
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
        showError('Web Audio API is not supported in your browser.');
        return;
    }
    
    // Event listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // Controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    stopBtn.addEventListener('click', stopAudio);
    resetBtn.addEventListener('click', resetApp);
    
    // Canvas click for seek
    waveformCanvas.addEventListener('click', handleCanvasClick);
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// File selection handler
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// Main file processing
async function handleFile(file) {
    // Validate file type
    if (!file.type.startsWith('audio/')) {
        showError('Please select a valid audio file.');
        return;
    }
    
    hideError();
    showLoading(true);
    
    try {
        // Read file as array buffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Decode audio data
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Display file information
        displayFileInfo(file, audioBuffer);
        
        // Visualize waveform
        visualizeWaveform(audioBuffer);
        
        // Show sections
        uploadArea.style.display = 'none';
        infoSection.style.display = 'block';
        visualizationSection.style.display = 'block';
        showLoading(false);
        
    } catch (error) {
        console.error('Error processing audio file:', error);
        showError('Error processing audio file. Please try a different file.');
        showLoading(false);
    }
}

// Display file information
function displayFileInfo(file, buffer) {
    fileName.textContent = file.name;
    fileDuration.textContent = formatTime(buffer.duration);
    fileSampleRate.textContent = `${buffer.sampleRate} Hz`;
    fileChannels.textContent = buffer.numberOfChannels === 1 ? 'Mono' : 
                               buffer.numberOfChannels === 2 ? 'Stereo' : 
                               `${buffer.numberOfChannels} channels`;
    totalTimeDisplay.textContent = formatTime(buffer.duration);
}

// Visualize waveform
function visualizeWaveform(buffer) {
    const canvas = waveformCanvas;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    
    // Get channel data (use first channel)
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    // Clear canvas
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, width, height);
    
    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--waveform-color').trim();
    ctx.lineWidth = 1;
    
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        
        // Find min and max in this segment
        for (let j = 0; j < step; j++) {
            const index = (i * step) + j;
            if (index >= data.length) break;
            const datum = data[index];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        
        // Draw vertical line from min to max
        const x = i;
        const yMin = (1 + min) * amp;
        const yMax = (1 + max) * amp;
        
        ctx.moveTo(x, yMin);
        ctx.lineTo(x, yMax);
    }
    
    ctx.stroke();
}

// Play/Pause toggle
function togglePlayPause() {
    if (isPlaying) {
        pauseAudio();
    } else {
        playAudio();
    }
}

// Play audio
function playAudio() {
    if (!audioBuffer) return;
    
    // Stop any existing playback
    if (audioSource) {
        try {
            audioSource.stop();
        } catch (error) {
            // Source already stopped, ignore error
        }
    }
    
    // Create new source
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    
    // Calculate start position (ensure within bounds)
    const offset = Math.min(pauseTime, audioBuffer.duration);
    audioSource.start(0, offset);
    startTime = audioContext.currentTime - offset;
    
    // Update UI
    isPlaying = true;
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    
    // Start time update
    updateTime();
    
    // Handle end of playback
    audioSource.onended = () => {
        if (isPlaying) {
            stopAudio();
        }
    };
}

// Pause audio
function pauseAudio() {
    if (!audioSource || !isPlaying) return;
    
    try {
        audioSource.stop();
    } catch (error) {
        // Source already stopped, ignore error
    }
    pauseTime = audioContext.currentTime - startTime;
    
    // Update UI
    isPlaying = false;
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

// Stop audio
function stopAudio() {
    if (audioSource) {
        try {
            audioSource.stop();
        } catch (error) {
            // Source already stopped, ignore error
        }
    }
    
    pauseTime = 0;
    startTime = 0;
    isPlaying = false;
    
    // Update UI
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    currentTimeDisplay.textContent = '0:00';
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

// Update time display
function updateTime() {
    if (!isPlaying) return;
    
    const currentTime = Math.max(0, audioContext.currentTime - startTime);
    
    if (currentTime >= audioBuffer.duration) {
        stopAudio();
        return;
    }
    
    currentTimeDisplay.textContent = formatTime(currentTime);
    
    // Continue updating
    animationId = requestAnimationFrame(updateTime);
}

// Handle canvas click for seeking
function handleCanvasClick(e) {
    if (!audioBuffer) return;
    
    const rect = waveformCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const seekTime = percentage * audioBuffer.duration;
    
    pauseTime = Math.min(seekTime, audioBuffer.duration);
    
    if (isPlaying) {
        playAudio();
    } else {
        currentTimeDisplay.textContent = formatTime(seekTime);
    }
}

// Reset application
function resetApp() {
    stopAudio();
    
    // Reset state
    audioBuffer = null;
    audioSource = null;
    pauseTime = 0;
    startTime = 0;
    
    // Clear file input
    fileInput.value = '';
    
    // Reset UI
    uploadArea.style.display = 'block';
    infoSection.style.display = 'none';
    visualizationSection.style.display = 'none';
    hideError();
}

// Utility functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showLoading(show) {
    loading.style.display = show ? 'block' : 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Handle window resize
window.addEventListener('resize', () => {
    if (audioBuffer) {
        visualizeWaveform(audioBuffer);
    }
});

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
