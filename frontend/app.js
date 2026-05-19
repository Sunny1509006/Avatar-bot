import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// Global variables
let scene, camera, renderer, orbitControls;
let currentVRM = null;
let clock = new THREE.Clock();
let mixier = null; // Optional if we load custom anims

// Audio and Lip-Sync Web Audio variables
let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let isAudioPlaying = false;

// Head tracking variables
const mousePosition = new THREE.Vector2();
const targetLookAt = new THREE.Vector3();

// Blinking logic
let lastBlinkTime = 0;
let nextBlinkInterval = 4.0;
let blinkDuration = 0.15;
let blinkState = 'open'; // 'open', 'closing', 'opening'

// UI Elements
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const statusText = document.getElementById('status-text');
const statusDot = document.querySelector('.status-dot');

const toggleSettingsBtn = document.getElementById('toggle-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsForm = document.getElementById('settings-form');

const llmProvider = document.getElementById('llm-provider');
const openaiKeysGroup = document.getElementById('openai-keys-group');
const geminiKeysGroup = document.getElementById('gemini-keys-group');
const openaiTtsGroup = document.getElementById('openai-tts-group');
const ttsProvider = document.getElementById('tts-provider');

const vrmFileInput = document.getElementById('vrm-file-input');
const clearChatBtn = document.getElementById('clear-chat');

// Initialize settings from localStorage or defaults
const settings = {
    provider: localStorage.getItem('aria_provider') || 'openai',
    openaiKey: localStorage.getItem('aria_openai_key') || '',
    geminiKey: localStorage.getItem('aria_gemini_key') || '',
    ttsProvider: localStorage.getItem('aria_tts_provider') || 'google',
    ttsVoice: localStorage.getItem('aria_tts_voice') || 'alloy',
    cameraFov: parseFloat(localStorage.getItem('aria_camera_fov')) || 35,
    ambientLight: parseFloat(localStorage.getItem('aria_ambient_light')) || 1.0,
};

// ----------------------------------------------------
// 1. Initialization and Scene Setup
// ----------------------------------------------------
function init() {
    // 3D Scene setup
    scene = new THREE.Scene();
    
    // Camera
    camera = new THREE.PerspectiveCamera(settings.cameraFov, window.innerWidth / window.innerHeight, 0.1, 20.0);
    camera.position.set(0.0, 1.2, 1.8); // Zoom out to show full upper body

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.screenSpacePanning = true;
    orbitControls.target.set(0.0, 1.2, 0.0); // Center target
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.minDistance = 0.5;
    orbitControls.maxDistance = 5.0;
    orbitControls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit under floor rotation

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, settings.ambientLight);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2.0, 4.0, 2.0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    // Floor and Grid
    // Commented out to prevent room-like view and keep UI floating & premium
    // const gridHelper = new THREE.GridHelper(10, 20, 0x4f46e5, 0x1e1b4b);
    // gridHelper.position.y = -0.01;
    // scene.add(gridHelper);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);

    // Load Default Model
    loadModel('models/avatar.vrm', 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@v2.0.6/packages/three-vrm/examples/models/three-vrm-girl.vrm');
    
    // Populate Form Inputs from LocalStorage values
    populateSettingsForm();
    setupUIEventListeners();
    setupSpeechRecognition();
}

// ----------------------------------------------------
// 2. Model Loading Logic
// ----------------------------------------------------
function loadModel(url, fallbackUrl = null) {
    updateStatus('Loading 3D model...', 'orange');
    
    // If an existing model is in scene, remove it
    if (currentVRM) {
        scene.remove(currentVRM.scene);
        currentVRM.scene.traverse((object) => {
            if (object.isMesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach((mat) => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        currentVRM = null;
    }

    const loader = new GLTFLoader();
    
    // Register VRMLoaderPlugin
    loader.register((parser) => {
        return new VRMLoaderPlugin(parser);
    });

    loader.load(
        url,
        (gltf) => {
            const vrm = gltf.userData.vrm;
            currentVRM = vrm;
            
            // Disable frustum culling to prevent glitches when rotating camera
            vrm.scene.traverse((object) => {
                object.frustumCulled = false;
                if (object.isMesh) {
                    object.castShadow = true;
                    object.receiveShadow = true;
                }
            });

            // Adjust posture/bones if needed
            vrm.scene.rotation.y = Math.PI; // Face towards camera
            scene.add(vrm.scene);

            // Position target for lookAt
            vrm.lookAt.target = new THREE.Object3D();
            scene.add(vrm.lookAt.target);
            
            // Center the avatar in the UI body by shifting her UP in world space
            vrm.scene.position.y = 0.8;
            
            // Calculate head height dynamically for gaze tracking
            const box = new THREE.Box3().setFromObject(vrm.scene);
            vrm.headHeight = box.max.y * 0.90; // approx head level
            
            updateStatus('Ready', 'green');
            console.log('Successfully loaded VRM model:', vrm);
        },
        (progress) => {
            const percentage = Math.round((progress.loaded / progress.total) * 100);
            updateStatus(`Loading model... ${percentage}%`, 'orange');
        },
        (error) => {
            console.error('Error loading VRM model:', error);
            if (fallbackUrl) {
                console.log(`Attempting fallback to model URL: ${fallbackUrl}`);
                loadModel(fallbackUrl, null);
            } else {
                updateStatus('Failed to load avatar model.', 'orange');
                addChatMessage('System', 'Failed to load the 3D model. Drag-and-drop a custom VRM or refresh to try again.', 'system');
            }
        }
    );
}

// ----------------------------------------------------
// 3. User Interface Event Handlers
// ----------------------------------------------------
function setupUIEventListeners() {
    // Gear Button -> Modal Toggle
    toggleSettingsBtn.addEventListener('click', () => {
        settingsOverlay.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsOverlay.classList.add('hidden');
    });

    // Close on click outside modal
    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) {
            settingsOverlay.classList.add('hidden');
        }
    });

    // Provider Selector Change
    llmProvider.addEventListener('change', (e) => {
        if (e.target.value === 'gemini') {
            geminiKeysGroup.classList.remove('hidden');
            openaiKeysGroup.classList.add('hidden');
        } else {
            openaiKeysGroup.classList.remove('hidden');
            geminiKeysGroup.classList.add('hidden');
        }
    });

    // TTS Provider Selector Change
    ttsProvider.addEventListener('change', (e) => {
        if (e.target.value === 'openai') {
            openaiTtsGroup.classList.remove('hidden');
        } else {
            openaiTtsGroup.classList.add('hidden');
        }
    });

    // Handle Form Submit (Save Settings)
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        settings.provider = llmProvider.value;
        settings.openaiKey = document.getElementById('openai-api-key').value;
        settings.geminiKey = document.getElementById('gemini-api-key').value;
        settings.ttsProvider = ttsProvider.value;
        settings.ttsVoice = document.getElementById('tts-voice').value;
        settings.cameraFov = parseFloat(document.getElementById('camera-fov').value);
        settings.ambientLight = parseFloat(document.getElementById('ambient-light-intensity').value);

        // Store to localStorage
        localStorage.setItem('aria_provider', settings.provider);
        localStorage.setItem('aria_openai_key', settings.openaiKey);
        localStorage.setItem('aria_gemini_key', settings.geminiKey);
        localStorage.setItem('aria_tts_provider', settings.ttsProvider);
        localStorage.setItem('aria_tts_voice', settings.ttsVoice);
        localStorage.setItem('aria_camera_fov', settings.cameraFov);
        localStorage.setItem('aria_ambient_light', settings.ambientLight);

        // Apply visual updates instantly
        camera.fov = settings.cameraFov;
        camera.updateProjectionMatrix();
        
        // Update ambient light strength
        scene.traverse((child) => {
            if (child.isAmbientLight) child.intensity = settings.ambientLight;
        });

        settingsOverlay.classList.add('hidden');
        addChatMessage('System', 'Configurations saved successfully!', 'system');
    });

    // Handle Custom VRM File Upload / Drag & Drop
    vrmFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const blobUrl = URL.createObjectURL(file);
            loadModel(blobUrl);
        }
    });

    // Drag and drop handler on body
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.vrm')) {
            const blobUrl = URL.createObjectURL(file);
            loadModel(blobUrl);
        }
    });

    // Send Button click
    sendBtn.addEventListener('click', submitMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitMessage();
    });

    // Clear Chat
    clearChatBtn.addEventListener('click', () => {
        chatMessages.innerHTML = '';
        addChatMessage('System', 'Chat log cleared. Ready to start!', 'system');
    });
}

