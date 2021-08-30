# yes I'm doing this in Python lmao
import os
import sys
import subprocess


def compile_closure(js_source):
    p = subprocess.run([
        'java', '-jar', 'closure-compiler.jar',
        '--compilation_level', 'ADVANCED_OPTIMIZATIONS',
        '--language_out', 'ECMASCRIPT_2021'
    ], input=js_source.encode('utf-8'), capture_output=True)
    if p.stderr:
        print("\tClosure stderr:", p.stderr)
    p.check_returncode()
    return p.stdout.decode('utf-8')


def add_to_html(js_source):
    with open('index.html') as html_file:
        html_source = html_file.read()
    replaced = html_source.replace(
        '<script src="./main.js"></script>',
        f'<script>{js_source}</script>'
    )
    assert html_source != replaced
    return replaced


def write_html_and_zip(html_source):
    with open('compiled/index.html', 'w') as html_out_file:
        html_out_file.write(html_source)

    subprocess.check_call(['bash', '-c', "advzip -4 -a compiled.zip compiled/index.html"])


watch_mode = '--watch' in sys.argv
done_first_loop = False

while watch_mode or not done_first_loop:
    with open('main.js') as original_file:
        original_source = original_file.read()

    print('=' * 40)
    print("main.js length: ", len(original_source))
    closure_output = compile_closure(original_source)
    print("Closure length: ", len(closure_output))
    combined_html = add_to_html(closure_output)
    print("And with HTML: ", len(combined_html))
    write_html_and_zip(combined_html)

    print("And the final size is", os.path.getsize('compiled.zip'))
    print('=' * 40)

    done_first_loop = True