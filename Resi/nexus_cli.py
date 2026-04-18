import os
import argparse
import sys
import io
import json
from PIL import Image

# KRYTYCZNE DLA WYDAJNOŚCI - blokujemy PyTorcha i ONNX na wielowątkowość by się nie dławił na tle
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

# Zamiast odpalać Flask, wgrywamy tylko obiekt procesora z Twojego pliku źródłowego app.py
from app import PackshotProcessor

def execute_pipeline():
    parser = argparse.ArgumentParser(description="Nexus ERP - AI Packshot Processor (Headless CLI)")
    parser.add_argument('--mode', required=True, choices=['full', 'extract-only', 'resize'])
    parser.add_argument('--input', required=True, help="Ścieżka do obrazka źródłowego")
    parser.add_argument('--output-dir', required=True, help="Katalog wyjściowy")
    parser.add_argument('--prefix', required=True, help="Prefiks do nazywania plików")
    
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Inicjalizacja Twojego wbudowanego narzędzia
    processor = PackshotProcessor()
    
    output_files = []
    
    try:
        with open(args.input, 'rb') as f:
            input_bytes = f.read()

        if args.mode in ('full', 'extract-only'):
            # Zastosowanie modelu IS-Net (rembg)
            img_no_bg = processor.remove_background(input_bytes)
            if not img_no_bg:
                print(json.dumps({"error": "Model rembg nie zdołał wyciąć obrazu."}))
                sys.exit(1)
            
            # Smart Crop
            img_processed = processor.crop_to_content(img_no_bg)
            
            png_path = os.path.join(args.output_dir, f"{args.prefix}_czyste.png")
            img_processed.save(png_path, format="PNG")
            output_files.append(png_path)
            
            if args.mode == 'extract-only':
                # Zwróć tylko czysty PNG w formacie list JSON do standardowego wyjścia
                print(json.dumps({"success": True, "files": output_files}))
                sys.exit(0)
                
            # Mode = full (przechodzi dalej w celu dopasowania na platformy)

        if args.mode == 'resize':
             # Pomiń IS-Net, odpal same matryce proporcji
             img_processed = Image.open(io.BytesIO(input_bytes)).convert("RGBA")
             fit_mode_val = 'fill' # Tryb Lifestyle o którym mówiliśmy
        else:
             fit_mode_val = 'fit'  # Tryb klasyczny (mode=full) - zachowuje marginesy

        # Obrazki dla docelowych platform na biaym tle (lub wypelnienie)
        # Allegro (2560px)
        img_allegro = processor.create_platform_image(img_processed, 2560, 0.90 if args.mode == 'full' else 1.0, fit_mode=fit_mode_val)
        allegro_path = os.path.join(args.output_dir, f"{args.prefix}_allegro_ready.jpg")
        processor.save_image_with_size_limit(img_allegro, allegro_path, 20)
        output_files.append(allegro_path)
        
        # Amazon (3000px)
        img_amazon = processor.create_platform_image(img_processed, 3000, 0.95 if args.mode == 'full' else 1.0, fit_mode=fit_mode_val)
        amazon_path = os.path.join(args.output_dir, f"{args.prefix}_amazon_szablon.MAIN.jpg")
        processor.save_image_with_size_limit(img_amazon, amazon_path, 9.5)
        output_files.append(amazon_path)

        # eMag (3000px)
        img_emag = processor.create_platform_image(img_processed, 3000, 0.85 if args.mode == 'full' else 1.0, fit_mode=fit_mode_val)
        emag_path = os.path.join(args.output_dir, f"{args.prefix}_emag_ready.jpg")
        processor.save_image_with_size_limit(img_emag, emag_path, 7.5)
        output_files.append(emag_path)

        # Kaufland (2048px)
        img_kaufland = processor.create_platform_image(img_processed, 2048, 0.95 if args.mode == 'full' else 1.0, fit_mode=fit_mode_val)
        kaufland_path = os.path.join(args.output_dir, f"{args.prefix}_kaufland.jpg")
        processor.save_image_with_size_limit(img_kaufland, kaufland_path, 9.5)
        output_files.append(kaufland_path)

        # Informujemy Węzeł o poprawnym przetworzeniu, zwracając listę absolutnych sciezke zapisanych matryc
        print(json.dumps({"success": True, "files": output_files}))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    execute_pipeline()