function populateSettingsForm() {
    llmProvider.value = settings.provider;
    document.getElementById('openai-api-key').value = settings.openaiKey;
    document.getElementById('gemini-api-key').value = settings.geminiKey;
    ttsProvider.value = settings.ttsProvider;
    document.getElementById('tts-voice').value = settings.ttsVoice;
    document.getElementById('camera-fov').value = settings.cameraFov;
    document.getElementById('ambient-light-intensity').value = settings.ambientLight;

    // Trigger UI updates
    llmProvider.dispatchEvent(new Event('change'));
    ttsProvider.dispatchEvent(new Event('change'));
}

// ----------------------------------------------------
// 4. Voice Dictation / Speech Recognition
// ----------------------------------------------------
let recognition = null;
let isListening = false;

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.style.display = 'none';
        console.warn('SpeechRecognition not supported in this browser.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add('recording');
        updateStatus('Listening...', 'blue');
        userInput.placeholder = "Listening to your voice...";
    };

    recognition.onerror = (e) => {
        console.error('Speech recognition error:', e);
        stopListening();
    };

    recognition.onend = () => {
        stopListening();
    };

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        userInput.value = transcript;
        submitMessage(); // Send immediately for hands-free natural flow
    };

    micBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            // Stop any playing TTS audio before listening to user voice
            stopAudio();
            recognition.start();
        }
    });
}

