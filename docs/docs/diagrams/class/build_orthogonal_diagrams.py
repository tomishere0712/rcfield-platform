import os
import subprocess

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    puml_dir = os.path.join(base_dir, 'puml')
    jar_path = os.path.join(base_dir, 'plantuml.jar')

    print("=== Compiling PlantUML Diagrams to docs/diagrams/class/ (300 DPI) ===")
    
    cmd = [
        'java',
        '-DPLANTUML_LIMIT_SIZE=16384',
        '-jar', jar_path,
        '-dpi', '300',
        '-tpng',
        '-o', base_dir,
        os.path.join(puml_dir, '*.puml')
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print("Successfully compiled all 10 PlantUML class diagrams directly to docs/diagrams/class/*.png at 300 DPI!")
    else:
        print("Error compiling PlantUML PNGs:", res.stderr)

if __name__ == '__main__':
    main()
