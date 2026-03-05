#!/usr/bin/env python3
"""
Локальное разделение аудио на stems через Demucs (полная модель).
Даёт лучшее качество, чем браузерная embedded-модель.

Установка: pip install demucs
Запуск: python scripts/separate_audio.py input.wav
Выход: папка separated/input/ с vocals.wav, drums.wav, bass.wav, other.wav
"""

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Разделение аудио на stems (Demucs)")
    parser.add_argument("input", type=Path, help="Входной аудиофайл (WAV/MP3/FLAC)")
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=None,
        help="Папка для вывода (по умолчанию: separated/<имя_файла>)"
    )
    parser.add_argument(
        "-n", "--model",
        default="htdemucs",
        choices=["htdemucs", "htdemucs_ft", "htdemucs_6s"],
        help="Модель: htdemucs (4 stems), htdemucs_6s (6 stems: +guitar, piano)"
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Ошибка: файл не найден: {args.input}", file=sys.stderr)
        return 1

    base_out = args.output or Path("separated") / args.input.stem
    base_out.mkdir(parents=True, exist_ok=True)
    # Demucs создаёт base_out/model_name/song_name/stem.wav
    demucs_out = Path("separated_demucs")
    demucs_out.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "demucs",
        "-n", args.model,
        "-o", str(demucs_out),
        str(args.input),
    ]

    print(f"Разделение: {args.input}")
    print("Модель Demucs загружается при первом запуске...")
    subprocess.run(cmd, check=True)

    # Копируем в удобную структуру: base_out/vocals.wav, drums.wav, ...
    model_dir = demucs_out / args.model
    song_dirs = list(model_dir.iterdir()) if model_dir.exists() else []
    if song_dirs:
        import shutil
        stem_dir = song_dirs[0]
        for f in stem_dir.glob("*.wav"):
            shutil.copy2(f, base_out / f.name)
    print(f"Готово. Stems в {base_out}/ (vocals.wav, drums.wav, bass.wav, other.wav)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