function stopListening() {
    isListening = false;
    micBtn.classList.remove('recording');
    updateStatus('Ready', 'green');
    userInput.placeholder = "Type a message to Aria...";
}

// ----------------------------------------------------
// 5. Chat Communication & API Integration
// ----------------------------------------------------
async function submitMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // Add user message bubble
    addChatMessage('User', text, 'user');
    userInput.value = '';
    
    // Check key requirements before calling server
    const activeKey = settings.provider === 'openai' ? settings.openaiKey : settings.geminiKey;
    if (settings.provider === 'openai' && !activeKey) {
        addChatMessage('System', 'Warning: OpenAI key is missing. Click the settings gear icon above to add it.', 'system');
        return;
    }

    updateStatus('Thinking...', 'orange');
    stopAudio(); // Stop any overlapping audio

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                provider: settings.provider,
                api_key: activeKey,
                model: settings.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash',
                tts_provider: settings.ttsProvider,
                tts_voice: settings.ttsVoice
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Internal server error');
        }

        const data = await response.json(); // { text, emotion, audio }
        
        // Show AI response
        addChatMessage('Aria', data.text, 'ai');
        
        // Apply facial expression
        applyExpression(data.emotion);

        // Play TTS Voice audio
        playAudio(data.audio);

    } catch (e) {
        console.error(e);
        updateStatus('Error response', 'orange');
        addChatMessage('System', `Failed to get reply: ${e.message}`, 'system');
    }
}

