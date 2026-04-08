"""
Kiểm tra tình trạng hoạt động của các providers/models trong thư viện g4f.
Chạy: python3 check_providers.py
"""
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from g4f.client import Client
import g4f.Provider as P
from g4f.Provider import __all__ as all_provider_names

TEST_MESSAGE = [{"role": "user", "content": "Say hi in 5 words"}]
TIMEOUT = 30

# Lấy danh sách provider miễn phí (needs_auth=False, working=True)
def get_free_providers():
    providers = []
    skip = {"Custom", "Local", "Ollama", "CachedSearch", "MarkItDown",
            "PollinationsImage", "BlackForestLabs_Flux1Dev", "BlackForestLabs_Flux1KontextDev",
            "StabilityAI_SD35Large", "DeepseekAI_JanusPro7b", "Microsoft_Phi_4_Multimodal",
            "OpenAIFM", "BingCreateImages", "EdgeTTS", "gTTS", "Video", "YouTube",
            "GoogleSearch", "SearXNG", "HuggingFaceMedia"}
    for name in all_provider_names:
        if name in skip:
            continue
        cls = getattr(P, name, None)
        if cls and hasattr(cls, "needs_auth") and hasattr(cls, "working"):
            if not cls.needs_auth and cls.working:
                providers.append((name, cls))
    return providers


def test_provider(name, cls):
    """Test một provider, trả về (name, status, time, model, error)"""
    start = time.time()
    try:
        client = Client(provider=cls)
        response = client.chat.completions.create(
            model="",
            messages=TEST_MESSAGE,
            timeout=TIMEOUT,
        )
        text = response.choices[0].message.content.strip()
        elapsed = round(time.time() - start, 1)
        model = getattr(response, "model", "?")
        if text:
            return (name, "✅ OK", elapsed, model, text[:60])
        return (name, "⚠️ Empty", elapsed, model, "")
    except Exception as e:
        elapsed = round(time.time() - start, 1)
        err = str(e)[:80]
        return (name, "❌ FAIL", elapsed, "", err)


def main():
    providers = get_free_providers()
    print(f"Tìm thấy {len(providers)} provider miễn phí (needs_auth=False, working=True)")
    print(f"Đang kiểm tra song song (timeout={TIMEOUT}s)...\n")
    print(f"{'Provider':<25} {'Status':<12} {'Time':>6}  {'Model':<20} {'Response/Error'}")
    print("-" * 110)

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(test_provider, name, cls): name for name, cls in providers}
        for future in as_completed(futures):
            name, status, elapsed, model, detail = future.result()
            results.append((name, status, elapsed, model, detail))
            icon = status
            print(f"{name:<25} {icon:<12} {elapsed:>5}s  {str(model):<20} {detail}")

    # Tổng kết
    ok = [r for r in results if "OK" in r[1]]
    fail = [r for r in results if "FAIL" in r[1]]
    print(f"\n{'='*110}")
    print(f"Tổng kết: {len(ok)} hoạt động / {len(fail)} lỗi / {len(results)} tổng")
    if ok:
        print(f"\nProvider hoạt động (sắp xếp theo tốc độ):")
        for name, status, elapsed, model, detail in sorted(ok, key=lambda x: x[2]):
            print(f"  {name:<25} {elapsed:>5}s  model={model}")


if __name__ == "__main__":
    main()
