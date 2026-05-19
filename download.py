import urllib.request
import os

os.makedirs('frontend/models', exist_ok=True)
urls = [
    'https://raw.githubusercontent.com/tk256ailab/vrm-viewer/master/VRM/sample.vrm',
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@v2.0.6/packages/three-vrm/examples/models/three-vrm-girl.vrm'
]

downloaded = False
for url in urls:
    try:
        print(f"Trying download from: {url}")
        # Add user-agent header to prevent blockages
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            with open('frontend/models/avatar.vrm', 'wb') as out_file:
                out_file.write(response.read())
        print("Download complete!")
        downloaded = True
        break
    except Exception as e:
        print(f"Failed to download from this URL: {e}")

if not downloaded:
    print("Could not download any default model. Please drag & drop your own .vrm model into the browser!")
else:
    print("Model downloaded successfully to frontend/models/avatar.vrm")