function addChatMessage(sender, text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerText = text;
    
    messageDiv.appendChild(bubble);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateStatus(text, color) {
    statusText.innerText = text;
    statusDot.className = `status-dot ${color}`;
}

// ----------------------------------------------------
// 6. Facial Expressions (VRM Preset Mapping)
// ----------------------------------------------------
function applyExpression(emotion) {
    if (!currentVRM || !currentVRM.expressionManager) return;

    // Reset current active expression values (except blink/mouth)
    const presetNames = ['happy', 'angry', 'sad', 'relaxed', 'joy', 'sorrow', 'fun', 'surprised'];
    presetNames.forEach((preset) => {
        try {
            currentVRM.expressionManager.setValue(preset, 0.0);
        } catch (e) {}
    });

    // Smooth expression activation mapping
    let mappedExpression = 'neutral';
    let value = 0.95;

    switch (emotion) {
        case 'joy':
            // Try both 'happy' and 'joy' for cross-model compatibility
            vrmSetValueSafe('happy', value);
            vrmSetValueSafe('joy', value);
            break;
        case 'angry':
            vrmSetValueSafe('angry', value);
            break;
        case 'sorrow':
            vrmSetValueSafe('sad', value);
            vrmSetValueSafe('sorrow', value);
            break;
        case 'fun':
            vrmSetValueSafe('relaxed', value);
            vrmSetValueSafe('fun', value);
            break;
        default:
            // Neutral - expressions are already zeroed out
            break;
    }
}

function vrmSetValueSafe(preset, val) {
    try {
        currentVRM.expressionManager.setValue(preset, val);
    } catch(e) {}
}

// ----------------------------------------------------
// 7. Web Audio Playback & Lip Sync
// ----------------------------------------------------
async function playAudio(base64DataUrl) {
    try {
        // Initialize AudioContext if not done yet (browsers block auto-init)
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        updateStatus('Speaking...', 'blue');

        // Extract base64 payload
        const base64Bytes = base64DataUrl.split(',')[1];
        const arrayBuffer = base64ToArrayBuffer(base64Bytes);

        // Decode audio
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Set up audio source node
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;

        // Set up analyzer for Lip-Sync
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 512;
        
        // Connect nodes
        audioSource.connect(audioAnalyser);
        audioAnalyser.connect(audioContext.destination);

        // Events
        audioSource.onended = () => {
            stopAudio();
            updateStatus('Ready', 'green');
            // Smooth back to neutral face after talking finishes
            setTimeout(() => applyExpression('neutral'), 1000);
        };

        isAudioPlaying = true;
        audioSource.start(0);

    } catch (e) {
        console.error('Audio playback failed:', e);
        updateStatus('Playback failed', 'orange');
    }
}

function stopAudio() {
    isAudioPlaying = false;
    if (audioSource) {
        try {
            audioSource.stop();
        } catch(e) {}
        audioSource = null;
    }
    // Close mouth completely
    vrmSetValueSafe('aa', 0.0);
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// ----------------------------------------------------
// 8. Animation & Render Loop
// ----------------------------------------------------
function onMouseMove(event) {
    // Normalize coordinates (-1 to +1)
    mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    if (currentVRM) {
        // A. Breathing and Dynamic Body Sway Idle Motion
        const breathingFactor = Math.sin(elapsedTime * 1.5);
        const swayFactor = Math.sin(elapsedTime * 0.8);
        
        // Hips & body sway (simulating natural standing weight shifts)
        const hips = currentVRM.humanoid.getNormalizedBoneNode('hips');
        if (hips) {
            hips.position.x = swayFactor * 0.012; // gentle side-to-side shift
            hips.position.y = (Math.sin(elapsedTime * 1.6) * 0.004) - 0.002; // subtle breathing bounce
        }

        // Spine and neck breathing
        const spine = currentVRM.humanoid.getNormalizedBoneNode('spine');
        if (spine) {
            spine.rotation.z = breathingFactor * 0.005 + swayFactor * 0.003;
            spine.rotation.x = breathingFactor * 0.012;
        }
        const neck = currentVRM.humanoid.getNormalizedBoneNode('neck');
        if (neck) {
            neck.rotation.x = breathingFactor * 0.008;
            neck.rotation.y = swayFactor * 0.01; // subtle head tilt/sway
        }

        // B. Lowering Arms from stiff T-pose to a natural standing A-pose with gentle sway
        const leftUpperArm = currentVRM.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = currentVRM.humanoid.getNormalizedBoneNode('rightUpperArm');
        const leftLowerArm = currentVRM.humanoid.getNormalizedBoneNode('leftLowerArm');
        const rightLowerArm = currentVRM.humanoid.getNormalizedBoneNode('rightLowerArm');
        
        const armSway = Math.sin(elapsedTime * 0.8) * 0.02;
        
        if (leftUpperArm) {
            leftUpperArm.rotation.z = 1.25 + armSway; // lower arm naturally (positive Z)
            leftUpperArm.rotation.x = 0.08 + Math.cos(elapsedTime * 0.8) * 0.01; // slight forward swing
        }
        if (rightUpperArm) {
            rightUpperArm.rotation.z = -1.25 - armSway; // lower arm naturally (negative Z)
            rightUpperArm.rotation.x = 0.08 + Math.cos(elapsedTime * 0.8) * 0.01; // slight forward swing
        }
        if (leftLowerArm) {
            leftLowerArm.rotation.y = 0.15; // natural slight bend
        }
        if (rightLowerArm) {
            rightLowerArm.rotation.y = -0.15; // natural slight bend
        }

        // C. Randomized Natural Eye Blinking
        handleBlinking(elapsedTime);

        // C. Cursor Head Tracking (LookAt target)
        // Project mouse position into 3D space to feed looking target
        const lookAtHeight = currentVRM.headHeight || 1.35;
        targetLookAt.set(
            mousePosition.x * 2.0,
            lookAtHeight + mousePosition.y * 1.0,
            0.5
        );
        currentVRM.lookAt.target.position.copy(targetLookAt);

        // D. Real-Time Lip-Sync
        if (isAudioPlaying && audioAnalyser) {
            const frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
            audioAnalyser.getByteFrequencyData(frequencyData);

            // Measure average volume amplitude
            let sum = 0;
            for (let i = 0; i < frequencyData.length; i++) {
                sum += frequencyData[i];
            }
            const averageVolume = sum / frequencyData.length;

            // Normalize volume range into opening intensity (0 to 1)
            let lipSyncIntensity = Math.min(averageVolume / 45.0, 1.0); // Adjust divisor for mouth amplitude responsiveness
            
            // Map to standard 'aa' mouth open expression
            vrmSetValueSafe('aa', lipSyncIntensity);
        }

        // Update VRM Physics and Constraints
        currentVRM.update(deltaTime);
    }

    if (orbitControls) orbitControls.update();

    renderer.render(scene, camera);
}

function handleBlinking(elapsedTime) {
    if (elapsedTime - lastBlinkTime > nextBlinkInterval) {
        blinkState = 'closing';
        lastBlinkTime = elapsedTime;
        nextBlinkInterval = 2.0 + Math.random() * 4.0; // random gap between blinks
    }

    if (blinkState === 'closing') {
        const progress = (elapsedTime - lastBlinkTime) / (blinkDuration / 2);
        if (progress >= 1.0) {
            vrmSetValueSafe('blink', 1.0);
            blinkState = 'opening';
        } else {
            vrmSetValueSafe('blink', progress);
        }
    } else if (blinkState === 'opening') {
        const progress = (elapsedTime - (lastBlinkTime + blinkDuration / 2)) / (blinkDuration / 2);
        if (progress >= 1.0) {
            vrmSetValueSafe('blink', 0.0);
            blinkState = 'open';
        } else {
            vrmSetValueSafe('blink', 1.0 - progress);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start everything
init();
animate();
