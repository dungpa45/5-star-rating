import os
import re
import time
import json
import logging
import urllib.request
from functools import wraps
from flask import Blueprint, request, jsonify, render_template, session

logger = logging.getLogger(__name__)

RATE_LIMIT = 5
RATE_PERIOD = 60

youtube_review = Blueprint('youtube_review', __name__, url_prefix='/youtube')

SYSTEM_PROMPT = (
    "Bạn là chuyên gia viết bình luận YouTube tự nhiên, chân thực. "
    "Luôn viết như một người xem thật, không quảng cáo lộ liễu. "
    "Chỉ trả về nội dung bình luận cuối cùng, không giải thích quá trình suy nghĩ, không dùng thẻ <think>."
)

AVOID_WORDS = "tuyệt vời, xuất sắc, hoàn hảo, amazing, perfect, excellent"


def get_remote_addr():
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or 'unknown'


def rate_limited():
    ip = get_remote_addr()
    now = int(time.time())
    key = f"yt_rl_{ip}"
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
            return jsonify({'success': False, 'error': f'Quá nhiều yêu cầu. Thử lại sau {RATE_PERIOD} giây.'}), 429
        return f(*args, **kwargs)
    return decorated


def extract_video_id(url):
    m = re.search(r'(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else None


def get_video_title(video_id):
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(url, timeout=5) as r:
            data = json.loads(r.read())
            return data.get('title', '')
    except Exception as e:
        logger.warning(f"Could not fetch title for {video_id}: {e}")
        return ''


def generate_review(video_title, language, style, previous_review=None):
    from openai import OpenAI

    style_map = {
        'friendly': 'thân thiện, tự nhiên như đang nói chuyện với bạn bè',
        'professional': 'chuyên nghiệp, phân tích sâu như một nhà phê bình',
        'enthusiastic': 'nhiệt tình, hào hứng với nhiều cảm xúc tích cực',
        'concise': 'ngắn gọn súc tích trong 1-2 câu',
        'nostalgic': 'hoài niệm, cảm xúc, gợi nhớ kỷ niệm',
    }
    lang_map = {'vi': 'tiếng Việt', 'en': 'English'}
    persona_map = {
        'friendly': 'một người xem vừa xem xong và muốn chia sẻ cảm nhận thật',
        'professional': 'một nhà phê bình nội dung đang đánh giá chất lượng video',
        'enthusiastic': 'một người xem bị cuốn hút hoàn toàn bởi nội dung video',
        'concise': 'một người xem bận rộn muốn chia sẻ nhanh cảm nhận',
        'nostalgic': 'một người xem liên tưởng nội dung video với kỷ niệm cá nhân của mình',
    }

    is_vague = len(video_title.split()) <= 3 or re.search(r'#\d+|vlog|ep\.?\s*\d+', video_title, re.I)
    title_context = (
        f'tiêu đề: "{video_title}"' if not is_vague
        else f'tiêu đề: "{video_title}" (tiêu đề không rõ nội dung, hãy viết bình luận chung về trải nghiệm xem video thú vị)'
    )

    prompt = (
        f'Hãy viết một bình luận tích cực cho video YouTube có {title_context}.\n'
        f'- Viết với vai trò: {persona_map.get(style, persona_map["friendly"])}\n'
        f'- Ngôn ngữ: {lang_map.get(language, "tiếng Việt")}\n'
        f'- Phong cách: {style_map.get(style, "thân thiện")}\n'
        f'- Độ dài: {"rất ngắn, 1-2 câu" if style == "concise" else "3-5 câu"}\n'
        f'- Tránh dùng các từ sáo rỗng: {AVOID_WORDS}\n'
        '- Tự nhiên, chân thực như người xem thật, không quảng cáo lộ liễu\n'
    )
    if previous_review:
        prompt += f'\nLưu ý: Đây là lần viết lại. Bình luận trước là:\n"{previous_review}"\n'
        prompt += 'Hãy viết theo góc nhìn khác, không lặp lại ý hay cấu trúc câu của bình luận trên.\n'

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
    return re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()


@youtube_review.route('/')
def index():
    return render_template('youtube_review/index.html')


@youtube_review.route('/generate-review', methods=['POST'])
@limit_api
def generate_review_api():
    data = request.json
    youtube_url = (data.get('youtube_url') or '').strip()
    language = data.get('language', 'vi')
    style = data.get('style', 'friendly')
    previous_review = data.get('previous_review')

    video_id = extract_video_id(youtube_url)
    if not video_id:
        return jsonify({'success': False, 'error': 'URL YouTube không hợp lệ.'}), 400

    video_title = get_video_title(video_id) or youtube_url
    logger.info(f"Generating youtube review: {video_title} | lang={language} style={style}")

    try:
        review = generate_review(video_title, language, style, previous_review)
        session['yt_review'] = {'video_title': video_title, 'video_id': video_id, 'review': review}
        return jsonify({'success': True, 'video_title': video_title, 'video_id': video_id, 'review': review})
    except Exception as e:
        logger.error(f"AI error (youtube): {e}")
        return jsonify({'success': False, 'error': 'Không thể tạo bình luận lúc này. Vui lòng thử lại sau.'}), 500
