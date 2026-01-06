#!/bin/bash

# Generate PNG icons from SVG using ImageMagick (if available) or alternative methods
# This script will create all the required icon sizes for the PWA manifest

ICON_SVG="static/icons/icon.svg"
ICON_DIR="static/icons"

# Icon sizes needed for the manifest
SIZES=(72 96 128 144 152 192 384 512)

echo "Generating PNG icons from SVG..."

# Check if ImageMagick is available
if command -v convert >/dev/null 2>&1; then
    echo "Using ImageMagick convert..."
    for size in "${SIZES[@]}"; do
        echo "Generating ${size}x${size} icon..."
        convert "$ICON_SVG" -resize "${size}x${size}" "$ICON_DIR/icon-${size}x${size}.png"
    done
elif command -v magick >/dev/null 2>&1; then
    echo "Using ImageMagick magick..."
    for size in "${SIZES[@]}"; do
        echo "Generating ${size}x${size} icon..."
        magick "$ICON_SVG" -resize "${size}x${size}" "$ICON_DIR/icon-${size}x${size}.png"
    done
elif command -v inkscape >/dev/null 2>&1; then
    echo "Using Inkscape..."
    for size in "${SIZES[@]}"; do
        echo "Generating ${size}x${size} icon..."
        inkscape --export-png="$ICON_DIR/icon-${size}x${size}.png" --export-width="$size" --export-height="$size" "$ICON_SVG"
    done
elif command -v rsvg-convert >/dev/null 2>&1; then
    echo "Using rsvg-convert..."
    for size in "${SIZES[@]}"; do
        echo "Generating ${size}x${size} icon..."
        rsvg-convert -w "$size" -h "$size" "$ICON_SVG" > "$ICON_DIR/icon-${size}x${size}.png"
    done
else
    echo "Warning: No SVG to PNG converter found."
    echo "Please install one of the following:"
    echo "  - ImageMagick (convert or magick command)"
    echo "  - Inkscape"
    echo "  - librsvg (rsvg-convert command)"
    echo ""
    echo "For now, copying the SVG as a fallback..."
    for size in "${SIZES[@]}"; do
        cp "$ICON_SVG" "$ICON_DIR/icon-${size}x${size}.svg"
    done
fi

echo "Icon generation complete!"
echo "Generated icons in $ICON_DIR/"
ls -la "$ICON_DIR/"