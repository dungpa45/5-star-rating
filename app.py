from flask import Flask, render_template, request, jsonify, session, g
from g4f.client import Client
from g4f.Provider import PollinationsAI, Yqcloud, Perplexity, CohereForAI_C4AI_Command, DeepInfra, OperaAria
import re
import time
import urllib.parse
import logging
from logging.handlers import RotatingFileHandler
from functools import wraps
import hashlib
import requests

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Replace with a secure random key in production

# Logging setup
handler = RotatingFileHandler('app.log', maxBytes=1000000, backupCount=3)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s : %(message)s',
    handlers=[handler]
)
logger = logging.getLogger(__name__)

# --- Rate limiting setup ---
RATE_LIMIT = 5  # max requests
RATE_PERIOD = 60  # seconds

def get_remote_addr():
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or 'unknown'

def rate_limited():
    ip = get_remote_addr()
    now = int(time.time())
    key = f"rl_{ip}"
    history = session.get(key, [])
    # Remove old timestamps
    history = [t for t in history if now - t < RATE_PERIOD]
    if len(history) >= RATE_LIMIT:
        return True
    history.append(now)
    session[key] = history
    session.modified = True
    return False

def limit_api(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if rate_limited():
            logger.warning(f"Rate limit exceeded for {get_remote_addr()}")
            return jsonify({
                'success': False,
                'error': f'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau {RATE_PERIOD} giây.'
            }), 429
        return f(*args, **kwargs)
    return decorated

# Hàm trích xuất tên địa điểm từ URL
def extract_place_name(url):
    try:
        if 'maps/place/' in url:
            parts = url.split('maps/place/')[1].split('/')
            name = re.sub(r'\+', ' ', parts[0])
            return urllib.parse.unquote(name)
        elif '/maps?q=' in url:
            query = url.split('/maps?q=')[1].split(',')[0]
            name = re.sub(r'\+', ' ', query)
            return urllib.parse.unquote(name)
        return None
    except:
        return None

PROVIDERS = [PollinationsAI, Perplexity, Yqcloud, CohereForAI_C4AI_Command, DeepInfra, OperaAria]

ERROR_PATTERNS = [
    "authentication error", "no api key", "api key", "auth",
    "rate limit", "too many requests", "quota exceeded",
    "i'm sorry", "i cannot", "i can't help",
    "access denied", "forbidden", "unauthorized",
    "service unavailable", "internal server error",
    "not available", "try again later",
]

def is_valid_review(text):
    if not text or len(text.strip()) < 20:
        return False
    lower = text.lower()
    return not any(p in lower for p in ERROR_PATTERNS)

def generate_ai_review(place_name, language, style):
    prompt = create_ai_prompt(place_name, language, style)
    for provider in PROVIDERS:
        start = time.time()
        try:
            client = Client(provider=provider)
            response = client.chat.completions.create(
                model='openai',
                messages=[{"role": "user", "content": prompt}]
            )
            elapsed = round(time.time() - start, 2)
            content = response.choices[0].message.content
            model = getattr(response, 'model', 'unknown')
            if is_valid_review(content):
                logger.info(f"Provider {provider.__name__} | model={model} | time={elapsed}s")
                return content
            logger.warning(f"Provider {provider.__name__} | model={model} | time={elapsed}s | invalid response: {content[:100]}")
        except Exception as e:
            elapsed = round(time.time() - start, 2)
            logger.warning(f"Provider {provider.__name__} | time={elapsed}s | error: {e}")
        continue
    raise Exception("Tất cả provider AI đều không khả dụng. Vui lòng thử lại sau.")

def create_ai_prompt(place_name, language, style):
    language_names = {
        'vi': "tiếng Việt",
        'en': "English"
    }
    
    style_descriptions = {
        'friendly': "thân thiện, tự nhiên như đang nói chuyện với bạn bè",
        'professional': "chuyên nghiệp, khách quan như một nhà phê bình",
        'enthusiastic': "nhiệt tình, hào hứng với nhiều cảm xúc tích cực",
        'concise': "ngắn gọn súc tích trong 1-2 câu"
    }
    
    prompt = f'Hãy viết một đánh giá 5 sao cho "{place_name}" trên Google Maps với các yêu cầu sau:\n'
    prompt += f'- Ngôn ngữ: {language_names.get(language, "tiếng Việt")}\n'
    prompt += f'- Phong cách: {style_descriptions.get(style, "thân thiện")}\n'
    prompt += f'- Độ dài: {"rất ngắn" if style == "concise" else "trung bình 3-5 câu"}'
    
    prompt += '\n\nYêu cầu: \n'
    prompt += '1. Đảm bảo tự nhiên, không lặp lại máy móc\n'
    prompt += '2. Nhấn mạnh ưu điểm nhưng không quá chung chung\n'
    prompt += '3. Có thể thêm 1-2 chi tiết cụ thể (món ngon, dịch vụ tốt, không gian đẹp...)\n'
    prompt += '4. Viết như trải nghiệm thực tế của bản thân, tránh quá chung chung hoặc quảng cáo lộ liễu.\n'
    prompt += '5. Nếu phù hợp, có thể thêm một gợi ý nhỏ để địa điểm hoàn thiện hơn (nhưng vẫn giữ đánh giá 5 sao và tích cực).\n'
    prompt += '6. Viết để giúp người đọc Google Maps dễ hình dung về địa điểm.\n'
    return prompt

def extract_place_name_from_prompt(prompt):
    match = re.search(r'cho "([^"]+)"', prompt)
    return match.group(1) if match else "địa điểm này"

def is_google_maps_url(url):
    if 'google.com/maps' in url:
        return url
    elif 'maps.app.goo.gl' in url or 'goo.gl/maps' in url:
        # Handle shortened URLs
        try:
            res = requests.get(url, allow_redirects=True)
            if res.status_code == 200:
                return res.url
        except requests.RequestException as e:
            logger.error(f"Error fetching URL: {e}")
            return False
    else:
        return False

# Simple in-memory cache (dictionary)
# REVIEW_CACHE = {}
# CACHE_TTL = 3600  # seconds

# def make_cache_key(place_name, language, style):
#     key_str = f"{place_name}|{language}|{style}"
#     return hashlib.sha256(key_str.encode()).hexdigest()

# def get_cached_review(place_name, language, style):
#     key = make_cache_key(place_name, language, style)
#     entry = REVIEW_CACHE.get(key)
#     if entry:
#         review, timestamp = entry
#         if time.time() - timestamp < CACHE_TTL:
#             return review
#         else:
#             del REVIEW_CACHE[key]
#     return None

# def set_cached_review(place_name, language, style, review):
#     key = make_cache_key(place_name, language, style)
#     REVIEW_CACHE[key] = (review, time.time())

# Route chính
@app.route('/',methods=["GET","POST"])
def index():
    return render_template('index.html')

# API tạo đánh giá
@app.route('/generate-review', methods=['POST'])
@limit_api
def generate_review():
    data = request.json
    map_url = data.get('map_url')
    # Validate Google Maps URL
    if not is_google_maps_url(map_url):
        logger.warning(f"Invalid Google Maps URL: {map_url}")
        return jsonify({
            'success': False,
            'error': 'Vui lòng nhập đúng URL Google Maps.'
        }), 400
    else:
        map_url = is_google_maps_url(map_url)
    language = data.get('language', 'vi')
    style = data.get('style', 'friendly')

    logger.info(f"Received /generate-review request: url={map_url}, lang={language}, style={style}")
    
    # Trích xuất tên địa điểm
    place_name = extract_place_name(map_url) or "địa điểm này"

    # Check cache first
    # cached_review = get_cached_review(place_name, language, style)
    # if cached_review:
    #     logger.info(f"Cache hit for '{place_name}'")
    #     session['review'] = {
    #         'place_name': place_name,
    #         'review': cached_review
    #     }
    #     return jsonify({
    #         'success': True,
    #         'place_name': place_name,
    #         'review': cached_review
    #     })

    # Tạo đánh giá bằng AI (async)
    try:
        review = generate_ai_review(place_name, language, style)
        logger.info(f"Generated review for '{place_name}'")
        # set_cached_review(place_name, language, style, review)
        session['review'] = {
            'place_name': place_name,
            'review': review
        }
    except Exception as e:
        logger.error(f"AI error for '{place_name}': {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Lỗi AI: {str(e)}'
        }), 500
    
    return jsonify({
        'success': True,
        'place_name': place_name,
        'review': review
    })

@app.route('/get-session-review', methods=['GET'])
def get_session_review():
    review_data = session.get('review')
    if review_data:
        return jsonify({'success': True, **review_data})
    else:
        return jsonify({'success': False, 'error': 'No review found in session.'}), 404

if __name__ == '__main__':
    app.run(debug=True,host="0.0.0.0",port=3000)