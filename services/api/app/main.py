from fastapi import FastAPI

app = FastAPI(title="TG Focus Filter API", version="0.1.0")


@app.get('/health')
def health():
    return {"ok": True}
