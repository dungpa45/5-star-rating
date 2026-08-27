import os
import re
import time
import logging
import urllib.parse
from functools import wraps
import requests
from flask import Blueprint, request, jsonify, render_template, session

logger = logging.getLogger(__name__)

RATE_LIMIT = 5
RATE_PERIOD = 60

map_review = Blueprint('map_review', __name__, url_prefix='/maps')

SYSTEM_PROMPT = (
    "Bạn là chuyên gia viết review Google Maps tự nhiên, chân thực. "
    "Luôn viết như một người thật đã trải nghiệm, không quảng cáo lộ liễu. "
    "Chỉ trả về nội dung review, không giải thích hay thêm tiêu đề."
)

CATEGORY_HINTS = {
    'restaurant': 'nhà hàng/quán ăn (đề cập món ăn, hương vị, phục vụ)',
    'cafe': 'quán cà phê (đề cập đồ uống, không gian, wifi/làm việc)',
    'hotel': 'khách sạn (đề cập phòng ốc, tiện nghi, vị trí)',
    'spa': 'spa/làm đẹp (đề cập dịch vụ, thư giãn, nhân viên)',
    'shop': 'cửa hàng/mua sắm (đề cập sản phẩm, giá cả, nhân viên)',
    'other': 'địa điểm (đề cập trải nghiệm chung)',
}

PERSONA_MAP = {
    'friendly': 'một khách hàng thân thiết đã đến lần thứ 2',
    'professional': 'một nhà phê bình ẩm thực/dịch vụ chuyên nghiệp',
    'enthusiastic': 'một người yêu thích khám phá địa điểm mới',
    'concise': 'một khách hàng bận rộn muốn chia sẻ nhanh',
    'nostalgic': 'một người đã từng đến đây nhiều năm trước và quay lại thăm',
}

AVOID_WORDS = "tuyệt vời, xuất sắc, hoàn hảo, amazing, perfect, excellent"

ERROR_PATTERNS = [
    "authentication error", "no api key", "api key", "auth",
    "rate limit", "too many requests", "quota exceeded",
    "i'm sorry", "i cannot", "i can't help",
    "access denied", "forbidden", "unauthorized",
    "service unavailable", "internal server error",
    "not available", "try again later",
]


def get_remote_addr():
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or 'unknown'


def rate_limited():
    ip = get_remote_addr()
    now = int(time.time())
    key = f"map_rl_{ip}"
    history = [t for t in session.get(key, []) if now - t < RATE_PERIOD]
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
            return jsonify({'success': False, 'error': f'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau {RATE_PERIOD} giây.'}), 429
        return f(*args, **kwargs)
    return decorated


def extract_place_name(url):
    try:
        if 'maps/place/' in url:
            parts = url.split('maps/place/')[1].split('/')
            return urllib.parse.unquote(re.sub(r'\+', ' ', parts[0]))
        elif '/maps?q=' in url:
            query = url.split('/maps?q=')[1].split(',')[0]
            return urllib.parse.unquote(re.sub(r'\+', ' ', query))
        return None
    except:
        return None


def is_valid_review(text):
    if not text or len(text.strip()) < 20:
        return False
    lower = text.lower()
    return not any(p in lower for p in ERROR_PATTERNS)


def is_google_maps_url(url):
    if 'google.com/maps' in url:
        return url
    elif 'maps.app.goo.gl' in url or 'goo.gl/maps' in url:
        try:
            res = requests.get(url, allow_redirects=True)
            if res.status_code == 200:
                return res.url
        except requests.RequestException as e:
            logger.error(f"Error fetching URL: {e}")
    return False


