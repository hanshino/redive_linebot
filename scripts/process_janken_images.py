#!/usr/bin/env python3
"""
Process Gemini-generated janken images:
1. Remove checkered background (make transparent)
2. Split each image into individual icons
3. Save as separate PNGs with proper names
"""

from PIL import Image
import numpy as np
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "assets", "janken")
INPUT_DIR = os.path.join(os.path.dirname(__file__), "..")

# Map input files to their content descriptions and background type
# bg_type: "checkered" for gray/white grid, "dark" for dark background
FILES = {
    "Gemini_Generated_Image_oopy34oopy34oopy.png": {
        "names": ["rock", "scissors", "paper"],
        "bg_type": "checkered",
    },
    "Gemini_Generated_Image_n1xjaun1xjaun1xj.png": {
        "names": ["win", "draw", "lose"],
        "bg_type": "checkered",
    },
    "Gemini_Generated_Image_ls7r8nls7r8nls7r.png": {
        "names": ["vs"],
        "bg_type": "checkered",
    },
    "Gemini_Generated_Image_od68acod68acod68.png": {
        "names": ["rank_beginner"],
        "bg_type": "dark",
    },
    "Gemini_Generated_Image_s1kp1es1kp1es1kp.png": {
        "names": ["rank_challenger"],
        "bg_type": "dark",
    },
    "Gemini_Generated_Image_26nzma26nzma26nz.png": {
        "names": ["rank_fighter"],
        "bg_type": "dark",
    },
    "Gemini_Generated_Image_9qe9ua9qe9ua9qe9.png": {
        "names": ["rank_master"],
        "bg_type": "dark",
    },
    "Gemini_Generated_Image_e94lkye94lkye94l.png": {
        "names": ["rank_legend"],
        "bg_type": "dark",
    },
}


def remove_checkered_bg(img):
    """Remove the gray/white checkered background pattern and make it transparent.

    The checkered pattern alternates between white (#FFFFFF) and light gray (#CCCCCC)
    in a grid. We detect these pixels and also handle semi-transparent glow edges.
    """
    img = img.convert("RGBA")
    data = np.array(img, dtype=np.int32)

    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

    # Calculate saturation: difference between max and min RGB channels
    max_rgb = np.maximum(np.maximum(r, g), b)
    min_rgb = np.minimum(np.minimum(r, g), b)
    diff = max_rgb - min_rgb

    # The checkered bg uses two colors: white (255,255,255) and light gray (~204,204,204)
    # Pure background: very low saturation AND brightness >= 190
    is_pure_bg = (diff < 15) & (max_rgb >= 190)

    # Semi-transparent glow areas: low saturation, moderate-high brightness
    # These are edges where glow effects blend with the checkered pattern
    is_semi_bg = (diff < 25) & (max_rgb >= 170) & (min_rgb >= 160)

    # Combined background mask
    is_bg = is_pure_bg | is_semi_bg

    # Make background transparent
    result = data.copy()
    result[is_bg] = [0, 0, 0, 0]

    # For pixels near the edges of content, reduce alpha based on how "gray" they are
    # This creates smoother edges
    edge_zone = (diff < 40) & (max_rgb >= 150) & (~is_bg)
    # Scale alpha based on saturation - more saturated = more opaque
    alpha_scale = np.clip(diff[edge_zone].astype(float) / 40.0, 0.3, 1.0)
    result[edge_zone, 3] = (255 * alpha_scale).astype(np.int32)

    return Image.fromarray(result.astype(np.uint8))


