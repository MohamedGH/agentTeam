from google.genai import types

MODEL_NAME = "gemini-3.6-flash"

GENERATE_CONFIG = types.GenerateContentConfig(
    http_options=types.HttpOptions(
        retry_options=types.HttpRetryOptions(
            attempts=3,
            initial_delay=60,
            max_delay=180,
            exp_base=2,
        )
    )
)