def create_ai_prompt(place_name, language, style, category='other', previous_review=None):
    language_names = {'vi': 'tiếng Việt', 'en': 'English'}
    style_descriptions = {
        'friendly': 'thân thiện, tự nhiên như đang nói chuyện với bạn bè',
        'professional': 'chuyên nghiệp, khách quan như một nhà phê bình',
        'enthusiastic': 'nhiệt tình, hào hứng với nhiều cảm xúc tích cực',
        'concise': 'ngắn gọn súc tích trong 1-2 câu',
        'nostalgic': 'hoài niệm, cảm xúc, gợi nhớ kỷ niệm và sự thay đổi theo thời gian',
    }

    prompt = f'Hãy viết một đánh giá 5 sao cho "{place_name}" trên Google Maps.\n'
    prompt += f'- Đây là một {CATEGORY_HINTS.get(category, CATEGORY_HINTS["other"])}\n'
    prompt += f'- Viết với vai trò: {PERSONA_MAP.get(style, PERSONA_MAP["friendly"])}\n'
    prompt += f'- Ngôn ngữ: {language_names.get(language, "tiếng Việt")}\n'
    prompt += f'- Phong cách: {style_descriptions.get(style, "thân thiện")}\n'
    prompt += f'- Độ dài: {"rất ngắn, 1-2 câu" if style == "concise" else "3-5 câu"}\n'
    prompt += f'- Tránh dùng các từ sáo rỗng: {AVOID_WORDS}\n'
    prompt += '- Thêm 1-2 chi tiết cụ thể phù hợp với loại địa điểm\n'
    prompt += '- Viết như trải nghiệm thực tế, không quảng cáo lộ liễu\n'
    prompt += '- Có thể thêm gợi ý nhỏ nhưng vẫn giữ tích cực\n'

    if previous_review:
        prompt += f'\nLưu ý: Đây là lần viết lại. Review trước là:\n"{previous_review}"\n'
        prompt += 'Hãy viết theo góc nhìn khác, không lặp lại ý hay cấu trúc câu của review trên.\n'

    return prompt


def generate_ai_review(place_name, language, style, category='other', previous_review=None):
    from openai import OpenAI

    prompt = create_ai_prompt(place_name, language, style, category, previous_review)
    client = OpenAI(
        base_url="https://api.orcarouter.ai/v1",
        api_key=os.environ.get("ORCAROUTER_API_KEY", ""),
    )
    response = client.chat.completions.create(
        model=os.environ.get("MODEL", "qwen/qwen3.8-27b-free"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.8,
    )
    content = response.choices[0].message.content
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
    if not is_valid_review(content):
        raise Exception("AI trả về nội dung không hợp lệ. Vui lòng thử lại.")
    return content


@map_review.route('/')
def index():
    return render_template('map_review/index.html')


@map_review.route('/generate-review', methods=['POST'])
@limit_api
def generate_review():
    data = request.json
    map_url = data.get('map_url', '')
    resolved = is_google_maps_url(map_url)
    if not resolved:
        logger.warning(f"Invalid Google Maps URL: {map_url}")
        return jsonify({'success': False, 'error': 'Vui lòng nhập đúng URL Google Maps.'}), 400

    language = data.get('language', 'vi')
    style = data.get('style', 'friendly')
    category = data.get('category', 'other')
    previous_review = data.get('previous_review')

    logger.info(f"Generating map review: url={resolved}, lang={language}, style={style}, category={category}")

    place_name = extract_place_name(resolved) or "địa điểm này"

    try:
        review = generate_ai_review(place_name, language, style, category, previous_review)
        logger.info(f"Generated map review for '{place_name}'")
        session['map_review'] = {'place_name': place_name, 'review': review}
        return jsonify({'success': True, 'place_name': place_name, 'review': review})
    except Exception as e:
        logger.error(f"AI error (map): {e}")
        return jsonify({'success': False, 'error': 'Không thể tạo đánh giá lúc này. Vui lòng thử lại sau.'}), 500


@map_review.route('/get-session-review', methods=['GET'])
def get_session_review():
    review_data = session.get('map_review')
    if review_data:
        return jsonify({'success': True, **review_data})
    return jsonify({'success': False, 'error': 'No review found in session.'}), 404
