import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GEMINI_API_KEY")
print("API Key prefix:", key[:8] if key else "None")

try:
    from google import genai
    client = genai.Client(api_key=key)
    for m in ["gemini-2.5-flash-lite", "gemini-3.8-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
        try:
            r = client.models.generate_content(model=m, contents="Say OK")
            print(f"Model {m} SUCCESS: {r.text.strip()}")
            break
        except Exception as e:
            print(f"Model {m} failed: {type(e).__name__} - {e}")
except Exception as top_e:
    print("Top-level exception:", top_e)
