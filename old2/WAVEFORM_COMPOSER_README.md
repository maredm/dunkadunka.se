# 2-Channel Waveform Composer

A web-based tool for creating composite 2-channel (stereo) waveforms from source audio files in the `static/p501` directory.

## Features

- **Multi-clip Composition**: Add multiple audio clips to create complex test signals
- **Channel Selection**: Place clips in either left (channel 0) or right (channel 1) channel
- **Precise Timing**: Set exact start times for each clip (in seconds)
- **Level Control**: Set target active speech levels for each clip (in dB)
- **Real-time Preview**: Visualize the composed waveform before downloading
- **WAV Export**: Download the final composition as a stereo WAV file

## Usage

### Accessing the Tool

Open `waveform-composer.html` in your web browser.

### Composition Settings

1. **Sample Rate**: Select the output sample rate (8000, 16000, 32000, or 48000 Hz)
2. **Duration**: Set the total duration of the output file in seconds

### Adding Clips

1. **Select Source File**: Choose an audio file from the `static/p501` directory
2. **Channel**: Select which channel (Left/0 or Right/1) to place the clip in
3. **Start Time**: Set when the clip should begin (in seconds)
4. **Target Level**: Set the target active speech level in dB (e.g., -26 dB)
5. Click **Add Clip** to add it to the timeline

### Managing Clips

- **Edit**: Change channel, start time, or target level directly in each clip card
- **Remove**: Click the "Remove" button on any clip to delete it
- Clips are displayed sorted by start time

### Preview and Export

1. **Compose Waveform**: Click to process all clips and create the composite waveform
2. **Preview**: View waveform visualizations for both channels
3. **Download WAV**: Export the final composition as a stereo WAV file

## Active Speech Level Normalization

The tool uses a simplified P.56-like algorithm to calculate and normalize active speech levels:

- Analyzes audio in 200ms blocks
- Identifies active portions above -70 dB threshold
- Takes the upper 15% of active blocks as "active speech"
- Normalizes to the target level specified for each clip

## Technical Details

### Architecture

- **TypeScript Module**: `src/waveform-composer.ts` - Core composition logic
- **HTML Interface**: `waveform-composer.html` - User interface
- **Compiled Output**: `dist/waveform-composer.js` - JavaScript bundle

### Implementation

- Level calculation and normalization
- Sample rate conversion (linear interpolation)
- Stereo interleaving and WAV file generation
- Canvas-based waveform visualization

## Building

To rebuild after modifying TypeScript source:

```bash
npm run build
```

## Available Source Files

The tool includes access to all files in `static/p501/`, including:

- ITU-T P.501 test signals (speech, noise, etc.)
- Male and female talkers
- Various noise backgrounds (cafeteria, car, street, etc.)
- Conditioning sequences
- Double-talk and single-talk sequences

## Example Use Cases

1. **Stereo Test Signal**: Place different talkers in left and right channels
2. **Echo Test**: Place same signal in both channels with time offset
3. **Speech + Noise**: Combine speech in one channel with noise in another
4. **Level Testing**: Create signals with precise level relationships
5. **Double-talk Scenarios**: Compose overlapping speech from multiple sources
