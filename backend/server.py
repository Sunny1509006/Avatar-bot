import re
import os
import base64
import io
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

# AI Engines
import google.generativeai as genai
from openai import OpenAI
from gtts import gTTS

app = FastAPI(title="Talking Avatar Backend")

# Enable CORS for frontend connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    provider: str = "openai"  # "openai" or "gemini"
    api_key: Optional[str] = None
    model: Optional[str] = None
    tts_provider: str = "google"  # "google" or "openai"
    tts_voice: Optional[str] = "alloy"  # alloy, echo, fable, onyx, nova, shimmer

class ChatResponse(BaseModel):
    text: str
    emotion: str
    audio: str  # Base64 data URL

SYSTEM_PROMPT = """You are a friendly, helpful, and interactive AI 3D talking avatar companion named Aria.
You MUST begin your response with a single facial emotion tag enclosed in square brackets.
The ONLY supported tags are:
- [face:neutral] (calm, resting expression)
- [face:joy] (happy, laughing, smiling expression)
- [face:angry] (mad, annoyed expression)
- [face:sorrow] (sad, soft, empathetic expression)
- [face:fun] (excited, playful expression)

You must select the tag that best represents the emotional tone of your response, and place it at the VERY beginning of your reply. Do not put any other tags anywhere else. Keep your response brief, natural, and conversational (1-3 sentences maximum), suitable for a real-time vocal conversation.

Example output:
[face:joy] Hello there! I am absolutely thrilled to chat with you today. How can I help you?
"""

def generate_llm_response(request: ChatRequest) -> str:
    # Resolve API Key: passed in request or environment variable
    api_key = request.api_key
    
    if request.provider == "gemini":
        if not api_key:
            api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=400, detail="Gemini API Key is missing.")
        
        try:
            genai.configure(api_key=api_key)
            model_name = request.model or "gemini-1.5-flash"
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=SYSTEM_PROMPT
            )
            # Query Gemini
            response = model.generate_content(request.message)
            return response.text.strip()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")

    else:  # Default to OpenAI
        if not api_key:
            api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=400, detail="OpenAI API Key is missing. Please supply it in Settings.")
        
        try:
            client = OpenAI(api_key=api_key)
            model_name = request.model or "gpt-4o-mini"
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": request.message}
                ],
                max_tokens=150,
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")

def synthesize_speech(text: str, request: ChatRequest) -> str:
    """Synthesizes speech to Base64 encoded audio string."""
    audio_base64 = ""
    
    if request.tts_provider == "openai":
        api_key = request.api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            # Fall back to free google TTS if key missing
            request.tts_provider = "google"
        else:
            try:
                client = OpenAI(api_key=api_key)
                voice = request.tts_voice or "alloy"
                response = client.audio.speech.create(
                    model="tts-1",
                    voice=voice,
                    input=text
                )
                # Read audio bytes
                audio_bytes = response.content
                encoded = base64.b64encode(audio_bytes).decode("utf-8")
                return f"data:audio/mp3;base64,{encoded}"
            except Exception as e:
                # If OpenAI TTS fails, fallback to google
                print(f"OpenAI TTS failed: {e}. Falling back to Google TTS.")
                request.tts_provider = "google"

    # Default/Fallback: Google TTS (gTTS is completely free and server-less)
    try:
        tts = gTTS(text=text, lang="en", slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        audio_bytes = fp.read()
        encoded = base64.b64encode(audio_bytes).decode("utf-8")
        return f"data:audio/mp3;base64,{encoded}"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis error: {str(e)}")

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # 1. Get raw text response from LLM
    raw_response = generate_llm_response(request)

    # 2. Parse emotion tag (e.g., "[face:joy]")
    emotion = "neutral"
    clean_text = raw_response
    
    # Matches [face:xxx]
    match = re.search(r"\[face:(\w+)\]", raw_response, re.IGNORECASE)
    if match:
        emotion = match.group(1).lower()
        # Remove the tag from the final spoken text
        clean_text = re.sub(r"\[face:\w+\]", "", raw_response, flags=re.IGNORECASE).strip()
    
    # Standardize to supported VRM blendshapes
    supported_emotions = ["neutral", "joy", "angry", "sorrow", "fun"]
    if emotion not in supported_emotions:
        emotion = "neutral"

    # 3. Synthesize clean text to audio
    audio_data_url = synthesize_speech(clean_text, request)

    return ChatResponse(
        text=clean_text,
        emotion=emotion,
        audio=audio_data_url
    )

# Serve Frontend files statically if they exist
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
