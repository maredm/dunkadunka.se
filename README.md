# dunkadunka.se

🎵 Dunka Dunka - Waveform Editor and Visualization Tool

A web-based audio waveform visualizer that allows you to upload audio files and see their waveforms in real-time.

## Features

- 📤 **File Upload**: Drag and drop or click to select audio files
- 🎨 **Waveform Visualization**: Beautiful canvas-based waveform rendering
- ▶️ **Audio Playback**: Play, pause, and stop audio controls
- ⏱️ **Time Display**: Real-time playback progress
- 🎯 **Click to Seek**: Click anywhere on the waveform to jump to that position
- 📊 **File Information**: View duration, sample rate, and channel information
- 🎵 **Format Support**: WAV, MP3, OGG, M4A, and other browser-supported audio formats
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🌙 **Modern UI**: Clean, dark-themed interface

## Usage

Simply open `index.html` in a modern web browser. No server or build process required!

1. **Upload an audio file**: Drag and drop a file or click "Select File"
2. **View the waveform**: The waveform will be automatically visualized
3. **Play the audio**: Click the play button to hear your audio
4. **Seek in the waveform**: Click anywhere on the waveform to jump to that position
5. **Upload another file**: Click "Upload New File" to start over

## Technology Stack

- **HTML5**: Structure and layout
- **CSS3**: Styling and responsive design
- **JavaScript (ES6+)**: Core functionality
- **Web Audio API**: Audio processing and playback
- **Canvas API**: Waveform visualization

## Browser Support

Works in all modern browsers that support:
- Web Audio API
- Canvas API
- File API

Tested on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Development

No build process required. Simply:
1. Clone the repository
2. Open `index.html` in your browser
3. Start visualizing waveforms!

For local development with file loading, you may need to serve the files through a local web server:

```bash
python3 -m http.server 8080
# Then open http://localhost:8080
```

## License

See LICENSE file for details.
