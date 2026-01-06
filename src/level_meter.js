/**
 * Level Meter Module (Class Version)
 * Handles the visualization of audio levels.
 * Usage:
 *   import { LevelMeter } from './modules/level_meter.js';
 *   const meter = new LevelMeter('levelMeter');
 *   meter.update(0.5);
 */

export class LevelMeter {
    constructor(canvasId = 'levelMeter') {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = canvasId;
            this.canvas.width = 200;
            this.canvas.height = 20;
            document.body.appendChild(this.canvas);
        }
        this.ctx = this.canvas.getContext('2d');
        this.clear();
    }

    update(level) {
        if (!this.ctx) return;
        const width = this.canvas.width;
        const height = this.canvas.height;
        // Clamp level between 0 and 1
        level = Math.max(0, Math.min(1, level));

        // Clear
        this.ctx.clearRect(0, 0, width, height);

        // Draw background
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, width, height);

        // Draw level
        const meterWidth = width * level;
        this.ctx.fillStyle = level > 0.8 ? '#e74c3c' : (level > 0.5 ? '#f1c40f' : '#2ecc71');
        this.ctx.fillRect(0, 0, meterWidth, height);
    }

    clear() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