def remove_dark_bg(img):
    """Remove dark background using flood fill from edges.

    Instead of removing all dark pixels globally (which damages dark content),
    we flood fill from the corners/edges inward, only removing connected dark regions.
    """
    from scipy import ndimage

    img = img.convert("RGBA")
    data = np.array(img, dtype=np.int32)

    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]
    max_rgb = np.maximum(np.maximum(r, g), b)
    min_rgb = np.minimum(np.minimum(r, g), b)
    diff = max_rgb - min_rgb

    # Pixels that COULD be background (dark and low saturation)
    could_be_bg = (max_rgb < 70) & (diff < 10)

    # Label connected regions of potential background pixels
    labeled, num_features = ndimage.label(could_be_bg)

    # Find which labels touch the image edges
    h, w = labeled.shape
    edge_labels = set()
    edge_labels.update(labeled[0, :].tolist())  # top
    edge_labels.update(labeled[h - 1, :].tolist())  # bottom
    edge_labels.update(labeled[:, 0].tolist())  # left
    edge_labels.update(labeled[:, w - 1].tolist())  # right
    edge_labels.discard(0)  # 0 = not a region

    # Only remove regions connected to edges
    is_bg = np.isin(labeled, list(edge_labels))

    result = data.copy()
    result[is_bg] = [0, 0, 0, 0]

    # Smooth edges: fade pixels adjacent to removed background
    # Dilate the background mask slightly to find edge pixels
    dilated = ndimage.binary_dilation(is_bg, iterations=2)
    edge_zone = dilated & (~is_bg) & (max_rgb < 100)
    if np.any(edge_zone):
        alpha_scale = np.clip(max_rgb[edge_zone].astype(float) / 100.0, 0.2, 1.0)
        result[edge_zone, 3] = (255 * alpha_scale).astype(np.int32)

    return Image.fromarray(result.astype(np.uint8))


def find_split_points(img, num_parts):
    """Find vertical split points by looking for columns that are mostly transparent."""
    data = np.array(img)
    alpha = data[:, :, 3]

    # Sum alpha values per column
    col_alpha = alpha.sum(axis=0)

    width = img.width

    if num_parts == 1:
        return [(0, width)]

    # Find valleys (low alpha columns) to split on
    # Divide into rough segments first
    segment_width = width // num_parts
    boundaries = [0]

    for i in range(1, num_parts):
        # Search around the expected split point
        center = i * segment_width
        search_start = max(0, center - segment_width // 4)
        search_end = min(width, center + segment_width // 4)

        # Find the column with minimum alpha in the search range
        search_range = col_alpha[search_start:search_end]
        split_col = search_start + np.argmin(search_range)
        boundaries.append(split_col)

    boundaries.append(width)

    return list(zip(boundaries[:-1], boundaries[1:]))


def crop_to_content(img):
    """Crop image to its non-transparent content with some padding."""
    bbox = img.getbbox()
    if bbox is None:
        return img

    # Add small padding
    pad = 4
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(img.width, bbox[2] + pad)
    bottom = min(img.height, bbox[3] + pad)

    return img.crop((left, top, right, bottom))


def process_image(filename, names, bg_type="checkered"):
    """Process a single source image: remove bg, split, and save."""
    filepath = os.path.join(INPUT_DIR, filename)
    print(f"\nProcessing: {filename} (bg: {bg_type})")

    img = Image.open(filepath)
    print(f"  Original size: {img.size}")

    # For single-icon images, crop to center square first to remove corner artifacts
    if len(names) == 1:
        w, h = img.size
        if w != h:
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            img = img.crop((left, top, left + side, top + side))
            print(f"  Cropped to square: {img.size}")

    # Remove background based on type
    if bg_type == "dark":
        img = remove_dark_bg(img)
    else:
        img = remove_checkered_bg(img)

    # Split into parts
    splits = find_split_points(img, len(names))
    print(f"  Split points: {splits}")

    for (left, right), name in zip(splits, names):
        part = img.crop((left, 0, right, img.height))
        part = crop_to_content(part)

        # Resize to consistent size (512x512 for hand gestures, keep aspect for badges)
        target_size = 512
        aspect = part.width / part.height
        if aspect > 1:
            new_w = target_size
            new_h = int(target_size / aspect)
        else:
            new_h = target_size
            new_w = int(target_size * aspect)

        part = part.resize((new_w, new_h), Image.LANCZOS)

        # Center on a square transparent canvas
        canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
        offset_x = (target_size - new_w) // 2
        offset_y = (target_size - new_h) // 2
        canvas.paste(part, (offset_x, offset_y))

        output_path = os.path.join(OUTPUT_DIR, f"{name}.png")
        canvas.save(output_path, "PNG")
        print(f"  Saved: {name}.png ({new_w}x{new_h})")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for filename, config in FILES.items():
        process_image(filename, config["names"], config["bg_type"])

    print(f"\nDone! All images saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
